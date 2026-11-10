// Isolation layer 4: Row Level Security, proven against the real database.
// Creates two throwaway users (random passwords, synthetic emails), each with one order, signs in as
// user A with the PUBLIC key, and checks what the database itself lets A see and do.
// Skipped unless SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are set.
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseClient, readSupabaseEnv, type SupabaseClient } from "./client";
import { createSupabaseOrderRepository } from "./repositories";

const env = readSupabaseEnv();
const ready = !!env?.SUPABASE_ANON_KEY;

interface TestUser {
  authUserId: string;
  customerId: string;
  orderNumber: string;
  email: string;
  password: string;
}

describe.skipIf(!ready)("RLS (isolation layer 4)", () => {
  let admin: SupabaseClient; // service role: test setup and cleanup only
  let asA: SupabaseClient; // anon key + user A's session: subject to RLS
  let anonymous: SupabaseClient; // anon key, nobody signed in
  let a: TestUser;
  let b: TestUser;
  let draftProductId: string;
  const run = randomUUID().slice(0, 8);
  // Seeded orders use TN-10xx; test orders use TN-9xxx so they can never collide.
  const orderNumbers = new Set<string>();
  const nextOrderNumber = () => {
    let n: string;
    do n = `TN-${randomInt(9000, 10000)}`;
    while (orderNumbers.has(n));
    orderNumbers.add(n);
    return n;
  };

  async function createUser(label: string): Promise<TestUser> {
    const email = `rls-${label}-${run}@example.com`;
    const password = randomBytes(24).toString("base64url");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    const authUserId = created.data.user.id;

    const customer = await admin
      .from("customers")
      .insert({ name: `RLS test ${label}`, email, auth_user_id: authUserId })
      .select("id")
      .single();
    if (customer.error) throw customer.error;
    const customerId = (customer.data as { id: string }).id;

    const orderNumber = nextOrderNumber();
    const order = await admin
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_id: customerId,
        status: "placed",
        placed_at: new Date().toISOString(),
        total_minor: 1000,
        currency: "GBP",
      })
      .select("id")
      .single();
    if (order.error) throw order.error;
    const item = await admin.from("order_items").insert({
      order_id: (order.data as { id: string }).id,
      product_slug: "rls-test-item",
      product_name: "RLS test item",
      unit_price_minor: 1000,
      quantity: 1,
    });
    if (item.error) throw item.error;

    return { authUserId, customerId, orderNumber, email, password };
  }

  beforeAll(async () => {
    admin = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 15000 });
    a = await createUser("a");
    b = await createUser("b");

    const category = await admin.from("categories").select("id").limit(1).single();
    if (category.error) throw new Error(`Run the seed first (${category.error.message})`);
    const draft = await admin
      .from("products")
      .insert({
        slug: `rls-draft-${run}`,
        name: "RLS draft product",
        category_id: (category.data as { id: string }).id,
        price_minor: 100,
        currency: "GBP",
        status: "draft",
      })
      .select("id")
      .single();
    if (draft.error) throw draft.error;
    draftProductId = (draft.data as { id: string }).id;

    asA = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_ANON_KEY!, timeoutMs: 15000 });
    const signIn = await asA.auth.signInWithPassword({ email: a.email, password: a.password });
    if (signIn.error) throw signIn.error;
    anonymous = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_ANON_KEY!, timeoutMs: 15000 });
  });

  afterAll(async () => {
    if (!admin) return;
    for (const user of [a, b].filter(Boolean)) {
      // Deleting the customer's orders cascades to order_items.
      await admin.from("orders").delete().eq("customer_id", user.customerId);
      await admin.from("customers").delete().eq("id", user.customerId);
      await admin.auth.admin.deleteUser(user.authUserId);
    }
    if (draftProductId) await admin.from("products").delete().eq("id", draftProductId);
  });

  it("a signed-in user sees only their own orders, not B's and not the seeded demo orders", async () => {
    const { data, error } = await asA.from("orders").select("order_number");
    expect(error).toBeNull();
    expect((data ?? []).map((row) => row.order_number)).toEqual([a.orderNumber]);
  });

  it("asking for B's order by number returns nothing (no error that would confirm it exists)", async () => {
    const { data, error } = await asA.from("orders").select("order_number").eq("order_number", b.orderNumber);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("order lines and customer rows follow the same ownership", async () => {
    const items = await asA.from("order_items").select("product_slug, order_id");
    expect(items.data).toHaveLength(1);
    const customers = await asA.from("customers").select("email");
    expect((customers.data ?? []).map((row) => row.email)).toEqual([a.email]);
  });

  it("layer 4 holds even when layer 3 is bypassed: the repository asked for B's customer id gets nothing", async () => {
    const repo = createSupabaseOrderRepository(asA);
    expect(await repo.findForCustomer(b.customerId, b.orderNumber)).toBeNull();
    expect(await repo.findForCustomer(a.customerId, a.orderNumber)).toMatchObject({ id: a.orderNumber });
  });

  it("a signed-in user cannot write: inserts are rejected and updates change nothing", async () => {
    const insert = await asA.from("orders").insert({
      order_number: nextOrderNumber(),
      customer_id: a.customerId,
      status: "placed",
      placed_at: new Date().toISOString(),
      total_minor: 1,
      currency: "GBP",
    });
    expect(insert.error).not.toBeNull();

    // No UPDATE policy: the row is invisible to the update, so nothing changes (and no error).
    await asA.from("orders").update({ refunded_minor: 1000 }).eq("order_number", a.orderNumber);
    const check = await admin.from("orders").select("refunded_minor").eq("order_number", a.orderNumber).single();
    expect((check.data as { refunded_minor: number }).refunded_minor).toBe(0);
  });

  it("an anonymous visitor sees active products but no drafts, orders or customers", async () => {
    const products = await anonymous.from("products").select("id, status");
    expect(products.error).toBeNull();
    expect((products.data ?? []).length).toBeGreaterThan(0);
    expect((products.data ?? []).every((row) => row.status === "active")).toBe(true);
    expect((products.data ?? []).some((row) => row.id === draftProductId)).toBe(false);

    expect((await anonymous.from("orders").select("id")).data).toEqual([]);
    expect((await anonymous.from("customers").select("id")).data).toEqual([]);
  });
});
