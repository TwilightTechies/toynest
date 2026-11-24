import { z } from "zod";

// Stock per product (ADR-023). null = not tracked: the product sells without limit, as every product
// did before stock existed. Only place_order() in the database reduces stock, in the same transaction
// as the order; these rules are for showing it and for friendly checks before that final say.

export const MAX_STOCK = 99_999;
export const StockSchema = z.number().int().min(0, "Stock can't be negative").max(MAX_STOCK, `Stock can be at most ${MAX_STOCK}`).nullable();
export type Stock = z.infer<typeof StockSchema>;

// At or below this many units, shoppers see "Only n left" and admins a Low badge.
export const LOW_STOCK = 5;

export type Availability =
  | { kind: "untracked" }
  | { kind: "in_stock"; units: number }
  | { kind: "low"; units: number }
  | { kind: "sold_out" };

export function availability(stock: Stock): Availability {
  if (stock === null) return { kind: "untracked" };
  if (stock <= 0) return { kind: "sold_out" };
  return stock <= LOW_STOCK ? { kind: "low", units: stock } : { kind: "in_stock", units: stock };
}

// Admin text box → stock. "" = not tracked. Returns an error message for anything else that isn't a
// whole number in range.
export function parseStock(text: string): { ok: true; stock: Stock } | { ok: false; error: string } {
  const cleaned = text.trim().replace(/,/g, "");
  if (cleaned === "") return { ok: true, stock: null };
  if (!/^\d{1,6}$/.test(cleaned)) return { ok: false, error: "Enter stock as a whole number, or leave it empty to not track it." };
  const parsed = StockSchema.safeParse(Number(cleaned));
  return parsed.success ? { ok: true, stock: parsed.data } : { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid stock" };
}

export interface Shortage {
  productId: string;
  // Units on hand now (0 = sold out).
  available: number;
  wanted: number;
}

// Sums the quantity per product across lines (one toy can be on several lines with different names)
// and compares with the stock levels. Untracked or unknown products never fall short.
export function checkStock(
  lines: ReadonlyArray<{ productId: string; quantity: number }>,
  levels: ReadonlyMap<string, Stock>,
): Shortage[] {
  const wanted = new Map<string, number>();
  for (const line of lines) wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.quantity);
  const shortages: Shortage[] = [];
  for (const [productId, quantity] of wanted) {
    const stock = levels.get(productId);
    if (stock != null && quantity > stock) shortages.push({ productId, available: stock, wanted: quantity });
  }
  return shortages;
}
