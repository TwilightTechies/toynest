import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "./client";

export type { CookieOptions as SessionCookieOptions };

// The web app's cookie store, passed in so this package never imports Next.js.
export interface SessionCookieJar {
  getAll(): { name: string; value: string }[];
  // Server components can't set cookies; the caller may ignore writes there (the proxy refreshes).
  setAll(cookies: { name: string; value: string; options: CookieOptions }[]): void;
}

export interface SessionClientOptions {
  url: string;
  // The public key: every request then runs as the signed-in user, subject to RLS.
  anonKey: string;
  cookies: SessionCookieJar;
  secureCookies: boolean;
  timeoutMs?: number;
}

// One Supabase client per request carrying a user's session from httpOnly cookies (ADR-016, ADR-022).
// Shared by the admin and the customer contexts. PKCE flow (the @supabase/ssr default), so email
// links come back with a ?code= that only the browser which asked for them can exchange.
export function createSessionClient({ url, anonKey, cookies, secureCookies, timeoutMs = 5000 }: SessionClientOptions): SupabaseClient {
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      // Hardened regardless of the library's defaults: page scripts can't read the tokens (httpOnly),
      // cross-site POSTs don't carry them (lax), and they travel over HTTPS only in production.
      setAll: (list) =>
        cookies.setAll(
          list.map((cookie) => ({
            ...cookie,
            options: { ...cookie.options, httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/" },
          })),
        ),
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) }),
    },
  });
}

// Supabase's session cookies are named sb-<project-ref>-auth-token (split into .0, .1 when large).
// Lets the proxy skip the auth server entirely for visitors who have never signed in.
export const hasSessionCookie = (names: string[]) => names.some((name) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
