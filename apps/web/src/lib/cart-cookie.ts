import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";

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

// Accounts (ADR-022): after sign-in the cookie points at the account's basket. It is dropped after
// an order succeeds (ADR-019: the shopper starts fresh) and at sign-out (the basket stays with the
// account and comes back at the next sign-in).
export async function setCartCookie(cartId: string): Promise<void> {
  (await cookies()).set(CART_COOKIE, cartId, cookieOptions());
}

export async function clearCartCookie(): Promise<void> {
  (await cookies()).delete(CART_COOKIE);
}

// The cookie is an external boundary: anything that isn't a uuid is treated as "no basket".
export async function readCartId(): Promise<string | null> {
  const value = (await cookies()).get(CART_COOKIE)?.value;
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : null;
}
