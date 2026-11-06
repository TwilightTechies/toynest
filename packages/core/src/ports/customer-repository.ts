import type { Customer } from "../domain/customer";

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
}
