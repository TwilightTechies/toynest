import "server-only";
import path from "node:path";
import { loadSampleCatalog } from "@toynest/adapters/sample-catalog";

// `next dev` runs with apps/web as the working directory.
export const repoRoot = path.join(process.cwd(), "../..");
export const dataDir = path.join(repoRoot, "data");

export interface CatalogItem {
  slug: string;
  name: string;
  description: string;
  categoryName: string;
  price: string;
}

// Reads through the core ports (ProductRepository / CategoryRepository), so swapping the
// sample file for Supabase later changes only this adapter call.
export async function listCatalog(): Promise<CatalogItem[]> {
  "use cache";
  const { products, categories } = await loadSampleCatalog(path.join(dataDir, "sample-catalog.json"));
  const categoryNames = new Map((await categories.list()).map((category) => [category.id, category.name]));
  const { items } = await products.search({ limit: 100, offset: 0 });

  // Prices are formatted on the server from integer minor units.
  return items.map((product) => ({
    slug: product.slug,
    name: product.name,
    description: product.description,
    categoryName: categoryNames.get(product.categoryId) ?? "Uncategorised",
    price: new Intl.NumberFormat("en-GB", { style: "currency", currency: product.currency }).format(
      product.priceMinor / 100,
    ),
  }));
}
