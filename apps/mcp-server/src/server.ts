import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SlugSchema, type Category, type CategoryRepository, type ProductRepository } from "@toynest/core";
import { z } from "zod";
import { guarded, toolError, toolResult } from "./errors";

export interface ServerDeps {
  products: ProductRepository;
  categories: CategoryRepository;
}

// Read-only by design: no tool creates or changes data.
export function createToyNestServer({ products, categories }: ServerDeps): McpServer {
  const server = new McpServer({ name: "toynest", version: "0.1.0" });

  const describeCategory = (category: Category) => ({
    slug: category.slug,
    name: category.name,
    requiredAttributes: category.requiredAttributes,
  });

  // Resource: a catalogue Claude can read up front instead of discovering it through tool calls.
  server.registerResource(
    "categories",
    "toynest://categories",
    {
      title: "ToyNest categories",
      description: "Every product category with its slug and the attributes each product in it must state.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify((await categories.list()).map(describeCategory)),
        },
      ],
    }),
  );

  server.registerTool(
    "get_categories",
    {
      title: "List categories",
      description:
        "List ToyNest's product categories with their slug, name and required attributes. " +
        "Use before choosing a category or checking a product against its category's rules. " +
        "Takes no input. The same list is available as the resource toynest://categories.",
      annotations: { readOnlyHint: true },
    },
    () => guarded(async () => toolResult((await categories.list()).map(describeCategory))),
  );

  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description:
        "Search ToyNest's product catalogue by keywords and/or category. Use to find similar or existing " +
        "products and typical prices. Not for orders or customers. " +
        "query: plain keywords such as 'wooden puzzle' (optional if categorySlug is given). " +
        "categorySlug: a slug from get_categories, e.g. 'educational-toys'. " +
        "Returns up to `limit` products with slug, name, categorySlug and priceMinor (paise; ₹1 = 100 paise). " +
        "An empty list means no matching products, not an error: do not repeat the same search; " +
        "try broader keywords once or continue without matches.",
      inputSchema: {
        query: z.string().max(100).optional(),
        categorySlug: SlugSchema.optional(),
        limit: z.number().int().min(1).max(10).default(5),
      },
      annotations: { readOnlyHint: true },
    },
    ({ query, categorySlug, limit }) =>
      guarded(async () => {
        if (!query?.trim() && !categorySlug) {
          return toolError("validation", "Give a query, a categorySlug, or both.");
        }
        const allCategories = await categories.list();
        const category = categorySlug ? allCategories.find((candidate) => candidate.slug === categorySlug) : undefined;
        if (categorySlug && !category) {
          const valid = allCategories.map((candidate) => candidate.slug).join(", ");
          return toolError("validation", `Unknown categorySlug '${categorySlug}'. Valid slugs: ${valid}.`);
        }

        const slugById = new Map(allCategories.map((candidate) => [candidate.id, candidate.slug]));
        const { items, total } = await products.search({ text: query, categoryId: category?.id, limit, offset: 0 });
        return toolResult({
          total,
          items: items.map((product) => ({
            slug: product.slug,
            name: product.name,
            categorySlug: slugById.get(product.categoryId),
            priceMinor: product.priceMinor,
          })),
        });
      }),
  );

  server.registerTool(
    "get_product",
    {
      title: "Get product",
      description:
        "Get one ToyNest product by its slug, e.g. 'wooden-number-puzzle'. Use when you already know the slug " +
        "(from search_products); use search_products when you only know words from the name. " +
        "Returns { found: false } when no product has that slug; that is an answer, not an error.",
      inputSchema: { slug: SlugSchema },
      annotations: { readOnlyHint: true },
    },
    ({ slug }) =>
      guarded(async () => {
        const product = await products.findBySlug(slug);
        return toolResult(product ? { found: true, product } : { found: false, slug });
      }),
  );

  return server;
}
