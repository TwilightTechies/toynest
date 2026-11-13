import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConflictError } from "../errors";
import type { CartRepository } from "../ports/cart-repository";
import type { CheckoutOrderRepository, PaymentCharge, PaymentProvider, PaymentResult } from "../ports/checkout";
import type { Cart } from "./cart";
import type { Category } from "./category";
import { COD_MAX_MINOR, CheckoutDetailsSchema, normaliseIndianMobile, type CheckoutOrder, type PaymentStatus } from "./checkout";
import { createCheckoutService } from "./checkout-service";
import type { Product } from "./product";
import type { ShippingZone } from "./shipping";

const category: Category = { id: randomUUID(), slug: "toys", name: "Toys", requiredAttributes: [], visible: true, sortOrder: 0, menuLabel: null };
const product = (overrides: Partial<Product> = {}): Product => ({
  id: randomUUID(),
  slug: `p-${randomUUID().slice(0, 6)}`,
  name: "Wooden Train",
  description: "",
  categoryId: category.id,
  priceMinor: 59900,
  currency: "INR",
  status: "active",
  attributes: {},
  createdAt: new Date().toISOString(),
  ...overrides,
});
const metro: ShippingZone = {
  id: randomUUID(),
  slug: "metro",
  name: "Metro",
  feeMinor: 4900,
  freeOverMinor: 49900,
  pincodePrefixes: ["560"],
  isDefault: false,
};
const rest: ShippingZone = { ...metro, id: randomUUID(), slug: "rest", name: "Rest of India", feeMinor: 7900, freeOverMinor: 79900, pincodePrefixes: [], isDefault: true };

const details = {
  name: "Asha Rao",
  email: "Asha@Example.com ",
  phone: "+91 98765 43210",
  line1: "12 MG Road",
  line2: "",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};

function setup(catalog: Product[], opts: { zones?: ShippingZone[]; outcome?: PaymentResult["status"]; shown?: Category[] } = {}) {
  const carts = new Map<string, Cart>();
  const cartRepo = {
    async get(id: string) {
      return carts.get(id) ?? null;
    },
    async delete(id: string) {
      carts.delete(id);
    },
  } as unknown as CartRepository;

  const orders = new Map<string, CheckoutOrder & { token: string }>();
  const attempts = new Map<string, { orderId: string; status: string; reference: string | null }>();
  let number = 20000;
  const orderRepo: CheckoutOrderRepository = {
    async place(draft) {
      const existing = [...orders.values()].find((o) => o.token === draft.checkoutToken);
      if (existing) return { order: existing, created: false };
      const order = {
        id: randomUUID(),
        token: draft.checkoutToken,
        orderNumber: `TN-${++number}`,
        status: draft.status,
        paymentMethod: draft.paymentMethod,
        paymentStatus: draft.paymentStatus,
        placedAt: new Date().toISOString(),
        cartId: draft.cartId,
        details: draft.details,
        subtotalMinor: draft.subtotalMinor,
        deliveryMinor: draft.deliveryMinor,
        totalMinor: draft.totalMinor,
        currency: draft.currency,
        zoneName: draft.zoneName,
        lines: draft.lines,
      };
      orders.set(order.id, order);
      return { order, created: true };
    },
    async get(id) {
      return orders.get(id) ?? null;
    },
    async startPayment(orderId) {
      if ([...attempts.values()].some((a) => a.orderId === orderId && (a.status === "started" || a.status === "pending"))) throw new ConflictError();
      const id = randomUUID();
      attempts.set(id, { orderId, status: "started", reference: null });
      return id;
    },
    async finishPayment(id, outcome) {
      attempts.set(id, { ...attempts.get(id)!, status: outcome.status, reference: outcome.reference });
    },
    async pendingAttempt(orderId) {
      const [id, a] = [...attempts].find(([, a]) => a.orderId === orderId && a.status === "pending") ?? [];
      return id && a?.reference ? { attemptId: id, reference: a.reference } : null;
    },
    async setPayment(orderId, change, from) {
      const order = orders.get(orderId);
      if (!order || !from.includes(order.paymentStatus as PaymentStatus)) return false;
      Object.assign(order, change);
      return true;
    },
  };

  const charges: PaymentCharge[] = [];
  let pendingResolves = false;
  const payments: PaymentProvider = {
    name: "fake",
    async charge(charge) {
      charges.push(charge);
      const status = charge.testOutcome === "failure" ? "failed" : charge.testOutcome === "pending" ? "pending" : (opts.outcome ?? "succeeded");
      return { status, reference: `ref-${charges.length}`, failureReason: status === "failed" ? "Declined" : null };
    },
    async getStatus(reference) {
      return { status: pendingResolves ? "succeeded" : "pending", reference, failureReason: null };
    },
  };

  const service = createCheckoutService({
    carts: cartRepo,
    products: { findByIds: async (ids: string[]) => catalog.filter((p) => ids.includes(p.id)) } as never,
    categories: { list: async () => opts.shown ?? [category] },
    zones: { list: async () => opts.zones ?? [metro, rest] },
    orders: orderRepo,
    payments,
  });

  const addCart = (lines: { product: Product; quantity: number; name?: string }[]) => {
    const cart: Cart = {
      id: randomUUID(),
      pincode: null,
      lines: lines.map((l) => ({ id: randomUUID(), productId: l.product.id, quantity: l.quantity, personalisationName: l.name ?? null })),
    } as Cart;
    carts.set(cart.id, cart);
    return cart.id;
  };
  return { service, addCart, carts, orders, charges, attempts, resolvePending: () => (pendingResolves = true) };
}

