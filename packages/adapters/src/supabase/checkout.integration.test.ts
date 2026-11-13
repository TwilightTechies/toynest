// Checkout against the real project (ADR-019): place_order is atomic and idempotent on the checkout
// token, numbers come from the TN-2xxxx sequence, one open payment attempt per order, conditional
// payment moves, and guest orders/payments are invisible to the public key but visible to an admin.
// Skipped unless SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are set.
import { randomBytes, randomUUID } from "node:crypto";
import { ConflictError, type OrderDraft } from "@toynest/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminContext, type SessionCookieJar } from "./admin-session";
import { createSupabaseCheckoutRepository } from "./checkout-repository";
import { createSupabaseClient, readSupabaseEnv, type SupabaseClient } from "./client";

const env = readSupabaseEnv();
const ready = !!env?.SUPABASE_ANON_KEY;

describe.skipIf(!ready)("Checkout orders (place_order, payments, RLS)", () => {
  let service: SupabaseClient;
  const orderIds: string[] = [];
  const userIds: string[] = [];
  let product: { id: string; slug: string; name: string };

  const draft = (overrides: Partial<OrderDraft> = {}): OrderDraft => ({
    checkoutToken: randomUUID(),
    cartId: randomUUID(),
    details: {
      name: "Test Shopper",
      email: "checkout-test@example.com",
      phone: "9876543210",
      line1: "1 Test Street",
      line2: null,
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560001",
    },
    paymentMethod: "online",
    status: "awaiting_payment",
    paymentStatus: "pending",
    subtotalMinor: 59900,
    deliveryMinor: 4900,
    totalMinor: 64800,
    currency: "INR",
    zoneName: "Metro",
    lines: [{ productId: product.id, productSlug: product.slug, productName: product.name, unitPriceMinor: 59900, quantity: 1, personalisationName: "Diya" }],
    ...overrides,
  });

  const repo = () => createSupabaseCheckoutRepository(service, "mock");

  beforeAll(async () => {
    service = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 20000 });
    const row = await service.from("products").select("id, slug, name").eq("status", "active").limit(1).single();
    if (row.error) throw row.error;
    product = row.data as typeof product;
  });

  afterAll(async () => {
    if (!service) return;
    if (orderIds.length) await service.from("orders").delete().in("id", orderIds); // items + payments cascade
    // Also anything a failed test created before it could record the id.
    await service.from("orders").delete().eq("contact_email", "checkout-test@example.com");
    for (const id of userIds) await service.auth.admin.deleteUser(id);
  });

  it("places an order atomically with a TN-2xxxx number and frozen lines", async () => {
    const { order, created } = await repo().place(draft());
    orderIds.push(order.id);
    expect(created).toBe(true);
    expect(order.orderNumber).toMatch(/^TN-2\d{4,7}$/);
    expect(order).toMatchObject({ status: "awaiting_payment", paymentStatus: "pending", totalMinor: 64800, zoneName: "Metro" });
    expect(order.lines).toEqual([{ productSlug: product.slug, productName: product.name, unitPriceMinor: 59900, quantity: 1, personalisationName: "Diya" }]);
  });

  it("the same checkout token returns the same order, even for two requests at once", async () => {
    const d = draft();
    const [a, b] = await Promise.all([repo().place(d), repo().place(d)]);
    orderIds.push(a.order.id);
    expect(a.order.id).toBe(b.order.id);
    const count = await service.from("orders").select("id", { count: "exact", head: true }).eq("checkout_token", d.checkoutToken);
    expect(count.count).toBe(1);
  });

  it("the database refuses totals that don't add up, and an order with no lines", async () => {
    await expect(repo().place(draft({ totalMinor: 1 }))).rejects.toThrow();
    await expect(repo().place(draft({ lines: [] }))).rejects.toThrow();
  });

  it("only one open payment attempt per order; payment moves are conditional", async () => {
    const { order } = await repo().place(draft());
    orderIds.push(order.id);
    const attempt = await repo().startPayment(order.id, order.totalMinor);
    await expect(repo().startPayment(order.id, order.totalMinor)).rejects.toThrow(ConflictError);
    await repo().finishPayment(attempt, { status: "pending", reference: "mock_pending_1_x", failureReason: null });
    expect(await repo().pendingAttempt(order.id)).toEqual({ attemptId: attempt, reference: "mock_pending_1_x" });
    await repo().finishPayment(attempt, { status: "succeeded", reference: "mock_pending_1_x", failureReason: null });

    expect(await repo().setPayment(order.id, { status: "placed", paymentStatus: "paid" }, ["pending", "failed"])).toBe(true);
    // A late "failed" can't undo a payment that already succeeded.
    expect(await repo().setPayment(order.id, { status: "awaiting_payment", paymentStatus: "failed" }, ["pending", "failed"])).toBe(false);
    expect((await repo().get(order.id))?.paymentStatus).toBe("paid");
  });

  it("guest orders and payments are invisible to the public key, and place_order can't be called with it", async () => {
    const anonymous = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_ANON_KEY!, timeoutMs: 20000 });
    expect((await anonymous.from("orders").select("id").in("id", orderIds)).data).toEqual([]);
    expect((await anonymous.from("payments").select("id").in("order_id", orderIds)).data).toEqual([]);
    expect((await anonymous.rpc("place_order", { payload: {} })).error).not.toBeNull();
  });

  it("an admin sees the orders in the admin list", async () => {
    const email = `checkout-admin-${randomUUID().slice(0, 8)}@example.com`;
    const password = randomBytes(24).toString("base64url");
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userIds.push(created.data.user.id);
    await service.from("admin_users").insert({ auth_user_id: created.data.user.id });
    const store = new Map<string, string>();
    const cookies: SessionCookieJar = {
      getAll: () => [...store].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? store.set(name, value) : store.delete(name))),
    };
    const admin = createSupabaseAdminContext({ url: env!.SUPABASE_URL, anonKey: env!.SUPABASE_ANON_KEY!, cookies, secureCookies: false });
    expect(await admin.session.signIn(email, password)).toBe(true);
    const { items } = await admin.orders.list({ limit: 50, offset: 0 });
    const mine = items.filter((item) => orderIds.includes(item.id));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0]).toMatchObject({ customerName: "Test Shopper", itemCount: 1 });
  });
});
