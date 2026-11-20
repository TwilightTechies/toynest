// Customer accounts against the real database (ADR-022), through the adapters the web app uses.
// Throwaway users (random passwords, synthetic @example.com emails, +9199… test numbers) are created
// with the service role and removed afterwards. Skipped unless Supabase and the anon key are set.
// The mobile-code test also needs the Send SMS hook configured in the dashboard: TEST_PHONE_OTP=1.
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { CustomerUser, OrderDraft } from "@toynest/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseCheckoutRepository } from "./checkout-repository";
import { createSupabaseClient, readSupabaseEnv, type SupabaseClient } from "./client";
import { createSupabaseCustomerContext, createSupabaseCustomerProvisioning, CustomerProfileConflictError } from "./customer-session";
import { createSupabaseCartRepository } from "./repositories";
import type { SessionCookieJar, SessionCookieOptions } from "./session-client";
import { createSupabaseSmsOutbox, createSupabaseStoreSettingsAdmin } from "./store-settings";

const env = readSupabaseEnv();
const ready = !!env?.SUPABASE_ANON_KEY;

function cookieJar(): SessionCookieJar {
  const store = new Map<string, { value: string; options: SessionCookieOptions }>();
  return {
    getAll: () => [...store].map(([name, { value }]) => ({ name, value })),
    setAll: (cookies) => {
      for (const { name, value, options } of cookies) {
        if (value === "" || options.maxAge === 0) store.delete(name);
        else store.set(name, { value, options });
      }
    },
  };
}

const run = randomUUID().slice(0, 8);
const testEmail = (label: string) => `account-test-${label}-${run}@example.com`;

