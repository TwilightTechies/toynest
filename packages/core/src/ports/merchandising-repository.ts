import type { OrderStatus } from "../domain/order";
import type { Product } from "../domain/product";

export interface BestSellerQuery {
  // ISO timestamp: only orders placed at or after it count (see bestSellerSince).
  since: string;
  // Order statuses that count as a sale (pass SOLD_ORDER_STATUSES).
  soldStatuses: readonly OrderStatus[];
  limit: number;
}

// Port for the home-page shelves (ADR-021). Separate from ProductRepository so the MCP server and
// the draft agent, which only search and look up products, don't have to implement shelf queries.
// Both methods return only ACTIVE products in VISIBLE categories, like the rest of the storefront.
export interface MerchandisingRepository {
  // Products an admin featured, newest first.
  listFeatured(limit: number): Promise<Product[]>;
  // Ranked by units sold (most first), ties by name then id. Products with no sales are absent.
  listBestSellers(query: BestSellerQuery): Promise<Product[]>;
}
