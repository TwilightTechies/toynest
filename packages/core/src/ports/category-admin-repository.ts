import type { AdminCategory, CategoryInput } from "../domain/category-admin";

// Admin port for categories (ADR-018). Unlike the storefront CategoryRepository it sees hidden
// categories too, so admins can prepare a seasonal range before showing it. Its list() has the same
// shape as CategoryRepository.list(), so it can be handed to ProductAdminService.
export interface CategoryAdminRepository {
  // Every category, in sortOrder then name order.
  list(): Promise<AdminCategory[]>;
  get(id: string): Promise<AdminCategory | null>;
  // New categories are hidden and go last, so nothing appears in the shop by accident.
  // Throws SlugTakenError.
  create(input: CategoryInput): Promise<AdminCategory>;
  // The slug is never changed after creation (it is in shop URLs). Throws ConflictError on a stale
  // version.
  update(id: string, input: Omit<CategoryInput, "slug">, expectedVersion: string): Promise<AdminCategory>;
  setVisible(id: string, visible: boolean, expectedVersion: string): Promise<AdminCategory>;
  // `orderedIds` must be every category id; sortOrder becomes 0..n-1 in that order.
  reorder(orderedIds: string[]): Promise<void>;
  // false = it doesn't exist. Throws ConflictError if products still use it.
  remove(id: string): Promise<boolean>;
}
