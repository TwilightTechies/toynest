import type { Metadata } from "next";
import Link from "next/link";
import { cardClass, touchLinkClass } from "@/components/ui";
import { SignUpForm } from "../forms";

export const metadata: Metadata = { title: "Create an account · ToyNest", robots: { index: false } };

export default function SignUpPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-12">
      <div className={`${cardClass} p-6 sm:p-8`}>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Create an account</h1>
        <p className="mt-1 mb-6 text-sm text-muted">We&apos;ll email you a link to confirm your address.</p>
        <SignUpForm />
        <p className="mt-5 border-t border-border pt-4 text-sm text-muted">
          Already have an account?{" "}
          <Link href="/account/sign-in" className={`font-semibold text-accent hover:underline ${touchLinkClass}`}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
