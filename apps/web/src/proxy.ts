import { createSupabaseAdminContext, readSupabaseEnv } from "@toynest/adapters/supabase";
import { NextResponse, type NextRequest } from "next/server";
import { loadRootEnv } from "./lib/env";
import { LOGIN_PATH } from "./lib/login-path";

// Next 16 "proxy" (formerly middleware), admin routes only (ADR-016). Two jobs:
// 1. Refresh an expired access token and write the new cookies onto the response. Server components
//    can't set cookies, so this is the one place a refresh can be saved.
// 2. Send signed-out visitors to the login page early, as a convenience.
// It is NOT the security check: requireAdmin() in every page and action, plus RLS, are.
export async function proxy(request: NextRequest) {
  loadRootEnv();
  const env = readSupabaseEnv();
  // No Supabase: the admin pages explain that themselves.
  if (!env?.SUPABASE_ANON_KEY) return NextResponse.next();

  let response = NextResponse.next({ request });
  const { session } = createSupabaseAdminContext({
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

  const user = await session.currentUser();
  if (!user && request.nextUrl.pathname !== LOGIN_PATH) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
