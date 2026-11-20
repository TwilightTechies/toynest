import { createSupabaseCustomerContext, hasSessionCookie, readSupabaseEnv } from "@toynest/adapters/supabase";
import { NextResponse, type NextRequest } from "next/server";
import { loadRootEnv } from "./lib/env";
import { LOGIN_PATH } from "./lib/login-path";

// Next 16 "proxy" (formerly middleware). Admin (ADR-016) and customer accounts (ADR-022). Two jobs:
// 1. Refresh an expired access token and write the new cookies onto the response. Server components
//    can't set cookies, so this is the one place a refresh can be saved. Visitors who have never
//    signed in carry no session cookie, so they cost nothing: no call to the auth server.
// 2. Send signed-out visitors to a sign-in page early, as a convenience.
// It is NOT the security check: requireAdmin()/requireSignedIn() in every page and action, plus RLS, are.

const ACCOUNT_SIGN_IN = "/account/sign-in";
// Account pages a signed-out visitor may open.
const PUBLIC_ACCOUNT_PATHS = new Set([ACCOUNT_SIGN_IN, "/account/sign-up", "/account/forgot-password"]);

function signInPathFor(pathname: string): string | null {
  if (pathname.startsWith("/admin")) return pathname === LOGIN_PATH ? null : LOGIN_PATH;
  if (pathname === "/account" || pathname.startsWith("/account/")) return PUBLIC_ACCOUNT_PATHS.has(pathname) ? null : ACCOUNT_SIGN_IN;
  return null;
}

export async function proxy(request: NextRequest) {
  const signInPath = signInPathFor(request.nextUrl.pathname);
  const hasSession = hasSessionCookie(request.cookies.getAll().map(({ name }) => name));

  if (!hasSession) {
    return signInPath ? NextResponse.redirect(new URL(signInPath, request.url)) : NextResponse.next();
  }

  loadRootEnv();
  const env = readSupabaseEnv();
  // No Supabase: the pages explain that themselves.
  if (!env?.SUPABASE_ANON_KEY) return NextResponse.next();

  let response = NextResponse.next({ request });
  const { session } = createSupabaseCustomerContext({
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    secureCookies: process.env.NODE_ENV === "production",
    cookies: {
      getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (list) => {
        // Update the request too, so pages rendered for this request see the fresh token.
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        // A response that sets session cookies must never be cached and served to someone else.
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });

  // currentUser() asks the auth server, refreshing an expired token on the way. Phone-only users
  // count as signed in (the admin session type needs an email; this one doesn't).
  const user = await session.currentUser();
  if (!user && signInPath) return NextResponse.redirect(new URL(signInPath, request.url));
  return response;
}

export const config = {
  // Every page, but not static files, images or Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|webp|svg|gif|ico)$).*)"],
};
