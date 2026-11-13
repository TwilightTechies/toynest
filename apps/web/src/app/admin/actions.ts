"use server";

import { redirect } from "next/navigation";
import { getAdminContext, LOGIN_PATH } from "@/lib/admin";

export type SignInState = { error: string | null };

// One message for every credential failure, so the form doesn't reveal which emails have accounts.
// Supabase Auth rate-limits repeated attempts on its side.
const WRONG_CREDENTIALS = "That email and password don't match an account.";

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const context = await getAdminContext();
  if (!context) return { error: "Admin needs Supabase: set SUPABASE_URL and SUPABASE_ANON_KEY in .env.local." };

  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string") return { error: WRONG_CREDENTIALS };

  if (!(await context.session.signIn(email.trim(), password))) return { error: WRONG_CREDENTIALS };
  if (!(await context.session.isAdmin())) {
    // Right password, wrong role: don't leave a session behind that the admin pages would reject.
    await context.session.signOut();
    return { error: "This account doesn't have admin access." };
  }
  // A fixed destination: a "next" parameter from the URL would be an open-redirect risk.
  redirect("/admin/products");
}

export async function signOut(): Promise<void> {
  const context = await getAdminContext();
  if (context) await context.session.signOut();
  redirect(LOGIN_PATH);
}
