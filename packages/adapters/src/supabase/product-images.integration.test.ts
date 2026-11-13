// Product photos against the real project (ADR-017): Storage RLS, the table's RLS, the 8-photo cap in
// the database, public URLs and reorder. Creates a throwaway admin, a plain user and a draft product,
// and removes them (and every uploaded file) afterwards.
// Skipped unless SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are set.
import { randomBytes, randomUUID } from "node:crypto";
import { ConflictError, type ProcessedImage } from "@toynest/core";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSharpImageProcessor } from "../images/sharp-image-processor";
import { createSupabaseAdminContext, type SessionCookieJar } from "./admin-session";
import { createSupabaseClient, readSupabaseEnv, type SupabaseClient } from "./client";
import { createSupabaseProductImageRepository, PRODUCT_IMAGES_BUCKET } from "./product-image-repository";

const env = readSupabaseEnv();
const ready = !!env?.SUPABASE_ANON_KEY;

function signedInContext() {
  const store = new Map<string, string>();
  const cookies: SessionCookieJar = {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => (value ? store.set(name, value) : store.delete(name))),
  };
  return createSupabaseAdminContext({ url: env!.SUPABASE_URL, anonKey: env!.SUPABASE_ANON_KEY!, cookies, secureCookies: false, timeoutMs: 20000 });
}

describe.skipIf(!ready)("Product photos (Storage + RLS)", () => {
  let service: SupabaseClient;
  let admin: ReturnType<typeof signedInContext>;
  let plain: ReturnType<typeof signedInContext>;
  let productId: string;
  let rendition: { large: ProcessedImage; small: ProcessedImage };
  const userIds: string[] = [];
  const run = randomUUID().slice(0, 8);

  async function user(label: string, isAdmin: boolean) {
    const email = `img-test-${label}-${run}@example.com`;
    const password = randomBytes(24).toString("base64url");
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userIds.push(created.data.user.id);
    if (isAdmin) {
      const grant = await service.from("admin_users").insert({ auth_user_id: created.data.user.id });
      if (grant.error) throw grant.error;
    }
    const context = signedInContext();
    expect(await context.session.signIn(email, password)).toBe(true);
    return context;
  }

  const add = (position: number) => admin.productImages.add({ productId, alt: `test ${position}`, position, ...rendition });

  beforeAll(async () => {
    service = createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_SERVICE_ROLE_KEY, timeoutMs: 20000 });
    admin = await user("admin", true);
    plain = await user("plain", false);
    const category = await service.from("categories").select("id").limit(1).single();
    if (category.error) throw category.error;
    const product = await admin.products.create({
      name: `Image test ${run}`,
      slug: `img-test-${run}`,
      description: "",
      categoryId: (category.data as { id: string }).id,
      priceMinor: 10000,
      attributes: {},
    });
    productId = product.id;
    const jpeg = await sharp({ create: { width: 1000, height: 750, channels: 3, background: "#c2562f" } }).jpeg().toBuffer();
    const processed = await createSharpImageProcessor().process(new Uint8Array(jpeg));
    if (!processed.ok) throw new Error(processed.reason);
    rendition = { large: processed.large, small: processed.small };
  }, 60000);

  afterAll(async () => {
    if (!service) return;
    if (productId) {
      const files = await service.storage.from(PRODUCT_IMAGES_BUCKET).list(productId, { limit: 100 });
      const names = (files.data ?? []).map((file) => `${productId}/${file.name}`);
      if (names.length > 0) await service.storage.from(PRODUCT_IMAGES_BUCKET).remove(names);
      await service.from("products").delete().eq("id", productId); // photo rows cascade
    }
    for (const id of userIds) await service.auth.admin.deleteUser(id);
  });

  it("an admin uploads a photo; the public URL serves WebP with a one-year cache header", async () => {
    const image = await add(0);
    expect(image).toMatchObject({ position: 0, width: 1000, height: 750 });
    for (const url of [image.urls.large, image.urls.small]) {
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/webp");
      expect(response.headers.get("cache-control")).toContain("max-age=31536000");
    }
  });

  it("layer 4 on its own: a signed-in non-admin can't upload files or add rows", async () => {
    const upload = await plain.productImages.add({ productId, alt: "nope", position: 1, ...rendition }).catch((e: unknown) => e);
    expect(upload).toBeInstanceOf(Error);
    const files = await service.storage.from(PRODUCT_IMAGES_BUCKET).list(productId, { limit: 100 });
    expect(files.data).toHaveLength(2); // only the admin's large + small
  });

  it("shoppers can't list a draft's photos; they appear once it's published", async () => {
    const anonymous = createSupabaseProductImageRepository(
      createSupabaseClient({ url: env!.SUPABASE_URL, key: env!.SUPABASE_ANON_KEY!, timeoutMs: 20000 }),
    );
    expect((await anonymous.listForProducts([productId])).get(productId)).toBeUndefined();
    const current = await admin.products.get(productId);
    await admin.products.setStatus(productId, "active", current!.version);
    expect((await anonymous.listForProducts([productId])).get(productId)).toHaveLength(1);
  });

  it("the database itself refuses a taken position and a 9th photo, and removes the orphaned files", async () => {
    await expect(add(0)).rejects.toThrow(ConflictError);
    for (let position = 1; position < 8; position++) await add(position);
    await expect(add(8)).rejects.toThrow(ConflictError);
    const files = await service.storage.from(PRODUCT_IMAGES_BUCKET).list(productId, { limit: 100 });
    expect(files.data).toHaveLength(16); // 8 photos x 2 renditions: the rejected uploads were cleaned up
  }, 60000);

  it("reorders in one statement and rejects a stale id list", async () => {
    const before = await admin.productImages.list(productId);
    const reversed = [...before].reverse().map((image) => image.id);
    await admin.productImages.reorder(productId, reversed);
    expect((await admin.productImages.list(productId)).map((image) => image.id)).toEqual(reversed);
    await expect(admin.productImages.reorder(productId, reversed.slice(1))).rejects.toThrow(ConflictError);
  });

  it("removing a photo deletes the row and both files", async () => {
    const [first] = await admin.productImages.list(productId);
    expect(await admin.productImages.remove(first!.id)).toBe(true);
    expect((await fetch(first!.urls.large)).status).toBeGreaterThanOrEqual(400);
    const files = await service.storage.from(PRODUCT_IMAGES_BUCKET).list(productId, { limit: 100 });
    expect(files.data).toHaveLength(14);
  });
});