describe.skipIf(!ready)("Customer accounts (provisioning, RLS, settings, baskets)", () => {
  let service: SupabaseClient;
  const userIds: string[] = [];
  const customerIds: string[] = [];
  const orderIds: string[] = [];
  const cartIds: string[] = [];
  let product: { id: string; slug: string; name: string };

  const customerContext = () =>
    createSupabaseCustomerContext({ url: env!.SUPABASE_URL, anonKey: env!.SUPABASE_ANON_KEY!, cookies: cookieJar(), secureCookies: false, timeoutMs: 15000 });

  async function createUser(label: string) {
    const email = testEmail(label);
    const password = randomBytes(24).toString("base64url");
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `Test ${label}` } });
    if (created.error) throw created.error;
    userIds.push(created.data.user.id);
    const ctx = customerContext();
    expect(await ctx.session.signInWithPassword(email, password)).toBe(true);
    const user = (await ctx.session.currentUser())!;
    const customer = await createSupabaseCustomerProvisioning(service).ensureForUser(user);
    customerIds.push(customer.id);
    return { ctx, user, customer };
  }

  async function placeOrderFor(customerId: string) {
    const draft: OrderDraft = {
      checkoutToken: randomUUID(),
      cartId: randomUUID(),
      customerId,
      details: { name: "Account Test", email: testEmail("order"), phone: "9876543210", line1: "1 Test Street", line2: null, city: "Pune", state: "Maharashtra", pincode: "411001" },
      paymentMethod: "cod",
      status: "placed",
      paymentStatus: "cod_due",
      subtotalMinor: 49900,
      deliveryMinor: 0,
      totalMinor: 49900,
      currency: "INR",
      zoneName: "Rest of India",
      lines: [{ productId: product.id, productSlug: product.slug, productName: product.name, unitPriceMinor: 49900, quantity: 1, personalisationName: null }],
    };
    const { order } = await createSupabaseCheckoutRepository(service, "mock").place(draft);
    orderIds.push(order.id);
    return order;
  }

  beforeAll(async () => {
    service = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 15000 });
    // A fixed seeded product, never a parallel test's throwaway row.
    const row = await service.from("products").select("id, slug, name").eq("slug", "wooden-number-puzzle").single();
    if (row.error) throw new Error(`Run the seed first (${row.error.message})`);
    product = row.data as typeof product;
  });

  afterAll(async () => {
    if (!service) return;
    if (orderIds.length) await service.from("orders").delete().in("id", orderIds);
    if (cartIds.length) await service.from("carts").delete().in("id", cartIds);
    if (customerIds.length) await service.from("customers").delete().in("id", customerIds);
    await service.from("customers").delete().like("email", `account-test-%-${run}@example.com`);
    for (const id of userIds) await service.auth.admin.deleteUser(id);
  });

  it("creates the customer row once, with the confirmed email and the sign-up name", async () => {
    const { user, customer } = await createUser("profile");
    expect(customer).toMatchObject({ name: "Test profile", email: testEmail("profile"), phone: null });
    const again = await createSupabaseCustomerProvisioning(service).ensureForUser(user);
    expect(again.id).toBe(customer.id);
    // Two at once (two tabs signing in): still one row.
    const [a, b] = await Promise.all([
      createSupabaseCustomerProvisioning(service).ensureForUser(user),
      createSupabaseCustomerProvisioning(service).ensureForUser(user),
    ]);
    expect(a.id).toBe(customer.id);
    expect(b.id).toBe(customer.id);
  });

  it("never links an existing customer record by email (claiming is a future feature)", async () => {
    const email = testEmail("unlinked");
    const older = await service.from("customers").insert({ name: "Older record", email }).select("id").single();
    if (older.error) throw older.error;
    customerIds.push((older.data as { id: string }).id);
    const user: CustomerUser = { id: randomUUID(), email, phone: null, emailVerified: true, name: "Someone" };
    // A real auth user is needed for the foreign key; create one with this email.
    const created = await service.auth.admin.createUser({ email, password: randomBytes(24).toString("base64url"), email_confirm: true });
    if (created.error) throw created.error;
    userIds.push(created.data.user.id);
    await expect(createSupabaseCustomerProvisioning(service).ensureForUser({ ...user, id: created.data.user.id })).rejects.toBeInstanceOf(
      CustomerProfileConflictError,
    );
  });

  it("shows a customer only their own orders, even when asked for someone else's (layer 4 alone)", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const aliceOrder = await placeOrderFor(alice.customer.id);
    const bobOrder = await placeOrderFor(bob.customer.id);

    const mine = await alice.ctx.account.listOrders(alice.customer.id, 10);
    expect(mine.map((order) => order.orderNumber)).toEqual([aliceOrder.orderNumber]);
    expect(mine[0]!.lines).toHaveLength(1);
    expect((await alice.ctx.account.getOrder(alice.customer.id, aliceOrder.orderNumber))?.id).toBe(aliceOrder.id);

    // Layer 3 bypassed on purpose: Alice's session asks with Bob's customer id. RLS returns nothing.
    expect(await alice.ctx.account.listOrders(bob.customer.id, 10)).toEqual([]);
    expect(await alice.ctx.account.getOrder(bob.customer.id, bobOrder.orderNumber)).toBeNull();
    // And a signed-out visitor sees nothing at all.
    expect(await customerContext().account.listOrders(alice.customer.id, 10)).toEqual([]);
  });

  it("lets only admins change store settings, and a stale version changes nothing", async () => {
    await createUser("settings");
    const shopper = await signedInClient(testEmail("settings"));
    const before = await createSupabaseStoreSettingsAdmin(service).get();
    // A signed-in shopper (not an admin) can't flip the switch: RLS updates zero rows.
    expect(await createSupabaseStoreSettingsAdmin(shopper).setPhoneOtp(!before.phoneOtpEnabled, before.version)).toBe(false);
    expect(await createSupabaseStoreSettingsAdmin(service).get()).toEqual(before);
    // Nor read the sign-in codes.
    expect(await createSupabaseSmsOutbox(shopper).recent(5)).toEqual([]);
    // Optimistic concurrency (checked with the service role): an old version is refused.
    expect(await createSupabaseStoreSettingsAdmin(service).setPhoneOtp(!before.phoneOtpEnabled, "2000-01-01T00:00:00+00:00")).toBe(false);
  });

  it("claims a guest basket for one customer only", async () => {
    const carol = await createUser("carol");
    const dave = await createUser("dave");
    const carts = createSupabaseCartRepository(service);
    const cart = await carts.create();
    cartIds.push(cart.id);
    expect(await carts.claimForCustomer(cart.id, carol.customer.id)).toBe(true);
    expect(await carts.claimForCustomer(cart.id, carol.customer.id)).toBe(true); // already hers
    expect(await carts.claimForCustomer(cart.id, dave.customer.id)).toBe(false); // never someone else's
    expect((await carts.findForCustomer(carol.customer.id))?.id).toBe(cart.id);
    expect(await carts.findForCustomer(dave.customer.id)).toBeNull();
  });

  // A plain supabase-js client signed in as a throwaway user (password reset to a known value).
  async function signedInClient(email: string): Promise<SupabaseClient> {
    const users = await service.auth.admin.listUsers({ perPage: 200 });
    const user = users.data.users.find((u) => u.email === email);
    if (!user) throw new Error(`no user ${email}`);
    const password = randomBytes(24).toString("base64url");
    await service.auth.admin.updateUserById(user.id, { password });
    const client = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_ANON_KEY!, timeoutMs: 15000 });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
    return client;
  }
});

