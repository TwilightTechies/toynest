import {
  AdminCategorySchema,
  ConflictError,
  SlugTakenError,
  type AdminCategory,
  type CategoryAdminRepository,
} from "@toynest/core";
import { z } from "zod";
import type { SupabaseClient } from "./client";
import { toRepositoryError } from "./errors";
import { CATEGORY_COLUMNS, toCategory } from "./rows";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

// products(count) embeds the number of products (any status, as the admin sees them all).
const ADMIN_CATEGORY_COLUMNS = `${CATEGORY_COLUMNS}, updated_at, products(count)`;

const CountRowSchema = z.object({
  updated_at: z.string().min(1),
  products: z.array(z.object({ count: z.number().int() })),
});

function toAdminCategory(row: unknown): AdminCategory {
  const extra = CountRowSchema.parse(row);
  return AdminCategorySchema.parse({ ...toCategory(row), version: extra.updated_at, productCount: extra.products[0]?.count ?? 0 });
}

const isUuid = (value: string) => z.uuid().safeParse(value).success;

// ADR-018. Give it the admin's user-scoped client: RLS (is_admin()) then checks every write, and
// hidden categories are visible only to admins.
export function createSupabaseCategoryAdminRepository(client: SupabaseClient): CategoryAdminRepository {
  async function updateWhere(id: string, columns: Record<string, unknown>, expectedVersion: string, op: string) {
    const result = await client
      .from("categories")
      .update(columns)
      .eq("id", id)
      .eq("updated_at", expectedVersion)
      .select(ADMIN_CATEGORY_COLUMNS)
      .maybeSingle();
    if (result.error) throw toRepositoryError(result, op);
    if (!result.data) throw new ConflictError();
    return toAdminCategory(result.data);
  }

  return {
    async list() {
      const result = await client.from("categories").select(ADMIN_CATEGORY_COLUMNS).order("sort_order").order("name");
      if (result.error) throw toRepositoryError(result, "adminCategories.list");
      return z.array(z.unknown()).parse(result.data).map(toAdminCategory);
    },

    async get(id) {
      if (!isUuid(id)) return null;
      const result = await client.from("categories").select(ADMIN_CATEGORY_COLUMNS).eq("id", id).maybeSingle();
      if (result.error) throw toRepositoryError(result, "adminCategories.get");
      return result.data ? toAdminCategory(result.data) : null;
    },

    async create({ name, slug, menuLabel, requiredAttributes }) {
      // Last in the menu, and hidden until an admin shows it.
      const last = await client.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      if (last.error) throw toRepositoryError(last, "adminCategories.create");
      const sortOrder = (z.object({ sort_order: z.number() }).nullable().parse(last.data)?.sort_order ?? -1) + 1;
      const result = await client
        .from("categories")
        .insert({ name, slug, menu_label: menuLabel, required_attributes: requiredAttributes, visible: false, sort_order: sortOrder })
        .select(ADMIN_CATEGORY_COLUMNS)
        .single();
      if (result.error) {
        if (result.error.code === UNIQUE_VIOLATION) throw new SlugTakenError(slug);
        throw toRepositoryError(result, "adminCategories.create");
      }
      return toAdminCategory(result.data);
    },

    async update(id, { name, menuLabel, requiredAttributes }, expectedVersion) {
      return updateWhere(id, { name, menu_label: menuLabel, required_attributes: requiredAttributes }, expectedVersion, "adminCategories.update");
    },

    async setVisible(id, visible, expectedVersion) {
      return updateWhere(id, { visible }, expectedVersion, "adminCategories.setVisible");
    },

    async reorder(orderedIds) {
      // A handful of rows: one update each. sort_order has no unique constraint, so order of writes
      // doesn't matter, and a concurrent reorder at worst leaves ties (broken by name).
      for (const [index, id] of orderedIds.entries()) {
        const result = await client.from("categories").update({ sort_order: index }).eq("id", id);
        if (result.error) throw toRepositoryError(result, "adminCategories.reorder");
      }
    },

    async remove(id) {
      if (!isUuid(id)) return false;
      const result = await client.from("categories").delete().eq("id", id).select("id").maybeSingle();
      if (result.error) {
        // Products still reference it (no cascade): the caller tells the admin to hide it instead.
        if (result.error.code === FOREIGN_KEY_VIOLATION) throw new ConflictError("Category is in use");
        throw toRepositoryError(result, "adminCategories.remove");
      }
      return result.data !== null;
    },
  };
}
