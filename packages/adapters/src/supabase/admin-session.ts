import type { AdminSession, AdminUser } from "@toynest/core";
import { z } from "zod";
import { toRepositoryError } from "./errors";
import { createSupabaseProductAdminRepository } from "./product-admin-repository";
import { createSupabaseProductImageAdminRepository } from "./product-image-repository";
import { createSupabaseCategoryAdminRepository } from "./category-admin-repository";
import { createSupabaseAdminOrderRepository } from "./checkout-repository";
import { createSessionClient, type SessionClientOptions } from "./session-client";
import { createSupabaseStoreSettingsAdmin, createSupabaseSmsOutbox } from "./store-settings";

export type { SessionCookieJar, SessionCookieOptions } from "./session-client";
export type AdminContextOptions = SessionClientOptions;

const EmailSchema = z.email();

// ADR-016. One Supabase client per request, carrying the admin's session from httpOnly cookies.
// The session, the admin product repository and categories all share it, so every database call is
// made as this user and RLS applies (isolation layer 4), never with the service role.
export function createSupabaseAdminContext(options: AdminContextOptions) {
  const client = createSessionClient(options);

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
    productImages: createSupabaseProductImageAdminRepository(client),
    // All categories, hidden ones included: admins prepare seasonal ranges before showing them.
    categories: createSupabaseCategoryAdminRepository(client),
    orders: createSupabaseAdminOrderRepository(client),
    // Shop switches and the mock SMS outbox (ADR-022), both behind admin RLS policies.
    settings: createSupabaseStoreSettingsAdmin(client),
    smsOutbox: createSupabaseSmsOutbox(client),
  };
}

export type SupabaseAdminContext = ReturnType<typeof createSupabaseAdminContext>;
