import type { OrderStatus } from "./order";

// Home-page shelves beyond browsing (ADR-021): admin-picked "Featured" and sales-ranked "Best sellers".

// An order counts as a sale once it is placed: paid online, or Cash on Delivery (placed at once).
// Left out: awaiting_payment (unpaid, or a failed online payment) and cancelled.
// The single definition: the SQL function receives it as a parameter, the in-memory adapter uses it.
export const SOLD_ORDER_STATUSES = ["placed", "dispatched", "delivered"] as const satisfies readonly OrderStatus[];

export const BEST_SELLER_WINDOW_DAYS = 90;

// Each home shelf shows up to this many products (a 2×2 grid on phones, one row from lg).
export const HOME_SHELF_SIZE = 4;

// One product is not a ranking: below this the Best sellers shelf is hidden rather than padded
// (padding with newest products would repeat the New arrivals shelf).
export const MIN_BEST_SELLERS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

// Start of the best-seller window, as an ISO timestamp for the repository.
export function bestSellerSince(now: Date, days: number = BEST_SELLER_WINDOW_DAYS): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

// A shelf with fewer than `min` items is not shown at all.
export function shelfOrEmpty<T>(items: T[], min: number): T[] {
  return items.length >= min ? items : [];
}

export function isSoldStatus(status: OrderStatus): boolean {
  return (SOLD_ORDER_STATUSES as readonly OrderStatus[]).includes(status);
}
