import { ConflictError, SlugTakenError } from "../errors";
import type { CategoryRepository } from "../ports/category-repository";
import type { ProductAdminRepository } from "../ports/product-admin-repository";
import type { Category } from "./category";
import {
  checkPublishable,
  ProductInputSchema,
  STATUS_TRANSITIONS,
  type AdminProduct,
  type ProductInput,
  type StatusAction,
} from "./product-admin";

// Expected business outcomes are values, not exceptions, so the form can show each one plainly.
// Outages (RepositoryUnavailableError) and bugs still throw.
export type AdminFailure =
  | { ok: false; reason: "invalid"; problems: string[] }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "slug_taken" };

export type AdminResult = { ok: true; product: AdminProduct } | AdminFailure;

// Business rules for catalogue editing (ADR-016). Who may call it is decided outside: the web app
// checks the admin role, and the repository runs with the admin's session so RLS checks it again.
export function createProductAdminService(products: ProductAdminRepository, categories: CategoryRepository) {
  async function findCategory(id: string): Promise<Category | undefined> {
    return (await categories.list()).find((category) => category.id === id);
  }

  // Maps the two expected write failures to results; anything else propagates.
  async function write(run: () => Promise<AdminProduct>): Promise<AdminResult> {
    try {
      return { ok: true, product: await run() };
    } catch (error) {
      if (error instanceof ConflictError) return { ok: false, reason: "conflict" };
      if (error instanceof SlugTakenError) return { ok: false, reason: "slug_taken" };
      throw error;
    }
  }

  async function validate(raw: ProductInput): Promise<{ input: ProductInput; category: Category } | AdminFailure> {
    const parsed = ProductInputSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: "invalid", problems: parsed.error.issues.map((i) => i.message) };
    const category = await findCategory(parsed.data.categoryId);
    if (!category) return { ok: false, reason: "invalid", problems: ["Choose a category"] };
    return { input: parsed.data, category };
  }

  return {
    // New products always start as drafts, including ones saved from an AI draft.
    async create(raw: ProductInput): Promise<AdminResult> {
      const checked = await validate(raw);
      if ("ok" in checked) return checked;
      return write(() => products.create(checked.input));
    },

    async update(id: string, raw: ProductInput, expectedVersion: string): Promise<AdminResult> {
      const checked = await validate(raw);
      if ("ok" in checked) return checked;
      const current = await products.get(id);
      if (!current) return { ok: false, reason: "not_found" };
      if (current.version !== expectedVersion) return { ok: false, reason: "conflict" };
      // A live product must stay complete: editing can't remove what publishing required.
      if (current.status === "active") {
        const problems = checkPublishable(checked.input, checked.category);
        if (problems.length > 0) return { ok: false, reason: "invalid", problems };
      }
      return write(() => products.update(id, checked.input, expectedVersion));
    },

    async changeStatus(id: string, action: StatusAction, expectedVersion: string): Promise<AdminResult> {
      const current = await products.get(id);
      if (!current) return { ok: false, reason: "not_found" };
      if (current.version !== expectedVersion) return { ok: false, reason: "conflict" };
      const transition = STATUS_TRANSITIONS[action];
      if (!transition.from.includes(current.status)) {
        return { ok: false, reason: "invalid", problems: [`A ${current.status} product can't be moved with "${action}"`] };
      }
      if (transition.to === "active") {
        const category = await findCategory(current.categoryId);
        const problems = category ? checkPublishable(current, category) : ["Choose a category"];
        if (problems.length > 0) return { ok: false, reason: "invalid", problems };
      }
      return write(() => products.setStatus(id, transition.to, expectedVersion));
    },
  };
}

export type ProductAdminService = ReturnType<typeof createProductAdminService>;
