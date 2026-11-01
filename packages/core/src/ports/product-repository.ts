import type { Product } from "../domain/product";

export interface ProductSearchQuery {
  text?: string;
  categoryId?: string;
  limit: number;
  offset: number;
}

// Port: implemented by an adapter (e.g. Supabase). Core never imports a vendor SDK.
export interface ProductRepository {
  findBySlug(slug: string): Promise<Product | null>;
  search(query: ProductSearchQuery): Promise<{ items: Product[]; total: number }>;
}
