import "server-only";
import {
  formatMoney,
  priceCart,
  resolveShippingZone,
  type Cart,
  type CartRepository,
} from "@toynest/core";
import { cookies } from "next/headers";
import { z } from "zod";
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
  const { carts, products, categories, shippingZones } = await getRepositories();
  const cart = await currentCart(carts);
  if (!cart) return null;

  const [rows, zones, categoryList] = await Promise.all([
    products.findByIds([...new Set(cart.lines.map((line) => line.productId))]),
    shippingZones.list(),
    categories.list(),
  ]);
  const zone = cart.pincode ? resolveShippingZone(cart.pincode, zones) : null;
  const priced = priceCart({ lines: cart.lines, products: rows, zone });
  const categorySlugs = new Map(categoryList.map((category) => [category.id, category.slug]));

  return {
    lines: priced.lines.map((p) => ({
      lineId: p.line.id,
      slug: p.product?.slug ?? null,
      name: p.product?.name ?? "Product no longer available",
      categorySlug: p.product ? categorySlugs.get(p.product.categoryId) : undefined,
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

// Header badge: number of items in available lines (0 without a basket).
export async function getBasketCount(): Promise<number> {
  const { carts, products } = await getRepositories();
  const cart = await currentCart(carts);
  if (!cart || cart.lines.length === 0) return 0;
  const rows = await products.findByIds([...new Set(cart.lines.map((line) => line.productId))]);
  return priceCart({ lines: cart.lines, products: rows, zone: null }).itemCount;
}
