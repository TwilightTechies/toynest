import { ConflictError } from "../errors";
import type { CartRepository } from "../ports/cart-repository";
import type { CategoryRepository } from "../ports/category-repository";
import type { CheckoutOrderRepository, PaymentProvider, PaymentResult } from "../ports/checkout";
import type { ProductRepository } from "../ports/product-repository";
import type { ShippingZoneRepository } from "../ports/shipping-zone-repository";
import { markNotForSale, priceCart } from "./cart-pricing";
import {
  CheckoutDetailsSchema,
  COD_MAX_MINOR,
  PaymentMethodSchema,
  type CheckoutOrder,
  type OrderDraft,
} from "./checkout";
import { STORE_CURRENCY } from "./money";
import { resolveShippingZone } from "./shipping";

export type CheckoutFailure =
  // Field name -> message, for inline form errors.
  | { ok: false; reason: "invalid"; fieldErrors: Record<string, string> }
  | { ok: false; reason: "empty_basket" }
  // Something in the basket was archived or its category hidden since it was added.
  | { ok: false; reason: "unavailable_items" }
  | { ok: false; reason: "no_delivery" }
  | { ok: false; reason: "cod_not_available" }
  | { ok: false; reason: "not_found" }
  // A payment for this order is already in progress (another tab, a double click).
  | { ok: false; reason: "payment_in_progress" }
  | { ok: false; reason: "not_payable" };

export type CheckoutResult = { ok: true; order: CheckoutOrder } | CheckoutFailure;

export interface CheckoutDeps {
  carts: CartRepository;
  products: ProductRepository;
  // The shop's list: shown categories only (ADR-018).
  categories: CategoryRepository;
  zones: ShippingZoneRepository;
  orders: CheckoutOrderRepository;
  payments: PaymentProvider;
}

