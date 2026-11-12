import type { CategoryRepository, ProductRepository } from "@toynest/core";
import { z } from "zod";
import { defineTool, type Tool } from "../tool";
import { ProductDraftSchema, type ProductDraft } from "./contract";

export interface CatalogDeps {
  products: ProductRepository;
  categories: CategoryRepository;
}

export function searchProductsTool({ products, categories }: CatalogDeps): Tool {
  return defineTool({
    name: "search_products",
    description:
      "Search ToyNest's existing catalogue by keywords such as product type, material or theme. " +
      "Use it to find similar products and typical prices. Returns up to `limit` matches with slug, name, " +
      "categorySlug and priceMinor (price in minor units: paise, ₹1 = 100 paise). An empty list means no matches, not an error.",
    input: z.object({
      query: z.string().min(2).max(100),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    execute: async ({ query, limit }) => {
      const [{ items }, allCategories] = await Promise.all([
        products.search({ text: query, limit, offset: 0 }),
        categories.list(),
      ]);
      const slugById = new Map(allCategories.map((category) => [category.id, category.slug]));
      // Only the fields the agent needs; full product rows would waste context.
      return items.map((product) => ({
        slug: product.slug,
        name: product.name,
        categorySlug: slugById.get(product.categoryId) ?? null,
        priceMinor: product.priceMinor,
        currency: product.currency,
      }));
    },
  });
}

export function getCategoriesTool({ categories }: Pick<CatalogDeps, "categories">): Tool {
  return defineTool({
    name: "get_categories",
    description:
      "List every ToyNest category with its slug, name and requiredAttributes (attribute names every product " +
      "in that category must state). Call this before choosing a categorySlug.",
    input: z.object({}),
    execute: async () =>
      (await categories.list()).map(({ slug, name, requiredAttributes }) => ({ slug, name, requiredAttributes })),
  });
}

// The schema checks the draft's shape; execute() checks facts the schema cannot express.
// Thrown errors reach Claude as is_error tool results, so it can correct the draft and resubmit.
export function submitDraftTool(deps: CatalogDeps & { onAccepted: (draft: ProductDraft) => void }): Tool {
  return defineTool({
    name: "submit_product_draft",
    description:
      "Submit the finished product draft for admin review. Call it once, after researching the catalogue. " +
      "For any required attribute the brief does not state, add an entry to missingInformation instead of inventing a value.",
    input: ProductDraftSchema,
    execute: async (draft) => {
      const category = (await deps.categories.list()).find((candidate) => candidate.slug === draft.categorySlug);
      if (!category) {
        throw new Error(`Unknown categorySlug "${draft.categorySlug}". Call get_categories and use one of its slugs.`);
      }

      const accountedFor = new Set([
        ...draft.attributes.map((attribute) => attribute.name),
        ...draft.missingInformation.map((gap) => gap.field),
      ]);
      const unaccounted = category.requiredAttributes.filter((name) => !accountedFor.has(name));
      if (unaccounted.length > 0) {
        throw new Error(
          `Category "${category.slug}" requires: ${unaccounted.join(", ")}. ` +
            "Add each as an attribute, or list it in missingInformation if the brief does not state it.",
        );
      }

      for (const similar of draft.similarProducts) {
        if (!(await deps.products.findBySlug(similar.slug))) {
          throw new Error(
            `similarProducts slug "${similar.slug}" is not in the catalogue. Only cite products returned by search_products.`,
          );
        }
      }

      deps.onAccepted(draft);
      return { accepted: true };
    },
  });
}
