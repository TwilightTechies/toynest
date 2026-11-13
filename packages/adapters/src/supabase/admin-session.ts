import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { AdminSession, AdminUser } from "@toynest/core";
import { z } from "zod";
import { toRepositoryError } from "./errors";
import { createSupabaseProductAdminRepository } from "./product-admin-repository";
import { createSupabaseCategoryRepository } from "./repositories";

export type { CookieOptions as SessionCookieOptions };

// The web app's cookie store, passed in so this package never imports Next.js.
export interface SessionCookieJar {
  getAll(): { name: string; value: string }[];
  // Server components can't set cookies; the caller may ignore writes there (the proxy refreshes).
  setAll(cookies: { name: string; value: string; options: CookieOptions }[]): void;
}

export interface AdminContextOptions {
  url: string;
  // The public key: every request then runs as the signed-in user, subject to RLS.
  anonKey: string;
  cookies: SessionCookieJar;
  secureCookies: boolean;
  timeoutMs?: number;
}

const EmailSchema = z.email();

// ADR-016. One Supabase client per request, carrying the admin's session from httpOnly cookies.
// The session, the admin product repository and categories all share it, so every database call is
// made as this user and RLS applies (isolation layer 4), never with the service role.
export function createSupabaseAdminContext({ url, anonKey, cookies, secureCookies, timeoutMs = 5000 }: AdminContextOptions) {
  const client = createServerClient(url, anonKey, {
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

  const session: AdminSession = {
    async signIn(email, password) {
      if (!EmailSchema.safeParse(email).success || password.length === 0) return false;
      const { error } = await client.auth.signInWithPassword({ email, password });
      return !error;
    },

    async signOut() {
      // Revokes the refresh token server-side and clears the cookies.
      await client.auth.signOut();
    },

    // getUser() asks the auth server, so a forged or revoked token is rejected. (Decoding the cookie
    // alone would trust whatever the browser sent.) It also refreshes an expired access token.
    async currentUser(): Promise<AdminUser | null> {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user?.email) return null;
      return { id: data.user.id, email: data.user.email };
    },

    async isAdmin() {
      const result = await client.rpc("is_admin");
      // Signed out: the anon role may not call is_admin at all, which simply means "no".
      if (result.error) {
        if (result.status === 401 || result.status === 403 || result.error.code === "42501") return false;
        throw toRepositoryError(result, "session.isAdmin");
      }
      return z.boolean().parse(result.data);
    },
  };

  return {
    session,
    products: createSupabaseProductAdminRepository(client),
    categories: createSupabaseCategoryRepository(client),
  };
}

export type SupabaseAdminContext = ReturnType<typeof createSupabaseAdminContext>;