// Checkout rules (ADR-019). Prices come only from priceCart over the current product rows; nothing
// price-related is taken from the shopper's form.
export function createCheckoutService({ carts, products, categories, zones, orders, payments }: CheckoutDeps) {
  async function clearCart(cartId: string | null) {
    if (cartId) await carts.delete(cartId);
  }

  async function reload(orderId: string): Promise<CheckoutResult> {
    const order = await orders.get(orderId);
    return order ? { ok: true, order } : { ok: false, reason: "not_found" };
  }

  // Applies a gateway result to the attempt and the order. Moves are conditional on the payment
  // status, so a result that arrives twice (or late) can't undo a payment that already succeeded.
  async function applyResult(order: CheckoutOrder, attemptId: string, result: PaymentResult): Promise<void> {
    await orders.finishPayment(attemptId, result);
    if (result.status === "succeeded") {
      const moved = await orders.setPayment(order.id, { status: "placed", paymentStatus: "paid" }, ["pending", "failed"]);
      if (moved) await clearCart(order.cartId);
    } else if (result.status === "failed") {
      await orders.setPayment(order.id, { status: "awaiting_payment", paymentStatus: "failed" }, ["pending", "failed"]);
    } else {
      await orders.setPayment(order.id, { status: "awaiting_payment", paymentStatus: "pending" }, ["pending", "failed"]);
    }
  }

  return {
    async placeOrder(input: {
      cartId: string | null;
      checkoutToken: string;
      details: Record<string, unknown>;
      paymentMethod: unknown;
    }): Promise<CheckoutResult> {
      const parsed = CheckoutDetailsSchema.safeParse(input.details);
      const method = PaymentMethodSchema.safeParse(input.paymentMethod);
      if (!parsed.success || !method.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error?.issues ?? []) fieldErrors[String(issue.path[0])] ??= issue.message;
        if (!method.success) fieldErrors.paymentMethod = "Choose how you'd like to pay";
        return { ok: false, reason: "invalid", fieldErrors };
      }
      const details = parsed.data;

      const cart = input.cartId ? await carts.get(input.cartId) : null;
      if (!cart || cart.lines.length === 0) return { ok: false, reason: "empty_basket" };

      const [rows, shown, zoneList] = await Promise.all([
        products.findByIds([...new Set(cart.lines.map((line) => line.productId))]),
        categories.list(),
        zones.list(),
      ]);
      const zone = resolveShippingZone(details.pincode, zoneList);
      if (!zone) return { ok: false, reason: "no_delivery" };
      const priced = priceCart({
        lines: cart.lines,
        products: markNotForSale(rows, new Set(shown.map((category) => category.id))),
        zone,
      });
      if (priced.lines.some((line) => line.status === "unavailable")) return { ok: false, reason: "unavailable_items" };
      if (priced.itemCount === 0) return { ok: false, reason: "empty_basket" };
      if (method.data === "cod" && priced.totalMinor > COD_MAX_MINOR) return { ok: false, reason: "cod_not_available" };

      const cod = method.data === "cod";
      const draft: OrderDraft = {
        checkoutToken: input.checkoutToken,
        cartId: cart.id,
        details,
        paymentMethod: method.data,
        // COD orders are confirmed straight away; online ones wait for the payment.
        status: cod ? "placed" : "awaiting_payment",
        paymentStatus: cod ? "cod_due" : "pending",
        subtotalMinor: priced.subtotalMinor,
        deliveryMinor: priced.deliveryMinor ?? 0,
        totalMinor: priced.totalMinor,
        currency: STORE_CURRENCY,
        zoneName: zone.name,
        lines: priced.lines.flatMap((line) =>
          line.status === "ok"
            ? [
                {
                  productId: line.product.id,
                  productSlug: line.product.slug,
                  productName: line.product.name,
                  unitPriceMinor: line.unitPriceMinor,
                  quantity: line.line.quantity,
                  personalisationName: line.line.personalisationName,
                },
              ]
            : [],
        ),
      };

      const { order } = await orders.place(draft);
      if (order.paymentMethod === "cod") await clearCart(order.cartId);
      return { ok: true, order };
    },

    // Charges an online order. Already paid = no second charge, just the order back.
    async pay(orderId: string, testOutcome?: "success" | "failure" | "pending"): Promise<CheckoutResult> {
      const order = await orders.get(orderId);
      if (!order) return { ok: false, reason: "not_found" };
      if (order.paymentStatus === "paid") return { ok: true, order };
      if (order.paymentMethod !== "online" || order.paymentStatus === "cod_due") return { ok: false, reason: "not_payable" };
      if (order.paymentStatus === "pending" && (await orders.pendingAttempt(orderId))) {
        return { ok: false, reason: "payment_in_progress" };
      }

      let attemptId: string;
      try {
        attemptId = await orders.startPayment(orderId, order.totalMinor);
      } catch (error) {
        if (error instanceof ConflictError) return { ok: false, reason: "payment_in_progress" };
        throw error;
      }
      const result = await payments.charge({
        attemptId,
        orderNumber: order.orderNumber,
        amountMinor: order.totalMinor,
        currency: order.currency,
        testOutcome,
      });
      await applyResult(order, attemptId, result);
      return reload(orderId);
    },

    // "Check status" for a payment the bank hasn't confirmed yet.
    async refreshPayment(orderId: string): Promise<CheckoutResult> {
      const order = await orders.get(orderId);
      if (!order) return { ok: false, reason: "not_found" };
      if (order.paymentStatus !== "pending") return { ok: true, order };
      const attempt = await orders.pendingAttempt(orderId);
      if (!attempt) return { ok: true, order };
      const result = await payments.getStatus(attempt.reference);
      if (result.status !== "pending") await applyResult(order, attempt.attemptId, result);
      return reload(orderId);
    },

    // After a failed online payment: pay the courier instead (within the COD limit).
    async switchToCod(orderId: string): Promise<CheckoutResult> {
      const order = await orders.get(orderId);
      if (!order) return { ok: false, reason: "not_found" };
      if (order.paymentStatus !== "failed") return { ok: false, reason: "not_payable" };
      if (order.totalMinor > COD_MAX_MINOR) return { ok: false, reason: "cod_not_available" };
      const moved = await orders.setPayment(order.id, { status: "placed", paymentStatus: "cod_due", paymentMethod: "cod" }, ["failed"]);
      if (moved) await clearCart(order.cartId);
      return reload(orderId);
    },
  };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
