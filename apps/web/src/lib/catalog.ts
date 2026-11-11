import "server-only";
import { getRepositories, type DataSource } from "./data";

export interface CatalogItem {
  slug: string;
  name: string;
  description: string;
  categoryName: string;
  price: string;
}

export interface CatalogPage {
  source: DataSource;
  query: string;
  items: CatalogItem[];
  total: number;
}

// Reads through the core ports (ProductRepository / CategoryRepository), so the page does not know
// whether the data comes from Supabase or the sample file.
export async function listCatalog(query = ""): Promise<CatalogPage> {
  "use cache";
  const { source, products, categories } = await getRepositories();
  const categoryNames = new Map((await categories.list()).map((category) => [category.id, category.name]));
  const { items, total } = await products.search({ text: query, limit: 100, offset: 0 });

  return {
    source,
    query,
    total,
    // Prices are formatted on the server from integer minor units.
    items: items.map((product) => ({
      slug: product.slug,
      name: product.name,
      description: product.description,
      categoryName: categoryNames.get(product.categoryId) ?? "Uncategorised",
      price: new Intl.NumberFormat("en-GB", { style: "currency", currency: product.currency }).format(
        product.priceMinor / 100,
      ),
    })),
  };
}
