import type { Metadata } from "next";
import { Suspense } from "react";
import { cardClass } from "@/components/ui";
import { requireSignedIn } from "@/lib/account";
import { NewPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Choose a new password · ToyNest", robots: { index: false } };

// Reached from the reset email: /auth/callback has already signed the shopper in.
export default function ResetPasswordPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-12">
      <div className={`${cardClass} p-6 sm:p-8`}>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading…</p>}>
          <Gate />
        </Suspense>
      </div>
    </main>
  );
}

async function Gate() {
  await requireSignedIn();
  return (
    <div className="mt-6">
      <NewPasswordForm />
    </div>
  );
}
