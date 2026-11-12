import type { Product, ProductSort } from "../domain/product";

export interface ProductSearchQuery {
  text?: string;
  categoryId?: string;
  // Inclusive bounds in minor units (pence).
  minPriceMinor?: number;
  maxPriceMinor?: number;
  // Defaults to "relevance". Every sort breaks ties by name, so pages are stable.
  sort?: ProductSort;
  limit: number;
  offset: number;
}

// Port: implemented by an adapter (e.g. Supabase). Core never imports a vendor SDK.
export interface ProductRepository {
  findBySlug(slug: string): Promise<Product | null>;
  search(query: ProductSearchQuery): Promise<{ items: Product[]; total: number }>;
}
