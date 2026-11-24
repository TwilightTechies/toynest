import {
  ConflictError,
  HasOrdersError,
  SlugTakenError,
  STORE_CURRENCY,
  type AdminProduct,
  type ProductAdminRepository,
  type ProductInput,
} from "@toynest/core";
import { z } from "zod";
import type { SupabaseClient } from "./client";
import { toRepositoryError } from "./errors";
import { fileFor, PRODUCT_IMAGES_BUCKET } from "./product-image-repository";
import { ADMIN_PRODUCT_COLUMNS, toAdminProduct } from "./rows";

const UNIQUE_VIOLATION = "23505";

// In ILIKE, % and _ are wildcards and \ escapes; PostgREST also reads * as %. Typed text is literal.
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, "");

const toColumns = (input: ProductInput) => ({
  name: input.name,
  slug: input.slug,
  description: input.description,
  category_id: input.categoryId,
  price_minor: input.priceMinor,
  attributes: input.attributes,
  stock: input.stock,
});

// ADR-016. Give it a client that carries the signed-in admin's session (anon key + their JWT), never
// the service role: then RLS (public.is_admin()) refuses these writes for anyone who isn't an admin,
// even if the app's own check were skipped.
export function createSupabaseProductAdminRepository(client: SupabaseClient): ProductAdminRepository {
  // A unique-violation on insert/update can only be the slug (the id is generated).
  function writeError(result: { error: { message: string; code?: string } | null; status: number }, op: string, slug: string) {
    return result.error?.code === UNIQUE_VIOLATION ? new SlugTakenError(slug) : toRepositoryError(result, op);
  }

  return {
    async list({ text, status, categoryId, limit, offset }) {
      let query = client
        .from("products")
        .select(ADMIN_PRODUCT_COLUMNS, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id")
        .range(offset, offset + limit - 1);
      const term = text?.trim();
      if (term) query = query.ilike("name", `%${escapeLike(term)}%`);
      if (status) query = query.eq("status", status);
      if (categoryId) query = query.eq("category_id", categoryId);
      const result = await query;
      if (result.error) throw toRepositoryError(result, "adminProducts.list");
      return { items: z.array(z.unknown()).parse(result.data).map(toAdminProduct), total: result.count ?? 0 };
    },

    async get(id) {
      if (!z.uuid().safeParse(id).success) return null;
      const result = await client.from("products").select(ADMIN_PRODUCT_COLUMNS).eq("id", id).maybeSingle();
      if (result.error) throw toRepositoryError(result, "adminProducts.get");
      return result.data ? toAdminProduct(result.data) : null;
    },

    async create(input) {
      const result = await client
        .from("products")
        .insert({ ...toColumns(input), currency: STORE_CURRENCY, status: "draft" })
        .select(ADMIN_PRODUCT_COLUMNS)
        .single();
      if (result.error) throw writeError(result, "adminProducts.create", input.slug);
      return toAdminProduct(result.data);
    },

    async update(id, input, expectedVersion) {
      return conditionalUpdate(id, toColumns(input), expectedVersion, "adminProducts.update", input.slug);
    },

    async setStatus(id, status, expectedVersion) {
      return conditionalUpdate(id, { status }, expectedVersion, "adminProducts.setStatus", "");
    },

    async setFeatured(id, featured, expectedVersion) {
      return conditionalUpdate(id, { featured }, expectedVersion, "adminProducts.setFeatured", "");
    },

    async orderedAmong(ids) {
      const valid = [...new Set(ids)].filter((id) => z.uuid().safeParse(id).success);
      if (valid.length === 0) return new Set<string>();
      // An embedded count per product (same pattern as the category list's product count): one
      // request and one row per product, however many order lines there are. Admins may read every
      // order line (ADR-019 policy), so the counts are complete.
      const result = await client.from("products").select("id, order_items(count)").in("id", valid);
      if (result.error) throw toRepositoryError(result, "adminProducts.orderedAmong");
      const rows = z.array(z.object({ id: z.string(), order_items: z.array(z.object({ count: z.number().int() })) })).parse(result.data);
      return new Set(rows.filter((row) => (row.order_items[0]?.count ?? 0) > 0).map((row) => row.id));
    },

    async delete(id, expectedVersion) {
      // Photo paths first: the rows go with the product (on delete cascade), the files don't.
      const photos = await client.from("product_images").select("path").eq("product_id", id);
      if (photos.error) throw toRepositoryError(photos, "adminProducts.delete");
      const paths = z.array(z.object({ path: z.string().min(1) })).parse(photos.data).map((row) => row.path);

      // Same optimistic check as updates; the trigger refuses an ordered product (ADR-023).
      const result = await client.from("products").delete().eq("id", id).eq("updated_at", expectedVersion).select("id");
      if (result.error) {
        if (result.error.message.includes("product_has_orders")) throw new HasOrdersError(id);
        throw toRepositoryError(result, "adminProducts.delete");
      }
      if (z.array(z.unknown()).parse(result.data).length === 0) throw new ConflictError();

      if (paths.length > 0) {
        const files = paths.flatMap((path) => [fileFor(path, "large"), fileFor(path, "small")]);
        const removed = await client.storage.from(PRODUCT_IMAGES_BUCKET).remove(files);
        // The product is already gone; a file left behind only costs storage. Log it for the
        // orphan-cleanup job rather than failing the admin's request.
        if (removed.error) console.error(`Orphaned photo files of deleted product ${id}: ${removed.error.message}`);
      }
    },
  };

  // Optimistic concurrency: the WHERE includes the version the admin loaded. Zero rows back means
  // someone saved in between (or the row is gone), so nothing was overwritten.
  async function conditionalUpdate(
    id: string,
    columns: Record<string, unknown>,
    expectedVersion: string,
    op: string,
    slug: string,
  ): Promise<AdminProduct> {
    const result = await client
      .from("products")
      .update(columns)
      .eq("id", id)
      .eq("updated_at", expectedVersion)
      .select(ADMIN_PRODUCT_COLUMNS)
      .maybeSingle();
    if (result.error) throw writeError(result, op, slug);
    if (!result.data) throw new ConflictError();
    return toAdminProduct(result.data);
  }
}
