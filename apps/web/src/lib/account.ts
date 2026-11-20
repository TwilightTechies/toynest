import "server-only";
import {
  createSupabaseCustomerContext,
  CustomerProfileConflictError,
  readSupabaseEnv,
  type SupabaseCustomerContext,
} from "@toynest/adapters/supabase";
import { formatIndianMobile, planCartMerge, type AccountCustomer, type CustomerUser } from "@toynest/core";
import { connection } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { clearCartCookie, readCartId, setCartCookie } from "./cart-cookie";
import { getRepositories } from "./data";
import { loadRootEnv } from "./env";

// Customer accounts (ADR-022). Mirrors lib/admin.ts: one Supabase client per request carrying the
// shopper's session (anon key + their JWT in httpOnly cookies), so the account pages' reads run as
// them and RLS applies (layer 4). Server-only work (creating the customer row, baskets, orders)
// uses the service role through the composition root (lib/data.ts).

export const SIGN_IN_PATH = "/account/sign-in";

// null = accounts aren't available (no Supabase, or no anon key).
export const getCustomerContext = cache(async (): Promise<SupabaseCustomerContext | null> => {
  loadRootEnv();
  const env = readSupabaseEnv();
  if (!env?.SUPABASE_ANON_KEY) return null;
  // Request-time only: the auth client reads the clock (token expiry).
  await connection();
  const store = await cookies();
  return createSupabaseCustomerContext({
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    secureCookies: process.env.NODE_ENV === "production",
    cookies: {
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components can't set cookies; the proxy has already refreshed this request.
        }
      },
    },
  });
});

export interface SignedIn {
  user: CustomerUser;
  customer: AccountCustomer;
}

// The signed-in shopper and their customer record, or null. Identity always comes from here (the
// verified session), never from a form field.
export const getSignedIn = cache(async (): Promise<SignedIn | null> => {
  const context = await getCustomerContext();
  if (!context) return null;
  const user = await context.session.currentUser();
  if (!user) return null;
  const { accounts } = await getRepositories();
  if (!accounts) return null;
  try {
    return { user, customer: await accounts.provisioning.ensureForUser(user) };
  } catch (error) {
    if (error instanceof CustomerProfileConflictError) return null;
    throw error;
  }
});

export async function currentCustomerId(): Promise<string | null> {
  return (await getSignedIn())?.customer.id ?? null;
}

// Layer 3 for account pages and actions: call it in each one (layouts and pages render in parallel,
// and server actions are public POST endpoints). RLS on orders is layer 4.
export async function requireSignedIn(): Promise<SignedIn> {
  const signedIn = await getSignedIn();
  if (!signedIn) redirect(SIGN_IN_PATH);
  return signedIn;
}

// The admin's switch for mobile sign-in. Off when unknown: failing closed costs nothing but SMS.
export async function isPhoneOtpEnabled(): Promise<boolean> {
  const { accounts } = await getRepositories();
  if (!accounts) return false;
  try {
    return (await accounts.settings.get()).phoneOtpEnabled;
  } catch {
    return false;
  }
}

// After any successful sign-in: create the customer row (first time), then bring the guest basket
// along. Returns false when the profile can't be created (an older record without a login has the
// same email or phone; linking it is the future "claim" feature, ADR-022).
export async function finishSignIn(name?: string): Promise<boolean> {
  const context = await getCustomerContext();
  const user = context ? await context.session.currentUser() : null;
  const { accounts } = await getRepositories();
  if (!user || !accounts) return false;
  try {
    const customer = await accounts.provisioning.ensureForUser(user, name);
    await mergeGuestBasket(customer.id);
    return true;
  } catch (error) {
    if (error instanceof CustomerProfileConflictError) {
      await context?.session.signOut();
      return false;
    }
    throw error;
  }
}

// The basket in the cookie joins the account's basket (planCartMerge: same product + name add up,
// capped at 10 a line). A basket that belongs to someone else (stale cookie on a shared device)
// is never merged: claimForCustomer refuses it.
async function mergeGuestBasket(customerId: string): Promise<void> {
  const { carts } = await getRepositories();
  const guestId = await readCartId();
  const guest = guestId ? await carts.get(guestId) : null;
  const mine = await carts.findForCustomer(customerId);

  if (guest && (!mine || mine.id === guest.id)) {
    // No account basket yet: the guest basket simply becomes theirs.
    if (await carts.claimForCustomer(guest.id, customerId)) return;
  } else if (guest && mine && (await carts.claimForCustomer(guest.id, customerId))) {
    for (const add of planCartMerge(guest.lines, mine.lines)) await carts.addLine(mine.id, add);
    if (!mine.pincode && guest.pincode) await carts.setPincode(mine.id, guest.pincode);
    await carts.delete(guest.id);
  }

  if (mine) await setCartCookie(mine.id);
  else await clearCartCookie();
}

export async function signOutCustomer(): Promise<void> {
  const context = await getCustomerContext();
  await context?.session.signOut();
  // The basket stays with the account and comes back at the next sign-in.
  await clearCartCookie();
}

// Mock SMS delivery (SMS_DELIVERY=mock): the code goes to the server log (the terminal locally,
// function logs on Vercel), never to the shopper's page, which would defeat the check.
export async function logMockSms(e164: string): Promise<void> {
  if (process.env.SMS_DELIVERY !== "mock") return;
  const { accounts } = await getRepositories();
  const sms = await accounts?.smsOutbox.latestFor(e164);
  if (sms) console.info(`[mock-sms] ${formatIndianMobile(e164, { masked: true })} code ${sms.otp}`);
}

// Absolute URLs for email links (confirmation, password reset). Supabase only redirects to URLs on
// the project's allow-list, so a forged Host header can't send the link elsewhere.
export async function siteUrl(path: string): Promise<string> {
  const configured = process.env.SITE_URL?.replace(/\/$/, "");
  if (configured) return `${configured}${path}`;
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}

// Where a sign-in may send the shopper next: a fixed list, never a URL from the request
// (open-redirect risk).
const NEXT_PATHS = ["/account", "/checkout", "/basket", "/account/reset-password"] as const;
export type NextPath = (typeof NEXT_PATHS)[number];
export function safeNext(value: unknown, fallback: NextPath = "/account"): NextPath {
  return NEXT_PATHS.find((path) => path === value) ?? fallback;
}
