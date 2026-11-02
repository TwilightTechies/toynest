import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Category, CategoryRepository, Product, ProductRepository } from "@toynest/core";
import { z } from "zod";

const SampleCatalogSchema = z.object({
  categories: z.array(
    z.object({ slug: z.string(), name: z.string(), requiredAttributes: z.array(z.string()) }),
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
    }),
  ),
});

export interface Catalog {
  products: ProductRepository;
  categories: CategoryRepository;
}

// Loads data/sample-catalog.json into in-memory repositories (stand-in for Supabase).
export async function loadSampleCatalog(filePath: string): Promise<Catalog> {
  const data = SampleCatalogSchema.parse(JSON.parse(await readFile(filePath, "utf8")));

  const categories: Category[] = data.categories.map((category) => ({ id: randomUUID(), ...category }));
  const categoryIdBySlug = new Map(categories.map((category) => [category.slug, category.id]));

  const products: Product[] = data.products.map((product) => {
    const categoryId = categoryIdBySlug.get(product.categorySlug);
    if (!categoryId) throw new Error(`Product ${product.slug} references unknown category ${product.categorySlug}`);
    return {
      id: randomUUID(),
      slug: product.slug,
      name: product.name,
      description: `${product.name}. Ages ${product.ageRange}. Material: ${product.material}.`,
      categoryId,
      priceMinor: product.priceMinor,
      currency: product.currency,
      status: "active",
    };
  });

  return { products: createInMemoryProductRepository(products), categories: { list: async () => categories } };
}

export function createInMemoryProductRepository(products: Product[]): ProductRepository {
  return {
    findBySlug: async (slug) => products.find((product) => product.slug === slug) ?? null,
    search: async ({ text = "", categoryId, limit, offset }) => {
      const words = text.toLowerCase().split(/\s+/).filter(Boolean);
      const matches = products.filter((product) => {
        const haystack = `${product.name} ${product.description}`.toLowerCase();
        const matchesText = words.length === 0 || words.some((word) => haystack.includes(word));
        return matchesText && (!categoryId || product.categoryId === categoryId);
      });
      return { items: matches.slice(offset, offset + limit), total: matches.length };
    },
  };
}
