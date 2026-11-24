import "server-only";
import {
  availability,
  checkStock,
  formatMoney,
  markNotForSale,
  priceCart,
  resolveShippingZone,
  type Cart,
  type CartRepository,
  type Product,
} from "@toynest/core";
import { toPhoto, type CatalogPhoto } from "./catalog";
import { getRepositories } from "./data";
import { readCartId, setCartCookie } from "./cart-cookie";
import { currentCustomerId } from "./account";

export { CART_COOKIE, clearCartCookie, readCartId, setCartCookie } from "./cart-cookie";

async function currentCart(carts: CartRepository): Promise<Cart | null> {
  const id = await readCartId();
  return id ? carts.get(id) : null;
}

// For server actions that change the basket: the current cart, or a new one (and its cookie).
// Created lazily, so browsing never creates empty carts. A signed-in shopper with no basket cookie
// (new device, cleared cookies) gets their account's basket back, or a new one that is theirs.
export async function cartForWrite(): Promise<{ cart: Cart; carts: CartRepository }> {
  const { carts } = await getRepositories();
  const existing = await currentCart(carts);
  if (existing) return { cart: existing, carts };
  const customerId = await currentCustomerId();
  const owned = customerId ? await carts.findForCustomer(customerId) : null;
  const cart = owned ?? (await carts.create());
  if (customerId && !owned) await carts.claimForCustomer(cart.id, customerId);
  await setCartCookie(cart.id);
  return { cart, carts };
}

export interface BasketLineView {
  lineId: string;
  slug: string | null;
  name: string;
  categorySlug: string | undefined;
  // The product's main photo (ADR-017); absent = the category placeholder.
  image?: CatalogPhoto;
  personalisationName: string | null;
  quantity: number;
  available: boolean;
  // Stock (ADR-023): "Sold out", "Only 2 left", or null when there's plenty or it isn't tracked.
  stockNote: string | null;
  // The basket wants more of this product than is left: checkout is blocked until it's reduced.
  overStock: boolean;
  // false once the basket holds every unit left, so "+" is disabled.
  canAddOne: boolean;
  unitPrice: string | null;
  lineTotal: string | null;
}

export interface BasketView {
  lines: BasketLineView[];
  itemCount: number;
  pincode: string | null;
  zoneName: string | null;
  subtotal: string;
  // null until a pincode is known; "Free" when free.
  delivery: string | null;
  freeDeliveryRemaining: string | null;
  // Free-delivery threshold of the zone, for the "free over" note.
  freeOver: string | null;
  total: string;
  totalMinor: number;
  hasUnavailable: boolean;
  hasStockProblem: boolean;
}

// Loads the basket and prices it with core priceCart from the CURRENT product rows and zones.
// Nothing priced here comes from the browser.
export async function getBasketView(): Promise<BasketView | null> {
  const { carts, products, categories, shippingZones, images, inventory } = await getRepositories();
  const cart = await currentCart(carts);
  if (!cart) return null;

  const productIds = [...new Set(cart.lines.map((line) => line.productId))];
  const [rows, zones, categoryList, photos, levels] = await Promise.all([
    products.findByIds(productIds),
    shippingZones.list(),
    categories.list(),
    // One query for every line's photos.
    images.listForProducts(productIds),
    inventory.levels(productIds),
  ]);
  // Summed per product across lines (one toy with two different names counts twice).
  const short = new Set(checkStock(cart.lines, levels).map((s) => s.productId));
  const inBasket = new Map<string, number>();
  for (const line of cart.lines) inBasket.set(line.productId, (inBasket.get(line.productId) ?? 0) + line.quantity);
  const canAddOne = (productId: string) => {
    const stock = levels.get(productId) ?? null;
    return stock === null || (inBasket.get(productId) ?? 0) < stock;
  };
  const stockNote = (productId: string): string | null => {
    const state = availability(levels.get(productId) ?? null);
    if (state.kind === "sold_out") return "Sold out";
    if (state.kind === "low" || (state.kind === "in_stock" && short.has(productId))) return `Only ${state.units} left`;
    return null;
  };
  const zone = cart.pincode ? resolveShippingZone(cart.pincode, zones) : null;
  const priced = priceCart({ lines: cart.lines, products: await withSaleStatus(rows), zone });
  const categorySlugs = new Map(categoryList.map((category) => [category.id, category.slug]));

  const mainPhoto = (productId: string | undefined) => {
    const main = productId ? photos.get(productId)?.[0] : undefined;
    return main ? { image: toPhoto(main) } : {};
  };

  return {
    lines: priced.lines.map((p) => ({
      lineId: p.line.id,
      slug: p.product?.slug ?? null,
      name: p.product?.name ?? "Product no longer available",
      categorySlug: p.product ? categorySlugs.get(p.product.categoryId) : undefined,
      ...mainPhoto(p.product?.id),
      personalisationName: p.line.personalisationName,
      quantity: p.line.quantity,
      available: p.status === "ok",
      stockNote: p.status === "ok" ? stockNote(p.line.productId) : null,
      overStock: p.status === "ok" && short.has(p.line.productId),
      canAddOne: canAddOne(p.line.productId),
      unitPrice: p.status === "ok" ? formatMoney(p.unitPriceMinor) : null,
      lineTotal: p.status === "ok" ? formatMoney(p.lineTotalMinor) : null,
    })),
    itemCount: priced.itemCount,
    pincode: cart.pincode,
    zoneName: priced.zone?.name ?? null,
    subtotal: formatMoney(priced.subtotalMinor),
    delivery: priced.deliveryMinor === null ? null : priced.deliveryMinor === 0 ? "Free" : formatMoney(priced.deliveryMinor),
    freeDeliveryRemaining:
      priced.freeDeliveryRemainingMinor === null ? null : formatMoney(priced.freeDeliveryRemainingMinor),
    freeOver: priced.zone?.freeOverMinor != null ? formatMoney(priced.zone.freeOverMinor) : null,
    total: formatMoney(priced.totalMinor),
    // For rules that compare amounts (e.g. the Cash on Delivery limit); display uses `total`.
    totalMinor: priced.totalMinor,
    hasUnavailable: priced.lines.some((p) => p.status === "unavailable"),
    hasStockProblem: priced.lines.some((p) => p.status === "ok" && short.has(p.line.productId)),
  };
}

// For sale right now: active AND in a shown category (ADR-018). The shop's category list holds shown
// categories only, so a product whose category is missing from it is treated like an archived one.
export async function productsForSale(rows: Product[]): Promise<Product[]> {
  return (await withSaleStatus(rows)).filter((product) => product.status === "active");
}

// For pricing: the shop's category list holds shown categories only (ADR-018), and core's
// markNotForSale prices anything else like an archived product while keeping its name.
async function withSaleStatus(rows: Product[]): Promise<Product[]> {
  const { categories } = await getRepositories();
  return markNotForSale(rows, new Set((await categories.list()).map((category) => category.id)));
}

// Header badge: number of items in available lines (0 without a basket).
export async function getBasketCount(): Promise<number> {
  const { carts, products } = await getRepositories();
  const cart = await currentCart(carts);
  if (!cart || cart.lines.length === 0) return 0;
  const rows = await products.findByIds([...new Set(cart.lines.map((line) => line.productId))]);
  return priceCart({ lines: cart.lines, products: await withSaleStatus(rows), zone: null }).itemCount;
}

