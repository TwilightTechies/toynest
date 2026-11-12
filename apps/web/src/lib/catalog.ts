import "server-only";
import {
  CATALOG_PAGE_SIZE,
  SlugSchema,
  type CatalogParams,
  type Category,
  type Product,
  type ProductSearchQuery,
} from "@toynest/core";
import { getRepositories, type DataSource } from "./data";

export interface CatalogItem {
  slug: string;
  name: string;
  description: string;
  categoryName: string;
  categorySlug: string | undefined;
  price: string;
}

export interface CategorySummary {
  slug: string;
  name: string;
  count: number;
}

export interface CatalogPage {
  source: DataSource;
  params: CatalogParams;
  // The category from the URL, or undefined if none was given or the slug is unknown.
  category: CategorySummary | undefined;
  categories: CategorySummary[];
  items: CatalogItem[];
  total: number;
  pageCount: number;
}

export interface ProductDetail extends CatalogItem {
  attributes: { label: string; value: string }[];
}

// Prices are formatted on the server from integer minor units; the client never computes money.
const formatPrice = (product: Product) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: product.currency }).format(product.priceMinor / 100);

// "ageRange" -> "Age range"
const labelFor = (key: string) => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function toItem(product: Product, categoriesById: Map<string, Category>): CatalogItem {
  const category = categoriesById.get(product.categoryId);
  return {
    slug: product.slug,
    name: product.name,
    description: product.description,
    categoryName: category?.name ?? "Uncategorised",
    categorySlug: category?.slug,
    price: formatPrice(product),
  };
}

// Category list with product counts (one count query per category: 4 today, fine at this size).
async function summariseCategories(): Promise<{ categories: Category[]; summaries: CategorySummary[] }> {
  const { products, categories: categoryRepo } = await getRepositories();
  const categories = await categoryRepo.list();
  const summaries = await Promise.all(
    categories.map(async (category) => ({
      slug: category.slug,
      name: category.name,
      count: (await products.search({ categoryId: category.id, limit: 1, offset: 0 })).total,
    })),
  );
  return { categories, summaries };
}

// Reads through the core ports (ProductRepository / CategoryRepository), so the page does not know
// whether the data comes from Supabase or the sample file.
export async function listCatalog(params: CatalogParams): Promise<CatalogPage> {
  "use cache";
  const { source, products } = await getRepositories();
  const { categories, summaries } = await summariseCategories();
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  // An unknown category slug is ignored rather than treated as "no results".
  const category = categories.find((c) => c.slug === params.categorySlug);

  const query: ProductSearchQuery = {
    text: params.text,
    categoryId: category?.id,
    minPriceMinor: params.minPriceMinor,
    maxPriceMinor: params.maxPriceMinor,
    sort: params.sort,
    limit: CATALOG_PAGE_SIZE,
    offset: (params.page - 1) * CATALOG_PAGE_SIZE,
  };
  const { items, total } = await products.search(query);

  return {
    source,
    params,
    category: summaries.find((summary) => summary.slug === category?.slug),
    categories: summaries,
    items: items.map((product) => toItem(product, categoriesById)),
    total,
    pageCount: Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)),
  };
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  "use cache";
  // The slug comes from the URL: reject anything that isn't a slug before it reaches a query.
  if (!SlugSchema.safeParse(slug).success) return null;
  const { products, categories } = await getRepositories();
  const product = await products.findBySlug(slug);
  // The app reads with the service role, which bypasses RLS, so findBySlug can return drafts and
  // archived products. Until the auth phase moves reads to a user-scoped client, this check is
  // what keeps them off the storefront (RLS would otherwise do it for anonymous shoppers).
  if (!product || product.status !== "active") return null;

  const categoriesById = new Map((await categories.list()).map((category) => [category.id, category]));
  return {
    ...toItem(product, categoriesById),
    attributes: Object.entries(product.attributes).map(([key, value]) => ({ label: labelFor(key), value })),
  };
}

export interface HomeSections {
  categories: CategorySummary[];
  newArrivals: CatalogItem[];
  underTen: CatalogItem[];
}

export const UNDER_PRICE_MINOR = 1000;

export async function getHomeSections(): Promise<HomeSections> {
  "use cache";
  const { products } = await getRepositories();
  const { categories, summaries } = await summariseCategories();
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const [newest, cheap] = await Promise.all([
    products.search({ sort: "newest", limit: 4, offset: 0 }),
    products.search({ sort: "price-asc", maxPriceMinor: UNDER_PRICE_MINOR, limit: 4, offset: 0 }),
  ]);
  return {
    categories: summaries,
    newArrivals: newest.items.map((product) => toItem(product, categoriesById)),
    underTen: cheap.items.map((product) => toItem(product, categoriesById)),
  };
}
