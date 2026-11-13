import { ConflictError, SlugTakenError } from "../errors";
import type { CategoryAdminRepository } from "../ports/category-admin-repository";
import { CategoryInputSchema, type AdminCategory, type CategoryInput } from "./category-admin";

export type CategoryFailure =
  | { ok: false; reason: "invalid"; problems: string[] }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "slug_taken" }
  // Products still use it: hide it instead.
  | { ok: false; reason: "in_use"; productCount: number };

export type CategoryResult<T = AdminCategory> = { ok: true; value: T } | CategoryFailure;

// Category rules (ADR-018). Who may call it is decided outside: requireAdmin() in the web app, and
// the repository runs with the admin's session so RLS checks it again.
export function createCategoryAdminService(categories: CategoryAdminRepository) {
  async function guard<T>(run: () => Promise<T>): Promise<CategoryResult<T>> {
    try {
      return { ok: true, value: await run() };
    } catch (error) {
      if (error instanceof ConflictError) return { ok: false, reason: "conflict" };
      if (error instanceof SlugTakenError) return { ok: false, reason: "slug_taken" };
      throw error;
    }
  }

  function validate(raw: CategoryInput): { input: CategoryInput } | CategoryFailure {
    const parsed = CategoryInputSchema.safeParse({ ...raw, menuLabel: raw.menuLabel?.trim() || null });
    if (!parsed.success) return { ok: false, reason: "invalid", problems: [...new Set(parsed.error.issues.map((i) => i.message))] };
    return { input: parsed.data };
  }

  async function current(id: string, expectedVersion: string): Promise<AdminCategory | CategoryFailure> {
    const category = await categories.get(id);
    if (!category) return { ok: false, reason: "not_found" };
    if (category.version !== expectedVersion) return { ok: false, reason: "conflict" };
    return category;
  }

  return {
    async create(raw: CategoryInput): Promise<CategoryResult> {
      const checked = validate(raw);
      if ("ok" in checked) return checked;
      return guard(() => categories.create(checked.input));
    },

    async update(id: string, raw: Omit<CategoryInput, "slug">, expectedVersion: string): Promise<CategoryResult> {
      const found = await current(id, expectedVersion);
      if ("ok" in found) return found;
      // The slug is fixed: validate with the stored one.
      const checked = validate({ ...raw, slug: found.slug });
      if ("ok" in checked) return checked;
      const { slug: _fixed, ...input } = checked.input;
      return guard(() => categories.update(id, input, expectedVersion));
    },

    async setVisible(id: string, visible: boolean, expectedVersion: string): Promise<CategoryResult> {
      const found = await current(id, expectedVersion);
      if ("ok" in found) return found;
      return guard(() => categories.setVisible(id, visible, expectedVersion));
    },

    // Swaps with the neighbour in the full list; the ends are no-ops.
    async move(id: string, direction: "up" | "down"): Promise<CategoryResult<null>> {
      const ordered = await categories.list();
      const index = ordered.findIndex((category) => category.id === id);
      if (index === -1) return { ok: false, reason: "not_found" };
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= ordered.length) return { ok: true, value: null };
      const ids = ordered.map((category) => category.id);
      [ids[index], ids[target]] = [ids[target]!, ids[index]!];
      return guard(async () => {
        await categories.reorder(ids);
        return null;
      });
    },

    async remove(id: string): Promise<CategoryResult<null>> {
      const category = await categories.get(id);
      if (!category) return { ok: false, reason: "not_found" };
      if (category.productCount > 0) return { ok: false, reason: "in_use", productCount: category.productCount };
      const result = await guard(() => categories.remove(id));
      // A product added between the check and the delete makes the database refuse it (foreign key).
      if (!result.ok) return result.reason === "conflict" ? { ok: false, reason: "in_use", productCount: 1 } : result;
      return result.value ? { ok: true, value: null } : { ok: false, reason: "not_found" };
    },
  };
}

export type CategoryAdminService = ReturnType<typeof createCategoryAdminService>;
