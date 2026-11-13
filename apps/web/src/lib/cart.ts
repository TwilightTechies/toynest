import "server-only";
import {
  formatMoney,
  priceCart,
  resolveShippingZone,
  type Cart,
  type CartRepository,
  type Product,
} from "@toynest/core";
import { cookies } from "next/headers";
import { z } from "zod";
import { toPhoto, type CatalogPhoto } from "./catalog";
import { getRepositories } from "./data";

// The basket lives in the database; the browser holds only its random id (ADR-015).
// httpOnly: page scripts can't read it. sameSite=lax: not sent on cross-site POSTs (CSRF), but kept
// when a shopper follows a link back to the shop. secure in production (HTTPS only).
export const CART_COOKIE = "toynest_cart";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const cookieOptions = () =>
  ({
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  }) as const;

// The cookie is an external boundary: anything that isn't a uuid is treated as "no basket".
async function readCartId(): Promise<string | null> {
  const value = (await cookies()).get(CART_COOKIE)?.value;
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function currentCart(carts: CartRepository): Promise<Cart | null> {
  const id = await readCartId();
  return id ? carts.get(id) : null;
}

// For server actions that change the basket: the current cart, or a new one (and its cookie).
// Created lazily, so browsing never creates empty carts.
export async function cartForWrite(): Promise<{ cart: Cart; carts: CartRepository }> {
  const { carts } = await getRepositories();
  const existing = await currentCart(carts);
  if (existing) return { cart: existing, carts };
  const cart = await carts.create();
  (await cookies()).set(CART_COOKIE, cart.id, cookieOptions());
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
    hasUnavailable: priced.lines.some((p) => p.status === "unavailable"),
  };
}

// For sale right now: active AND in a shown category (ADR-018). The shop's category list holds shown
// categories only, so a product whose category is missing from it is treated like an archived one.
export async function productsForSale(rows: Product[]): Promise<Product[]> {
  return (await withSaleStatus(rows)).filter((product) => product.status === "active");
}

// For pricing: a product in a hidden category is priced like an archived one ("unavailable", left
// out of the total) but keeps its name, so the shopper can see which line it was.
async function withSaleStatus(rows: Product[]): Promise<Product[]> {
  const { categories } = await getRepositories();
  const shown = new Set((await categories.list()).map((category) => category.id));
  return rows.map((product) => (shown.has(product.categoryId) ? product : { ...product, status: "archived" as const }));
}

// Header badge: number of items in available lines (0 without a basket).
export async function getBasketCount(): Promise<number> {
  const { carts, products } = await getRepositories();
  const cart = await currentCart(carts);
  if (!cart || cart.lines.length === 0) return 0;
  const rows = await products.findByIds([...new Set(cart.lines.map((line) => line.productId))]);
  return priceCart({ lines: cart.lines, products: await withSaleStatus(rows), zone: null }).itemCount;
}
