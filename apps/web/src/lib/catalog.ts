import "server-only";
import {
  CATALOG_PAGE_SIZE,
  formatMoney,
  isPersonalisable,
  SlugSchema,
  type CatalogParams,
  type Category,
  smallImageWidth,
  type Product,
  type ProductImage,
  type ProductSearchQuery,
} from "@toynest/core";
import { cacheTag } from "next/cache";
import { getRepositories, type DataSource } from "./data";

// Every cached catalogue read carries this tag; admin writes call updateTag(CATALOG_CACHE_TAG) so
// shoppers see an edit on their next request instead of when the cache expires (ADR-016).
export const CATALOG_CACHE_TAG = "catalog";

// A stored product photo, ready for <img srcset> (ADR-017).
export interface CatalogPhoto {
  alt: string;
  large: string;
  small: string;
  // Intrinsic size of the large file, so the browser reserves space before it loads.
  width: number;
  height: number;
  smallWidth: number;
}

export interface CatalogItem {
  // The main photo (position 0). Absent = show the category placeholder art.
  image?: CatalogPhoto;
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
  // Every photo in display order (the gallery); empty = placeholder art.
  images: CatalogPhoto[];
  attributes: { label: string; value: string }[];
  // Needs a name to engrave before it can go in the basket (attributes.personalisation = "name").
  personalisable: boolean;
}

// Prices are formatted on the server from integer minor units; the client never computes money.
const formatPrice = (product: Product) => formatMoney(product.priceMinor, product.currency);

// "ageRange" -> "Age range"
const labelFor = (key: string) => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const toPhoto = (image: ProductImage): CatalogPhoto => ({
  alt: image.alt,
  large: image.urls.large,
  small: image.urls.small,
  width: image.width,
  height: image.height,
  smallWidth: smallImageWidth(image),
});

// One query for all the photos on a page or shelf, rather than one per product.
async function photosFor(products: Product[]): Promise<Map<string, ProductImage[]>> {
  if (products.length === 0) return new Map();
  const { images } = await getRepositories();
  return images.listForProducts(products.map((product) => product.id));
}

function toItem(product: Product, categoriesById: Map<string, Category>, photos?: Map<string, ProductImage[]>): CatalogItem {
  const category = categoriesById.get(product.categoryId);
  const main = photos?.get(product.id)?.[0];
  return {
    ...(main ? { image: toPhoto(main) } : {}),
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
  cacheTag(CATALOG_CACHE_TAG);
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
  const photos = await photosFor(items);

  return {
    source,
    params,
    category: summaries.find((summary) => summary.slug === category?.slug),
    categories: summaries,
    items: items.map((product) => toItem(product, categoriesById, photos)),
    total,
    pageCount: Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)),
  };
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  "use cache";
  cacheTag(CATALOG_CACHE_TAG);
  // The slug comes from the URL: reject anything that isn't a slug before it reaches a query.
  if (!SlugSchema.safeParse(slug).success) return null;
  const { products, categories } = await getRepositories();
  const product = await products.findBySlug(slug);
  // The app reads with the service role, which bypasses RLS, so findBySlug can return drafts and
  // archived products. Until the auth phase moves reads to a user-scoped client, this check is
  // what keeps them off the storefront (RLS would otherwise do it for anonymous shoppers).
  if (!product || product.status !== "active") return null;

  const categoriesById = new Map((await categories.list()).map((category) => [category.id, category]));
  const photos = await photosFor([product]);
  return {
    ...toItem(product, categoriesById, photos),
    images: (photos.get(product.id) ?? []).map(toPhoto),
    attributes: Object.entries(product.attributes).map(([key, value]) =>
      key === "personalisation" && value === "name"
        ? { label: "Personalisation", value: "Engraved with a name (up to 20 characters)" }
        : { label: labelFor(key), value },
    ),
    personalisable: isPersonalisable(product),
  };
}

export interface HomeSections {
  categories: CategorySummary[];
  newArrivals: CatalogItem[];
  underTen: CatalogItem[];
}

export const UNDER_PRICE_MINOR = 50000; // ₹500

export async function getHomeSections(): Promise<HomeSections> {
  "use cache";
  cacheTag(CATALOG_CACHE_TAG);
  const { products } = await getRepositories();
  const { categories, summaries } = await summariseCategories();
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const [newest, cheap] = await Promise.all([
    products.search({ sort: "newest", limit: 4, offset: 0 }),
    products.search({ sort: "price-asc", maxPriceMinor: UNDER_PRICE_MINOR, limit: 4, offset: 0 }),
  ]);
  const photos = await photosFor([...newest.items, ...cheap.items]);
  return {
    categories: summaries,
    newArrivals: newest.items.map((product) => toItem(product, categoriesById, photos)),
    underTen: cheap.items.map((product) => toItem(product, categoriesById, photos)),
  };
}
