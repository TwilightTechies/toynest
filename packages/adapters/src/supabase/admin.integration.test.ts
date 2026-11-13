// Admin catalogue editing against the real database (ADR-016), through the same adapter the web app
// uses: @supabase/ssr with an in-memory cookie jar standing in for Next's cookies().
// Creates two throwaway users (random passwords, synthetic emails): one plain user, one admin.
// Skipped unless SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are set.
import { randomBytes, randomUUID } from "node:crypto";
import { ConflictError, SlugTakenError, type ProductInput } from "@toynest/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminContext, type SessionCookieJar, type SessionCookieOptions } from "./admin-session";
import { createSupabaseClient, readSupabaseEnv, type SupabaseClient } from "./client";

const env = readSupabaseEnv();
const ready = !!env?.SUPABASE_ANON_KEY;

function cookieJar() {
  const store = new Map<string, { value: string; options: SessionCookieOptions }>();
  const jar: SessionCookieJar = {
    getAll: () => [...store].map(([name, { value }]) => ({ name, value })),
    setAll: (cookies) => {
      for (const { name, value, options } of cookies) {
        if (value === "" || options.maxAge === 0) store.delete(name);
        else store.set(name, { value, options });
      }
    },
  };
  return { jar, store };
}

describe.skipIf(!ready)("Admin catalogue (RLS + optimistic concurrency)", () => {
  let service: SupabaseClient; // setup and cleanup only
  const run = randomUUID().slice(0, 8);
  const users: { id: string; email: string; password: string }[] = [];
  const productIds: string[] = [];
  let categoryId: string;

  const context = () => {
    const { jar, store } = cookieJar();
    const ctx = createSupabaseAdminContext({
      url: env!.SUPABASE_URL,
      anonKey: env!.SUPABASE_ANON_KEY!,
      cookies: jar,
      secureCookies: false,
      timeoutMs: 15000,
    });
    return { ...ctx, store };
  };

  async function createUser(label: string) {
    const email = `admin-test-${label}-${run}@example.com`;
    const password = randomBytes(24).toString("base64url");
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    const user = { id: created.data.user.id, email, password };
    users.push(user);
    return user;
  }

  const input = (overrides: Partial<ProductInput> = {}): ProductInput => ({
    name: `Admin test ${run}`,
    slug: `admin-test-${run}`,
    description: "",
    categoryId,
    priceMinor: 49900,
    attributes: {},
    ...overrides,
  });

  let plain: ReturnType<typeof context>;
  let admin: ReturnType<typeof context>;
  let adminUserId: string;

  beforeAll(async () => {
    service = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 15000 });
    // A fixed, seeded, shown category: "the first row" could be another test's hidden category
    // created at the same moment (test files run in parallel against one database).
    const category = await service.from("categories").select("id").eq("slug", "small-toys").single();
    if (category.error) throw new Error(`Run the seed first (${category.error.message})`);
    categoryId = (category.data as { id: string }).id;

    const plainUser = await createUser("plain");
    const adminUser = await createUser("admin");
    adminUserId = adminUser.id;
    const grant = await service.from("admin_users").insert({ auth_user_id: adminUser.id });
    if (grant.error) throw grant.error;

    plain = context();
    admin = context();
    expect(await plain.session.signIn(plainUser.email, plainUser.password)).toBe(true);
    expect(await admin.session.signIn(adminUser.email, adminUser.password)).toBe(true);
  });

  afterAll(async () => {
    if (!service) return;
    if (productIds.length > 0) await service.from("products").delete().in("id", productIds);
    for (const user of users) await service.auth.admin.deleteUser(user.id); // admin_users row cascades
  });

  it("signs in with httpOnly, lax cookies and rejects a wrong password", async () => {
    const options = [...admin.store.values()].map((cookie) => cookie.options);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((o) => o.httpOnly === true && o.sameSite === "lax")).toBe(true);
    expect(await context().session.signIn(users[0]!.email, "not-the-password")).toBe(false);
  });

  it("is_admin() is true only for a row in admin_users; signed out is simply false", async () => {
    expect(await admin.session.isAdmin()).toBe(true);
    expect(await plain.session.isAdmin()).toBe(false);
    expect(await context().session.isAdmin()).toBe(false);
    expect(await context().session.currentUser()).toBeNull();
    expect((await admin.session.currentUser())?.id).toBe(adminUserId);
  });

  it("an admin creates a draft, sees it in the admin list, and the public still can't", async () => {
    const created = await admin.products.create(input());
    productIds.push(created.id);
    expect(created).toMatchObject({ status: "draft", currency: "INR", priceMinor: 49900 });

    const { items } = await admin.products.list({ text: `test ${run}`, limit: 10, offset: 0 });
    expect(items.map((p) => p.id)).toContain(created.id);

    const anonymous = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_ANON_KEY! });
    expect((await anonymous.from("products").select("id").eq("id", created.id)).data).toEqual([]);
  });

  it("layer 4 on its own: a signed-in non-admin can't create, update or see drafts", async () => {
    await expect(plain.products.create(input({ slug: `admin-test-plain-${run}` }))).rejects.toThrow();

    const target = await admin.products.create(input({ slug: `admin-test-target-${run}` }));
    productIds.push(target.id);
    // The draft is invisible to them, so the update matches no row and nothing changes.
    expect(await plain.products.get(target.id)).toBeNull();
    await expect(plain.products.update(target.id, input({ slug: target.slug, name: "Hijacked" }), target.version)).rejects.toThrow(
      ConflictError,
    );
    expect((await admin.products.get(target.id))?.name).toBe(target.name);
  });

  it("a stale version is refused instead of overwriting the newer edit", async () => {
    const created = await admin.products.create(input({ slug: `admin-test-occ-${run}` }));
    productIds.push(created.id);

    const first = await admin.products.update(created.id, input({ slug: created.slug, name: "Tab one" }), created.version);
    expect(first.version).not.toBe(created.version);
    await expect(
      admin.products.update(created.id, input({ slug: created.slug, name: "Tab two" }), created.version),
    ).rejects.toThrow(ConflictError);
    expect((await admin.products.get(created.id))?.name).toBe("Tab one");

    const archived = await admin.products.setStatus(created.id, "archived", first.version);
    expect(archived.status).toBe("archived");
  });

  it("a duplicate slug becomes SlugTakenError", async () => {
    const existing = await admin.products.create(input({ slug: `admin-test-dup-${run}` }));
    productIds.push(existing.id);
    await expect(admin.products.create(input({ slug: existing.slug }))).rejects.toThrow(SlugTakenError);
  });

  it("there is no delete policy: even an admin can't delete a product", async () => {
    const created = await admin.products.create(input({ slug: `admin-test-nodelete-${run}` }));
    productIds.push(created.id);
    // A raw client signed in as the admin: the port has no delete, so go around it on purpose.
    const adminUser = users.find((user) => user.id === adminUserId)!;
    const raw = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_ANON_KEY!, timeoutMs: 15000 });
    expect((await raw.auth.signInWithPassword({ email: adminUser.email, password: adminUser.password })).error).toBeNull();
    await raw.from("products").delete().eq("id", created.id);
    expect(await admin.products.get(created.id)).not.toBeNull();
  });

  it("removing the admin_users row revokes access on the very next request", async () => {
    const created = await admin.products.create(input({ slug: `admin-test-revoke-${run}` }));
    productIds.push(created.id);
    await service.from("admin_users").delete().eq("auth_user_id", adminUserId);
    try {
      expect(await admin.session.isAdmin()).toBe(false);
      await expect(admin.products.create(input({ slug: `admin-test-revoked-${run}` }))).rejects.toThrow();
    } finally {
      await service.from("admin_users").insert({ auth_user_id: adminUserId });
    }
  });
});