describe.skipIf(!ready || process.env.TEST_PHONE_OTP !== "1")("Mobile sign-in codes (Send SMS hook)", () => {
  let service: SupabaseClient;
  let original: boolean;
  const phone = `+9199${String(randomInt(0, 1e8)).padStart(8, "0")}`;

  const setEnabled = async (enabled: boolean) => {
    const settings = createSupabaseStoreSettingsAdmin(service);
    expect(await settings.setPhoneOtp(enabled, (await settings.get()).version)).toBe(true);
  };

  beforeAll(async () => {
    service = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 15000 });
    original = (await createSupabaseStoreSettingsAdmin(service).get()).phoneOtpEnabled;
  });

  afterAll(async () => {
    if (!service) return;
    await setEnabled(original);
    await service.from("sms_outbox").delete().eq("phone", phone);
    const users = await service.auth.admin.listUsers({ perPage: 200 });
    for (const user of users.data.users) if (`+${user.phone}` === phone) {
      await service.from("customers").delete().eq("auth_user_id", user.id);
      await service.auth.admin.deleteUser(user.id);
    }
  });

  it("refuses to send codes while the switch is off, even when the app's check is skipped", async () => {
    await setEnabled(false);
    const ctx = createSupabaseCustomerContext({ url: env!.SUPABASE_URL, anonKey: env!.SUPABASE_ANON_KEY!, cookies: cookieJar(), secureCookies: false, timeoutMs: 15000 });
    expect(await ctx.session.sendPhoneCode(phone)).toBe("disabled");
    expect(await createSupabaseSmsOutbox(service).latestFor(phone)).toBeNull();
  });

  it("sends a code to the outbox when on, and the code signs the shopper in", async () => {
    await setEnabled(true);
    const ctx = createSupabaseCustomerContext({ url: env!.SUPABASE_URL, anonKey: env!.SUPABASE_ANON_KEY!, cookies: cookieJar(), secureCookies: false, timeoutMs: 15000 });
    expect(await ctx.session.sendPhoneCode(phone)).toBe("sent");
    const sms = await createSupabaseSmsOutbox(service).latestFor(phone);
    expect(sms?.otp).toMatch(/^\d{6}$/);
    expect(await ctx.session.verifyPhoneCode(phone, "000000")).toBe(sms!.otp === "000000");
    expect(await ctx.session.verifyPhoneCode(phone, sms!.otp)).toBe(true);
    const user = await ctx.session.currentUser();
    expect(user).toMatchObject({ phone, email: null });
    const customer = await createSupabaseCustomerProvisioning(service).ensureForUser(user!);
    expect(customer).toMatchObject({ phone, email: null, name: "Customer" });
  });
});
