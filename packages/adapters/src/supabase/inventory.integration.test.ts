// Stock and product deletion against the real project (ADR-023): place_order() reduces stock in the
// order's transaction, refuses to oversell (writing nothing), lets exactly one of two parallel
// checkouts take the last unit, never double-decrements a replayed token and leaves untracked products
// alone. Admins may delete only never-ordered products (trigger), only with the current version, and
// nobody else may delete at all (RLS). Skipped unless SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// SUPABASE_ANON_KEY are set. Creates its own products and admin; removes them afterwards.
import { randomBytes, randomUUID } from "node:crypto";
import { ConflictError, HasOrdersError, OutOfStockError, type OrderDraft } from "@toynest/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminContext, type SessionCookieJar } from "./admin-session";
import { createSupabaseCheckoutRepository } from "./checkout-repository";
import { createSupabaseClient, readSupabaseEnv, type SupabaseClient } from "./client";
import { createSupabaseInventoryRepository } from "./inventory-repository";

const env = readSupabaseEnv();
const ready = !!env?.SUPABASE_ANON_KEY;
const EMAIL = "inventory-test@example.com";

describe.skipIf(!ready)("Stock at order placement and product deletion (ADR-023)", () => {
  const run = randomUUID().slice(0, 8);
  let service: SupabaseClient;
  let categoryId: string;
  let admin: ReturnType<typeof createSupabaseAdminContext>;
  let adminUserId: string | undefined;
  const productIds: string[] = [];

  const newProduct = async (stock: number | null, label: string) => {
    const result = await service
      .from("products")
      .insert({
        slug: `inv-${label}-${run}`,
        name: `Inventory ${label} ${run}`,
        description: "Integration test product.",
        category_id: categoryId,
        price_minor: 10000,
        currency: "INR",
        status: "active",
        attributes: {},
        stock,
      })
      .select("id, slug, name")
      .single();
    if (result.error) throw result.error;
    productIds.push(result.data.id);
    return result.data as { id: string; slug: string; name: string };
  };

  const stockOf = async (id: string) => {
    const row = await service.from("products").select("stock").eq("id", id).single();
    if (row.error) throw row.error;
    return row.data.stock as number | null;
  };

  const ordersWithToken = async (token: string) => {
    const rows = await service.from("orders").select("id").eq("checkout_token", token);
    if (rows.error) throw rows.error;
    return rows.data.length;
  };

  const draft = (lines: { product: { id: string; slug: string; name: string }; quantity: number }[], token = randomUUID()): OrderDraft => ({
    checkoutToken: token,
    cartId: randomUUID(),
    customerId: null,
    details: { name: "Stock Tester", email: EMAIL, phone: "9876543210", line1: "1 Test Street", line2: null, city: "Bengaluru", state: "Karnataka", pincode: "560001" },
    paymentMethod: "cod",
    status: "placed",
    paymentStatus: "cod_due",
    subtotalMinor: 10000,
    deliveryMinor: 0,
    totalMinor: 10000,
    currency: "INR",
    zoneName: "Metro",
    lines: lines.map(({ product, quantity }) => ({
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      unitPriceMinor: 10000,
      quantity,
      personalisationName: null,
    })),
  });

  const orders = () => createSupabaseCheckoutRepository(service, "mock");

  beforeAll(async () => {
    service = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 20000 });
    const category = await service.from("categories").select("id").eq("slug", "small-toys").single();
    if (category.error) throw category.error;
    categoryId = category.data.id;

    const email = `inventory-admin-${run}@example.com`;
    const password = randomBytes(24).toString("base64url");
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    adminUserId = created.data.user.id;
    await service.from("admin_users").insert({ auth_user_id: adminUserId });
    const store = new Map<string, string>();
    const cookies: SessionCookieJar = {
      getAll: () => [...store].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? store.set(name, value) : store.delete(name))),
    };
    admin = createSupabaseAdminContext({ url: env!.SUPABASE_URL, anonKey: env!.SUPABASE_ANON_KEY!, cookies, secureCookies: false });
    expect(await admin.session.signIn(email, password)).toBe(true);
  });

  afterAll(async () => {
    if (!service) return;
    await service.from("orders").delete().eq("contact_email", EMAIL); // lines cascade
    if (productIds.length) await service.from("products").delete().in("id", productIds);
    if (adminUserId) await service.auth.admin.deleteUser(adminUserId);
  });

  it("reduces stock by the summed quantity of all lines for the product", async () => {
    const kite = await newProduct(5, "sum");
    await orders().place(draft([{ product: kite, quantity: 2 }, { product: kite, quantity: 1 }]));
    expect(await stockOf(kite.id)).toBe(2);
  });

  it("refuses to oversell and writes nothing, not even for the other lines", async () => {
    const few = await newProduct(1, "few");
    const plenty = await newProduct(10, "plenty");
    const order = draft([{ product: plenty, quantity: 3 }, { product: few, quantity: 2 }]);
    const failure = await orders().place(order).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(OutOfStockError);
    expect((failure as OutOfStockError).productId).toBe(few.id);
    expect(await stockOf(few.id)).toBe(1);
    expect(await stockOf(plenty.id)).toBe(10);
    expect(await ordersWithToken(order.checkoutToken)).toBe(0);
  });

  it("lets exactly one of two parallel checkouts take the last unit", async () => {
    const last = await newProduct(1, "last");
    const results = await Promise.allSettled([orders().place(draft([{ product: last, quantity: 1 }])), orders().place(draft([{ product: last, quantity: 1 }]))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(OutOfStockError);
    expect(await stockOf(last.id)).toBe(0);
  });

  it("a replayed checkout token (even in parallel) returns the same order and decrements once", async () => {
    const replay = await newProduct(3, "replay");
    const order = draft([{ product: replay, quantity: 1 }]);
    const [a, b] = await Promise.all([orders().place(order), orders().place(order)]);
    const c = await orders().place(order);
    expect(new Set([a.order.id, b.order.id, c.order.id]).size).toBe(1);
    expect(await stockOf(replay.id)).toBe(2);
  });

  it("leaves untracked products alone, and the shop reads levels", async () => {
    const free = await newProduct(null, "untracked");
    const tracked = await newProduct(7, "levels");
    await orders().place(draft([{ product: free, quantity: 4 }]));
    expect(await stockOf(free.id)).toBeNull();
    const levels = await createSupabaseInventoryRepository(service).levels([free.id, tracked.id, randomUUID(), "not-a-uuid"]);
    expect(levels).toEqual(new Map([[free.id, null], [tracked.id, 7]]));
  });

  it("admin: stock is saved with the product and rejected below zero by the database", async () => {
    const edited = await newProduct(null, "edit");
    const loaded = await admin.products.get(edited.id);
    if (!loaded) throw new Error("not found");
    const saved = await admin.products.update(
      edited.id,
      { name: loaded.name, slug: loaded.slug, description: loaded.description, categoryId: loaded.categoryId, priceMinor: loaded.priceMinor, attributes: loaded.attributes, stock: 9 },
      loaded.version,
    );
    expect(saved.stock).toBe(9);
    const negative = await service.from("products").update({ stock: -1 }).eq("id", edited.id);
    expect(negative.error?.code).toBe("23514"); // check_violation
  });

  it("admin: deletes a never-ordered product; ordered ones are refused by the database", async () => {
    const unordered = await newProduct(null, "delete-me");
    const ordered = await newProduct(null, "ordered");
    await orders().place(draft([{ product: ordered, quantity: 1 }]));

    expect(await admin.products.orderedAmong([unordered.id, ordered.id])).toEqual(new Set([ordered.id]));

    const toDelete = await admin.products.get(unordered.id);
    await admin.products.delete(unordered.id, toDelete!.version);
    expect(await admin.products.get(unordered.id)).toBeNull();

    const keep = await admin.products.get(ordered.id);
    await expect(admin.products.delete(ordered.id, keep!.version)).rejects.toBeInstanceOf(HasOrdersError);
    expect(await admin.products.get(ordered.id)).not.toBeNull();
  });

  it("admin: a stale version can't delete", async () => {
    const product = await newProduct(null, "stale");
    const loaded = await admin.products.get(product.id);
    await service.from("products").update({ description: "Edited elsewhere." }).eq("id", product.id);
    await expect(admin.products.delete(product.id, loaded!.version)).rejects.toBeInstanceOf(ConflictError);
    expect(await stockOf(product.id)).toBeNull(); // still there
  });

  it("RLS: the public key can't delete products", async () => {
    const product = await newProduct(null, "rls");
    const anonymous = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_ANON_KEY! });
    const result = await anonymous.from("products").delete().eq("id", product.id).select("id");
    expect(result.data ?? []).toHaveLength(0);
    expect(await stockOf(product.id)).toBeNull(); // still there
  });
});
