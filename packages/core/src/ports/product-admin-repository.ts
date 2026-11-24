import type { ProductStatus } from "../domain/product";
import type { AdminProduct, ProductInput } from "../domain/product-admin";

export interface AdminProductQuery {
  // Matches anywhere in the name, case-insensitive.
  text?: string;
  status?: ProductStatus;
  categoryId?: string;
  limit: number;
  offset: number;
}

// Write port for the admin catalogue (ADR-016), separate from the storefront's read-only
// ProductRepository so storefront code can't reach a write method. The Supabase adapter runs with the
// signed-in admin's session, so RLS checks every call independently of the app's own admin check.
export interface ProductAdminRepository {
  // Every status, newest first.
  list(query: AdminProductQuery): Promise<{ items: AdminProduct[]; total: number }>;
  get(id: string): Promise<AdminProduct | null>;
  // Always created as a draft. Throws SlugTakenError.
  create(input: ProductInput): Promise<AdminProduct>;
  // Only if the row still has `expectedVersion`; otherwise ConflictError. Throws SlugTakenError.
  update(id: string, input: ProductInput, expectedVersion: string): Promise<AdminProduct>;
  setStatus(id: string, status: ProductStatus, expectedVersion: string): Promise<AdminProduct>;
  // Same version check as setStatus (ADR-021).
  setFeatured(id: string, featured: boolean, expectedVersion: string): Promise<AdminProduct>;
  // Which of these products appear in at least one order line (ADR-023)? One query for a list page.
  orderedAmong(ids: string[]): Promise<Set<string>>;
  // Deletes the row (photo rows and cart lines cascade), then its photo files (best effort: a file
  // left behind is logged for the orphan-cleanup job). ConflictError if the version moved or the row
  // is gone; HasOrdersError if it was ordered (the database refuses).
  delete(id: string, expectedVersion: string): Promise<void>;
}
