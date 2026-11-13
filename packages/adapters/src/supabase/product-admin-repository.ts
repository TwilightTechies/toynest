import {
  ConflictError,
  SlugTakenError,
  STORE_CURRENCY,
  type AdminProduct,
  type ProductAdminRepository,
  type ProductInput,
} from "@toynest/core";
import { z } from "zod";
import type { SupabaseClient } from "./client";
import { toRepositoryError } from "./errors";
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
