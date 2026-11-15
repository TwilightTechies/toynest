import type { CartLine } from "./cart";
import type { Product } from "./product";
import type { ShippingZone } from "./shipping";

export type PricedLine =
  | { line: CartLine; product: Product; status: "ok"; unitPriceMinor: number; lineTotalMinor: number }
  // The product was removed or is no longer active: shown to the shopper, excluded from totals.
  | { line: CartLine; product: Product | null; status: "unavailable" };

export interface PricedCart {
  lines: PricedLine[];
  itemCount: number;
  subtotalMinor: number;
  zone: ShippingZone | null;
  // null until a pincode (and so a zone) is known.
  deliveryMinor: number | null;
  // How much more to spend for free delivery; null when already free, unknown or never free.
  freeDeliveryRemainingMinor: number | null;
  // Subtotal plus delivery; equals the subtotal while delivery is unknown.
  totalMinor: number;
}

// The only place a basket total is computed. Pure: prices come from the current product rows
// passed in, never from the client or the stored cart.
export function priceCart({
  lines,
  products,
  zone,
}: {
  lines: CartLine[];
  products: Product[];
  zone: ShippingZone | null;
}): PricedCart {
  const byId = new Map(products.map((product) => [product.id, product]));
  const priced: PricedLine[] = lines.map((line) => {
    const product = byId.get(line.productId) ?? null;
    if (!product || product.status !== "active") return { line, product, status: "unavailable" };
    return {
      line,
      product,
      status: "ok",
      unitPriceMinor: product.priceMinor,
      lineTotalMinor: product.priceMinor * line.quantity,
    };
  });

  const available = priced.filter((p) => p.status === "ok");
  const subtotalMinor = available.reduce((sum, p) => sum + p.lineTotalMinor, 0);
  const itemCount = available.reduce((sum, p) => sum + p.line.quantity, 0);

  let deliveryMinor: number | null = null;
  let freeDeliveryRemainingMinor: number | null = null;
  if (zone) {
    const free = itemCount === 0 || (zone.freeOverMinor !== null && subtotalMinor >= zone.freeOverMinor);
    deliveryMinor = free ? 0 : zone.feeMinor;
    if (!free && zone.freeOverMinor !== null) freeDeliveryRemainingMinor = zone.freeOverMinor - subtotalMinor;
  }

  return {
    lines: priced,
    itemCount,
    subtotalMinor,
    zone,
    deliveryMinor,
    freeDeliveryRemainingMinor,
    totalMinor: subtotalMinor + (deliveryMinor ?? 0),
  };
}

// For sale right now means active AND in a shown category (ADR-018). A product in a hidden category is
// priced like an archived one ("unavailable", left out of totals) but keeps its name, so the shopper
// can still see which line it was. `shownCategoryIds` comes from the shop's category list.
export function markNotForSale(products: Product[], shownCategoryIds: ReadonlySet<string>): Product[] {
  return products.map((product) => (shownCategoryIds.has(product.categoryId) ? product : { ...product, status: "archived" as const }));
}
