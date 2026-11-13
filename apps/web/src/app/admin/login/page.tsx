import type { Metadata } from "next";
import { Suspense } from "react";
import { cardClass } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin sign-in · ToyNest", robots: { index: false } };

export default function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <div className={`${cardClass} p-6 sm:p-8`}>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Admin sign-in</h1>
        <p className="mt-1 text-sm text-muted">For ToyNest staff. Shoppers don&apos;t need an account yet.</p>
        <Suspense>
          <Denied searchParams={searchParams} />
        </Suspense>
        <LoginForm />
      </div>
    </main>
  );
}

// Shown when a signed-in account without the admin role reached an admin page.
async function Denied({ searchParams }: Pick<PageProps<"/admin/login">, "searchParams">) {
  const { denied } = await searchParams;
  if (denied !== "1") return null;
  return (
    <p role="alert" className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm">
      That account doesn&apos;t have admin access. Sign in with an admin account.
    </p>
  );
}
