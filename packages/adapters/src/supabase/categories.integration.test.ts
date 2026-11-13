// Category management against the real project (ADR-018): hiding a category hides its products from
// search, the storefront category list and the public RLS read; admins only for writes; a category in
// use can't be deleted. Uses a throwaway admin, plain user, category and product, removed afterwards.
// Skipped unless SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are set.
import { randomBytes, randomUUID } from "node:crypto";
import { ConflictError } from "@toynest/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminContext, type SessionCookieJar } from "./admin-session";
import { createSupabaseClient, readSupabaseEnv, type SupabaseClient } from "./client";
import { createSupabaseRepositories } from "./repositories";

const env = readSupabaseEnv();
const ready = !!env?.SUPABASE_ANON_KEY;

function context() {
  const store = new Map<string, string>();
  const cookies: SessionCookieJar = {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => (value ? store.set(name, value) : store.delete(name))),
  };
  return createSupabaseAdminContext({ url: env!.SUPABASE_URL, anonKey: env!.SUPABASE_ANON_KEY!, cookies, secureCookies: false, timeoutMs: 20000 });
}

describe.skipIf(!ready)("Category visibility and admin (RLS)", () => {
  let service: SupabaseClient;
  let admin: ReturnType<typeof context>;
  let plain: ReturnType<typeof context>;
  const userIds: string[] = [];
  const run = randomUUID().slice(0, 8);
  let categoryId: string | undefined;
  let productId: string | undefined;
  const slug = `cat-test-${run}`;
  const productSlug = `cat-test-product-${run}`;

  async function user(label: string, isAdmin: boolean) {
    const email = `cat-test-${label}-${run}@example.com`;
    const password = randomBytes(24).toString("base64url");
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userIds.push(created.data.user.id);
    if (isAdmin) await service.from("admin_users").insert({ auth_user_id: created.data.user.id });
    const ctx = context();
    expect(await ctx.session.signIn(email, password)).toBe(true);
    return ctx;
  }

  const shop = () => createSupabaseRepositories(service);
  const anonymous = () => createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_ANON_KEY!, timeoutMs: 20000 });

  beforeAll(async () => {
    service = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 20000 });
    admin = await user("admin", true);
    plain = await user("plain", false);
  }, 60000);

  afterAll(async () => {
    if (!service) return;
    if (productId) await service.from("products").delete().eq("id", productId);
    if (categoryId) await service.from("categories").delete().eq("id", categoryId);
    for (const id of userIds) await service.auth.admin.deleteUser(id);
  });

  it("an admin creates a category: hidden, last in order, with a version", async () => {
    const before = await admin.categories.list();
    const created = await admin.categories.create({ name: `Cat test ${run}`, slug, menuLabel: "Season", requiredAttributes: ["size"] });
    categoryId = created.id;
    expect(created).toMatchObject({ visible: false, menuLabel: "Season", productCount: 0, requiredAttributes: ["size"] });
    expect(created.sortOrder).toBeGreaterThan(Math.max(...before.map((c) => c.sortOrder)));
    // The shop doesn't list a hidden category; the admin does.
    expect((await shop().categories.list()).some((c) => c.id === categoryId)).toBe(false);
    expect((await admin.categories.list()).some((c) => c.id === categoryId)).toBe(true);
  });

  it("layer 4 on its own: a non-admin can't create, change or delete categories", async () => {
    await expect(plain.categories.create({ name: "Nope", slug: `nope-${run}`, menuLabel: null, requiredAttributes: [] })).rejects.toThrow();
    const current = (await admin.categories.get(categoryId!))!;
    await expect(plain.categories.setVisible(categoryId!, true, current.version)).rejects.toThrow(ConflictError);
    await plain.categories.remove(categoryId!);
    expect(await admin.categories.get(categoryId!)).not.toBeNull();
  });

  it("a live product in a hidden category is out of search, the shop and the public read; showing it brings it back", async () => {
    const product = await admin.products.create({
      name: `Cat test product ${run}`,
      slug: productSlug,
      description: "",
      categoryId: categoryId!,
      priceMinor: 19900,
      attributes: { size: "10 cm" },
    });
    productId = product.id;
    await admin.products.setStatus(product.id, "active", product.version);

    const visibleTo = async () => ({
      search: (await shop().products.search({ text: `Cat test product ${run}`, limit: 10, offset: 0 })).items.some((p) => p.id === productId),
      byCategory: (await shop().products.search({ categoryId: categoryId!, limit: 10, offset: 0 })).total,
      publicRead: ((await anonymous().from("products").select("id").eq("id", productId!)).data ?? []).length,
      categoryListed: (await shop().categories.list()).some((c) => c.id === categoryId),
    });

    expect(await visibleTo()).toEqual({ search: false, byCategory: 0, publicRead: 0, categoryListed: false });

    let current = (await admin.categories.get(categoryId!))!;
    expect(current.productCount).toBe(1);
    current = await admin.categories.setVisible(categoryId!, true, current.version);
    expect(await visibleTo()).toEqual({ search: true, byCategory: 1, publicRead: 1, categoryListed: true });

    await admin.categories.setVisible(categoryId!, false, current.version);
    expect(await visibleTo()).toEqual({ search: false, byCategory: 0, publicRead: 0, categoryListed: false });
  });

  it("a category with products can't be deleted (the foreign key refuses it)", async () => {
    await expect(admin.categories.remove(categoryId!)).rejects.toThrow(ConflictError);
  });

  it("an empty category can be deleted", async () => {
    await service.from("products").delete().eq("id", productId!);
    productId = undefined;
    expect(await admin.categories.remove(categoryId!)).toBe(true);
    categoryId = undefined;
  });
});
