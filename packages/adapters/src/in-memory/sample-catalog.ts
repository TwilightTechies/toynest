import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Category, CategoryRepository, Product, ProductRepository, ProductSort } from "@toynest/core";
import { z } from "zod";

export const SampleCatalogSchema = z.object({
  categories: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      requiredAttributes: z.array(z.string()),
      // Short header label (ADR-018); the name is used when absent.
      menuLabel: z.string().optional(),
    }),
  ),
  products: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      categorySlug: z.string(),
      priceMinor: z.number().int().nonnegative(),
      currency: z.string().length(3),
      ageRange: z.string(),
      material: z.string(),
      // "name" = the shopper must give a name to engrave (validatePersonalisation in core).
      personalisation: z.literal("name").optional(),
      // Date the product was added to the shop; drives the "newest" sort and "New arrivals".
      addedOn: z.iso.date(),
    }),
  ),
});

export type SampleProduct = z.infer<typeof SampleCatalogSchema>["products"][number];

// Shared with the Supabase seed script, so both data sources hold identical attributes and dates.
export function sampleProductAttributes(product: SampleProduct): Record<string, string> {
  return {
    ageRange: product.ageRange,
    material: product.material,
    ...(product.personalisation ? { personalisation: product.personalisation } : {}),
  };
}

export function sampleProductCreatedAt(product: SampleProduct): string {
  return `${product.addedOn}T00:00:00.000Z`;
}

// Shared with the Supabase seed script, so both data sources describe products identically.
export function describeSampleProduct(product: SampleProduct): string {
  return `${product.name}. Ages ${product.ageRange}. Material: ${product.material}.`;
}

export interface Catalog {
  products: ProductRepository;
  categories: CategoryRepository;
}

// Loads data/sample-catalog.json into in-memory repositories (stand-in for Supabase).
export async function loadSampleCatalog(filePath: string): Promise<Catalog> {
  const data = SampleCatalogSchema.parse(JSON.parse(await readFile(filePath, "utf8")));

  // Sample categories are all shown, in file order (ADR-018).
  const categories: Category[] = data.categories.map((category, index) => ({
    id: randomUUID(),
    ...category,
    visible: true,
    sortOrder: index,
    menuLabel: category.menuLabel ?? null,
  }));
  const categoryIdBySlug = new Map(categories.map((category) => [category.slug, category.id]));

  const products: Product[] = data.products.map((product) => {
    const categoryId = categoryIdBySlug.get(product.categorySlug);
    if (!categoryId) throw new Error(`Product ${product.slug} references unknown category ${product.categorySlug}`);
    return {
      id: randomUUID(),
      slug: product.slug,
      name: product.name,
      description: describeSampleProduct(product),
      categoryId,
      priceMinor: product.priceMinor,
      currency: product.currency,
      status: "active",
      attributes: sampleProductAttributes(product),
      createdAt: sampleProductCreatedAt(product),
    };
  });

  return { products: createInMemoryProductRepository(products), categories: { list: async () => categories } };
}

const byName = (a: Product, b: Product) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

// Mirrors the order by of the search_products SQL function. In-memory "relevance" is simply the
// match order (no ranking), so the contract tests never assert relevance order across adapters.
const comparators: Record<ProductSort, ((a: Product, b: Product) => number) | null> = {
  relevance: null,
  name: byName,
  "price-asc": (a, b) => a.priceMinor - b.priceMinor || byName(a, b),
  "price-desc": (a, b) => b.priceMinor - a.priceMinor || byName(a, b),
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b),
};

export function createInMemoryProductRepository(products: Product[]): ProductRepository {
  return {
    findBySlug: async (slug) => products.find((product) => product.slug === slug) ?? null,
    findByIds: async (ids) => {
      const wanted = new Set(ids);
      return products.filter((product) => wanted.has(product.id));
    },
    search: async ({ text = "", categoryId, minPriceMinor, maxPriceMinor, sort = "relevance", limit, offset }) => {
      const words = text.toLowerCase().split(/\s+/).filter(Boolean);
      const matches = products.filter((product) => {
        const haystack = `${product.name} ${product.description}`.toLowerCase();
        const matchesText = words.length === 0 || words.some((word) => haystack.includes(word));
        return (
          matchesText &&
          (!categoryId || product.categoryId === categoryId) &&
          (minPriceMinor === undefined || product.priceMinor >= minPriceMinor) &&
          (maxPriceMinor === undefined || product.priceMinor <= maxPriceMinor)
        );
      });
      // With no search text, relevance means name order (as in SQL).
      const compare = comparators[sort] ?? (words.length === 0 ? byName : null);
      const ordered = compare ? [...matches].sort(compare) : matches;
      return { items: ordered.slice(offset, offset + limit), total: matches.length };
    },
  };
}
