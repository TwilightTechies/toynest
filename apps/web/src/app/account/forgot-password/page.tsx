import type { Metadata } from "next";
import { cardClass } from "@/components/ui";
import { ForgotPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Forgot password · ToyNest", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-12">
      <div className={`${cardClass} p-6 sm:p-8`}>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Enter your email and we&apos;ll send a link to choose a new one.</p>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
