import type { Category } from "../domain/category";

export interface CategoryRepository {
  list(): Promise<Category[]>;
}
