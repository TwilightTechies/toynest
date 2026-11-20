import "server-only";
import {
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
}

// Loads the basket and prices it with core priceCart from the CURRENT product rows and zones.
// Nothing priced here comes from the browser.
export async function getBasketView(): Promise<BasketView | null> {
  const { carts, products, categories, shippingZones, images } = await getRepositories();
  const cart = await currentCart(carts);
  if (!cart) return null;

  const productIds = [...new Set(cart.lines.map((line) => line.productId))];
  const [rows, zones, categoryList, photos] = await Promise.all([
    products.findByIds(productIds),
    shippingZones.list(),
    categories.list(),
    // One query for every line's photos.
    images.listForProducts(productIds),
  ]);
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

