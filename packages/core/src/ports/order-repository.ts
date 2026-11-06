import type { Order } from "../domain/order";

// Every method is scoped to one customer: there is deliberately no unscoped "find order by id".
// Callers pass the customer id from the session, so a mistyped or guessed order id cannot reach
// another customer's data (the same rule Supabase RLS will enforce in the database).
export interface OrderRepository {
  // Returns null when the order does not exist OR belongs to someone else; callers cannot tell which.
  findForCustomer(customerId: string, orderId: string): Promise<Order | null>;
  // Newest first.
  listForCustomer(customerId: string, limit: number): Promise<Order[]>;
}
