import type { Stock } from "../domain/inventory";

// Storefront read of stock levels (ADR-023). Separate from ProductRepository, like
// MerchandisingRepository (ADR-021), so the shop's Product type, search_products() and the MCP/AI
// fakes stay unchanged. Ids that don't exist are absent from the map.
export interface InventoryRepository {
  levels(productIds: string[]): Promise<Map<string, Stock>>;
}
