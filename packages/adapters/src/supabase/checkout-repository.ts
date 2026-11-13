import {
  CheckoutOrderSchema,
  ConflictError,
  type AdminOrderRepository,
  type CheckoutOrder,
  type CheckoutOrderRepository,
} from "@toynest/core";
import { z } from "zod";
import type { SupabaseClient } from "./client";
import { toRepositoryError } from "./errors";

const UNIQUE_VIOLATION = "23505";

const CHECKOUT_ORDER_COLUMNS =
  "id, order_number, status, payment_method, payment_status, placed_at, cart_id, subtotal_minor, delivery_minor, " +
  "total_minor, currency, zone_name, contact_name, contact_email, contact_phone, address_line1, address_line2, city, " +
  "state, pincode, order_items(product_slug, product_name, unit_price_minor, quantity, personalisation_name, created_at)";

const CheckoutRowSchema = z.object({
  id: z.string(),
  order_number: z.string(),
  status: z.string(),
  payment_method: z.string(),
  payment_status: z.string(),
  placed_at: z.string(),
  cart_id: z.string().nullable(),
  subtotal_minor: z.number().int(),
  delivery_minor: z.number().int(),
  total_minor: z.number().int(),
  currency: z.string(),
  zone_name: z.string(),
  contact_name: z.string(),
  contact_email: z.string(),
  contact_phone: z.string(),
  address_line1: z.string(),
  address_line2: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  order_items: z.array(
    z.object({
      product_slug: z.string(),
      product_name: z.string(),
      unit_price_minor: z.number().int(),
      quantity: z.number().int(),
      personalisation_name: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
});

function toCheckoutOrder(row: unknown): CheckoutOrder {
  const r = CheckoutRowSchema.parse(row);
  return CheckoutOrderSchema.parse({
    id: r.id,
    orderNumber: r.order_number,
    status: r.status,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    placedAt: new Date(r.placed_at).toISOString(),
    cartId: r.cart_id,
    details: {
      name: r.contact_name,
      email: r.contact_email,
      phone: r.contact_phone,
      line1: r.address_line1,
      line2: r.address_line2,
      city: r.city,
      state: r.state,
      pincode: r.pincode,
    },
    subtotalMinor: r.subtotal_minor,
    deliveryMinor: r.delivery_minor,
    totalMinor: r.total_minor,
    currency: r.currency,
    zoneName: r.zone_name,
    lines: [...r.order_items]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((item) => ({
        productSlug: item.product_slug,
        productName: item.product_name,
        unitPriceMinor: item.unit_price_minor,
        quantity: item.quantity,
        personalisationName: item.personalisation_name,
      })),
  });
}

const isUuid = (value: string) => z.uuid().safeParse(value).success;

// ADR-019. Server-only (service-role client), like baskets: guest orders and payments are invisible
// to the public RLS roles. Every row is validated with Zod on the way out.
export function createSupabaseCheckoutRepository(client: SupabaseClient, providerName: string): CheckoutOrderRepository {
  async function get(orderId: string): Promise<CheckoutOrder | null> {
    if (!isUuid(orderId)) return null;
    const result = await client.from("orders").select(CHECKOUT_ORDER_COLUMNS).eq("id", orderId).not("checkout_token", "is", null).maybeSingle();
    if (result.error) throw toRepositoryError(result, "checkout.get");
    return result.data ? toCheckoutOrder(result.data) : null;
  }

  return {
    async place(draft) {
      const { details } = draft;
      // Informational only (the function itself is what makes a repeat safe): was this token used?
      const before = await client.from("orders").select("id").eq("checkout_token", draft.checkoutToken).maybeSingle();
      if (before.error) throw toRepositoryError(before, "checkout.place");
      const result = await client.rpc("place_order", {
        payload: {
          checkout_token: draft.checkoutToken,
          cart_id: draft.cartId,
          status: draft.status,
          payment_method: draft.paymentMethod,
          payment_status: draft.paymentStatus,
          subtotal_minor: draft.subtotalMinor,
          delivery_minor: draft.deliveryMinor,
          total_minor: draft.totalMinor,
          currency: draft.currency,
          zone_name: draft.zoneName,
          contact_name: details.name,
          contact_email: details.email,
          contact_phone: details.phone,
          address_line1: details.line1,
          address_line2: details.line2 ?? "",
          city: details.city,
          state: details.state,
          pincode: details.pincode,
          items: draft.lines.map((line) => ({
            product_id: line.productId,
            product_slug: line.productSlug,
            product_name: line.productName,
            unit_price_minor: line.unitPriceMinor,
            quantity: line.quantity,
            personalisation_name: line.personalisationName ?? "",
          })),
        },
      });
      if (result.error) throw toRepositoryError(result, "checkout.place");
      const id = z.uuid().parse(result.data);
      const order = await get(id);
      if (!order) throw new Error("checkout.place: order missing after insert");
      return { order, created: before.data === null };
    },

    get,

    async startPayment(orderId, amountMinor) {
      const result = await client
        .from("payments")
        .insert({ order_id: orderId, provider: providerName, amount_minor: amountMinor, status: "started" })
        .select("id")
        .single();
      if (result.error) {
        // payments_one_open_attempt: another attempt for this order is still open.
        if (result.error.code === UNIQUE_VIOLATION) throw new ConflictError("A payment is already in progress");
        throw toRepositoryError(result, "checkout.startPayment");
      }
      return z.object({ id: z.string() }).parse(result.data).id;
    },

    async finishPayment(attemptId, { status, reference, failureReason }) {
      const result = await client
        .from("payments")
        .update({ status, reference, failure_reason: failureReason })
        .eq("id", attemptId);
      if (result.error) throw toRepositoryError(result, "checkout.finishPayment");
    },

    async pendingAttempt(orderId) {
      const result = await client
        .from("payments")
        .select("id, reference")
        .eq("order_id", orderId)
        .eq("status", "pending")
        .not("reference", "is", null)
        .maybeSingle();
      if (result.error) throw toRepositoryError(result, "checkout.pendingAttempt");
      const row = z.object({ id: z.string(), reference: z.string() }).nullable().parse(result.data);
      return row ? { attemptId: row.id, reference: row.reference } : null;
    },

    async setPayment(orderId, { status, paymentStatus, paymentMethod }, from) {
      const result = await client
        .from("orders")
        .update({ status, payment_status: paymentStatus, ...(paymentMethod ? { payment_method: paymentMethod } : {}) })
        .eq("id", orderId)
        .in("payment_status", from)
        .select("id");
      if (result.error) throw toRepositoryError(result, "checkout.setPayment");
      return z.array(z.unknown()).parse(result.data).length === 1;
    },
  };
}

// Admin list (ADR-019): give it the admin's user-scoped client; RLS ("Admins read every order")
// decides what it can see.
export function createSupabaseAdminOrderRepository(client: SupabaseClient): AdminOrderRepository {
  const Row = z.object({
    id: z.string(),
    order_number: z.string(),
    placed_at: z.string(),
    total_minor: z.number().int(),
    currency: z.string(),
    status: z.enum(["awaiting_payment", "placed", "dispatched", "delivered", "cancelled"]),
    payment_method: z.enum(["online", "cod"]).nullable(),
    payment_status: z.enum(["pending", "paid", "failed", "cod_due"]).nullable(),
    contact_name: z.string().nullable(),
    customers: z.object({ name: z.string() }).nullable(),
    order_items: z.array(z.object({ quantity: z.number().int() })),
  });
  return {
    async list({ limit, offset }) {
      const result = await client
        .from("orders")
        .select(
          "id, order_number, placed_at, total_minor, currency, status, payment_method, payment_status, contact_name, customers(name), order_items(quantity)",
          { count: "exact" },
        )
        .order("placed_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (result.error) throw toRepositoryError(result, "adminOrders.list");
      const items = z
        .array(Row)
        .parse(result.data)
        .map((r) => ({
          id: r.id,
          orderNumber: r.order_number,
          placedAt: new Date(r.placed_at).toISOString(),
          customerName: r.contact_name ?? r.customers?.name ?? "Unknown",
          totalMinor: r.total_minor,
          currency: r.currency,
          status: r.status,
          paymentMethod: r.payment_method,
          paymentStatus: r.payment_status,
          itemCount: r.order_items.reduce((sum, item) => sum + item.quantity, 0),
        }));
      return { items, total: result.count ?? 0 };
    },
  };
}
