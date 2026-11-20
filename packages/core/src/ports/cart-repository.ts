import type { Cart } from "../domain/cart";

// Every method is scoped by cartId (the secret in the shopper's cookie): a line id from another
// cart is treated as not found, the same idea as orders being scoped by customer id.
export interface CartRepository {
  create(): Promise<Cart>;
  // null for an unknown id (expired, deleted or made up).
  get(cartId: string): Promise<Cart | null>;
  // Adds to an existing line with the same product and name, capped at MAX_LINE_QUANTITY;
  // otherwise creates a line. Atomic: two quick adds never create duplicates.
  addLine(cartId: string, line: { productId: string; personalisationName: string | null; quantity: number }): Promise<void>;
  // Returns false when the line is not in this cart.
  setQuantity(cartId: string, lineId: string, quantity: number): Promise<boolean>;
  removeLine(cartId: string, lineId: string): Promise<boolean>;
  setPincode(cartId: string, pincode: string | null): Promise<void>;
  // After a successful order (ADR-019). Deleting an unknown cart is not an error.
  delete(cartId: string): Promise<void>;
  // Accounts (ADR-022): the signed-in customer's basket (the newest, if several), or null.
  findForCustomer(customerId: string): Promise<Cart | null>;
  // Makes a guest basket the customer's, but only if nobody owns it yet (or they already do).
  // false = another account's basket (e.g. a stale cookie on a shared device): never merge it.
  claimForCustomer(cartId: string, customerId: string): Promise<boolean>;
}