const place = (s: ReturnType<typeof setup>, cartId: string, paymentMethod: string, token = randomUUID(), extra: Record<string, unknown> = {}) =>
  s.service.placeOrder({ cartId, checkoutToken: token, details: { ...details, ...extra }, paymentMethod });

describe("checkout details", () => {
  it("normalises Indian mobile numbers", () => {
    for (const raw of ["+91 98765 43210", "919876543210", "098765-43210", "9876543210"]) expect(normaliseIndianMobile(raw)).toBe("9876543210");
  });

  it("validates contact and address with readable messages", () => {
    const parsed = CheckoutDetailsSchema.safeParse({ ...details, phone: "12345", state: "Atlantis", pincode: "0123" });
    expect(parsed.success).toBe(false);
    const messages = parsed.error!.issues.map((i) => i.message);
    expect(messages).toContain("Enter a 10-digit Indian mobile number");
    expect(messages).toContain("Choose a state or union territory");
    expect(messages).toContain("Enter a 6-digit pincode");
  });
});

describe("checkout service", () => {
  it("COD: prices on the server, freezes the lines, confirms at once and clears the basket", async () => {
    const train = product();
    const s = setup([train]);
    const cartId = s.addCart([{ product: train, quantity: 2, name: "Aarav" }]);
    const result = await place(s, cartId, "cod");
    if (!result.ok) throw new Error(result.reason);
    expect(result.order).toMatchObject({
      status: "placed",
      paymentStatus: "cod_due",
      subtotalMinor: 119800,
      deliveryMinor: 0, // free over ₹499 in Metro
      totalMinor: 119800,
      zoneName: "Metro",
      lines: [{ productName: "Wooden Train", unitPriceMinor: 59900, quantity: 2, personalisationName: "Aarav" }],
    });
    expect(result.order.details).toMatchObject({ email: "asha@example.com", phone: "9876543210", line2: null });
    expect(s.carts.has(cartId)).toBe(false);
    // A later price change doesn't touch the stored order.
    train.priceMinor = 1;
    expect((await s.orders.get(result.order.id))!.totalMinor).toBe(119800);
  });

  it("the same checkout token gives the same order (double submit)", async () => {
    const train = product();
    const s = setup([train]);
    const cartId = s.addCart([{ product: train, quantity: 1 }]);
    const token = randomUUID();
    const first = await place(s, cartId, "online", token);
    const second = await place(s, cartId, "online", token);
    expect(first.ok && second.ok && first.order.id === second.order.id).toBe(true);
    expect(s.orders.size).toBe(1);
  });

  it("reports form errors per field", async () => {
    const s = setup([product()]);
    const result = await place(s, s.addCart([{ product: product(), quantity: 1 }]), "cheque", randomUUID(), { phone: "123" });
    expect(result).toMatchObject({ ok: false, reason: "invalid", fieldErrors: { phone: expect.any(String), paymentMethod: expect.any(String) } });
  });

  it("blocks checkout when something became unavailable (archived, or its category hidden)", async () => {
    const archived = product({ status: "archived" });
    const s = setup([archived]);
    expect(await place(s, s.addCart([{ product: archived, quantity: 1 }]), "cod")).toEqual({ ok: false, reason: "unavailable_items" });

    const hidden = product();
    const s2 = setup([hidden], { shown: [] });
    expect(await place(s2, s2.addCart([{ product: hidden, quantity: 1 }]), "cod")).toEqual({ ok: false, reason: "unavailable_items" });
  });

  it("needs a basket and a pincode we deliver to", async () => {
    const s = setup([product()], { zones: [metro] });
    expect(await place(s, randomUUID(), "cod")).toEqual({ ok: false, reason: "empty_basket" });
    const p = product();
    const s2 = setup([p], { zones: [metro] });
    expect(await place(s2, s2.addCart([{ product: p, quantity: 1 }]), "cod", randomUUID(), { pincode: "110001" })).toEqual({
      ok: false,
      reason: "no_delivery",
    });
  });

  it("offers COD only up to ₹10,000", async () => {
    const pricey = product({ priceMinor: COD_MAX_MINOR });
    const s = setup([pricey]);
    expect(await place(s, s.addCart([{ product: pricey, quantity: 2 }]), "cod")).toEqual({ ok: false, reason: "cod_not_available" });
  });

  it("online success: placed + paid, basket cleared; paying again never charges twice", async () => {
    const p = product();
    const s = setup([p]);
    const cartId = s.addCart([{ product: p, quantity: 1 }]);
    const placed = await place(s, cartId, "online");
    if (!placed.ok) throw new Error(placed.reason);
    expect(placed.order).toMatchObject({ status: "awaiting_payment", paymentStatus: "pending" });
    expect(s.carts.has(cartId)).toBe(true);

    const paid = await s.service.pay(placed.order.id, "success");
    expect(paid).toMatchObject({ ok: true, order: { status: "placed", paymentStatus: "paid" } });
    expect(s.carts.has(cartId)).toBe(false);
    await s.service.pay(placed.order.id, "success");
    expect(s.charges).toHaveLength(1);
    expect(s.charges[0]).toMatchObject({ amountMinor: placed.order.totalMinor, orderNumber: placed.order.orderNumber });
  });

  it("online failure keeps the basket; retrying can succeed, or the shopper can switch to COD", async () => {
    const p = product();
    const s = setup([p]);
    const cartId = s.addCart([{ product: p, quantity: 1 }]);
    const placed = await place(s, cartId, "online");
    if (!placed.ok) throw new Error(placed.reason);
    expect(await s.service.pay(placed.order.id, "failure")).toMatchObject({ ok: true, order: { paymentStatus: "failed", status: "awaiting_payment" } });
    expect(s.carts.has(cartId)).toBe(true);
    expect(await s.service.pay(placed.order.id, "success")).toMatchObject({ ok: true, order: { paymentStatus: "paid" } });

    const cart2 = s.addCart([{ product: p, quantity: 1 }]);
    const second = await place(s, cart2, "online");
    if (!second.ok) throw new Error(second.reason);
    await s.service.pay(second.order.id, "failure");
    expect(await s.service.switchToCod(second.order.id)).toMatchObject({
      ok: true,
      order: { paymentMethod: "cod", paymentStatus: "cod_due", status: "placed" },
    });
    expect(s.carts.has(cart2)).toBe(false);
  });

  it("pending: blocks a second charge, then 'check status' settles it", async () => {
    const p = product();
    const s = setup([p]);
    const placed = await place(s, s.addCart([{ product: p, quantity: 1 }]), "online");
    if (!placed.ok) throw new Error(placed.reason);
    expect(await s.service.pay(placed.order.id, "pending")).toMatchObject({ ok: true, order: { paymentStatus: "pending" } });
    expect(await s.service.pay(placed.order.id, "success")).toEqual({ ok: false, reason: "payment_in_progress" });
    expect(await s.service.refreshPayment(placed.order.id)).toMatchObject({ ok: true, order: { paymentStatus: "pending" } });
    s.resolvePending();
    expect(await s.service.refreshPayment(placed.order.id)).toMatchObject({ ok: true, order: { paymentStatus: "paid", status: "placed" } });
    expect(s.charges).toHaveLength(1);
  });

  it("COD orders can't be 'paid' online", async () => {
    const p = product();
    const s = setup([p]);
    const placed = await place(s, s.addCart([{ product: p, quantity: 1 }]), "cod");
    if (!placed.ok) throw new Error(placed.reason);
    expect(await s.service.pay(placed.order.id, "success")).toEqual({ ok: false, reason: "not_payable" });
  });
});
