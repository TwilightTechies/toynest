import "server-only";
import { createSharpImageProcessor } from "@toynest/adapters/images";
import { createSupabaseAdminContext, readSupabaseEnv, type SupabaseAdminContext } from "@toynest/adapters/supabase";
import {
  createProductAdminService,
  createProductImageService,
  type AdminUser,
  type ProductAdminService,
  type ProductImageService,
} from "@toynest/core";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { loadRootEnv } from "./env";
import { LOGIN_PATH } from "./login-path";

// Admin sign-in and catalogue editing (ADR-016).
// Every admin read and write goes through a Supabase client carrying the signed-in user's session
// (anon key + their JWT), so RLS checks it in the database too. The service role is never used here.

export { LOGIN_PATH };

// null = Supabase (with the anon key) isn't configured; the admin needs a real database.
// cache(): one client per request, shared by the layout, the page and any server action.
export const getAdminContext = cache(async (): Promise<SupabaseAdminContext | null> => {
  loadRootEnv();
  const env = readSupabaseEnv();
  if (!env?.SUPABASE_ANON_KEY) return null;
  // Request-time only: the auth client reads the clock (token expiry), which must never happen while
  // Next prerenders a shared shell.
  await connection();
  const store = await cookies();
  return createSupabaseAdminContext({
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    secureCookies: process.env.NODE_ENV === "production",
    cookies: {
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components can't set cookies. The proxy has already refreshed the session for
          // this request, so a write here is only a duplicate refresh and safe to skip.
        }
      },
    },
  });
});

export interface AdminAccess {
  user: AdminUser;
  context: SupabaseAdminContext;
  catalogue: ProductAdminService;
  photos: ProductImageService;
}

// Isolation layer 3: call this in EVERY admin page and server action, not only the layout. Layouts
// and pages render in parallel (a page's data fetch can start before the layout redirects), and a
// server action is a public POST endpoint that never runs the layout at all.
// Layer 4 is RLS: even without this check, a non-admin's writes would be refused by the database.
export const requireAdmin = cache(async (): Promise<AdminAccess> => {
  const context = await getAdminContext();
  if (!context) redirect(LOGIN_PATH);
  const user = await context.session.currentUser();
  if (!user) redirect(LOGIN_PATH);
  if (!(await context.session.isAdmin())) redirect(`${LOGIN_PATH}?denied=1`);
  return {
    user,
    context,
    catalogue: createProductAdminService(context.products, context.categories),
    photos: createProductImageService(context.productImages, context.products, createSharpImageProcessor()),
  };
});
