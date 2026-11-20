import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { cardClass, touchLinkClass } from "@/components/ui";
import { getSignedIn, isPhoneOtpEnabled, safeNext } from "@/lib/account";
import { PasswordSignInForm, PhoneCodeForm } from "../forms";

export const metadata: Metadata = { title: "Sign in · ToyNest", robots: { index: false } };

// Two ways in (ADR-022): email + password, or mobile + code while the admin switch is on.
// The tab is a URL parameter (?via=mobile), so it works with plain links and no client state.
export default function SignInPage({ searchParams }: PageProps<"/account/sign-in">) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-12">
      <div className={`${cardClass} p-6 sm:p-8`}>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted">See your orders and keep your basket on every device. Guests can still check out.</p>
        <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading…</p>}>
          <SignIn searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function SignIn({ searchParams }: Pick<PageProps<"/account/sign-in">, "searchParams">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getSignedIn()) redirect(next);
  const phoneEnabled = await isPhoneOtpEnabled();
  const mobile = phoneEnabled && params.via === "mobile";
  const tab = (active: boolean) =>
    `flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold ${touchLinkClass} ${
      active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-surface"
    }`;

  return (
    <div className="mt-6 flex flex-col gap-5">
      {params.link === "expired" && (
        <p role="alert" className="rounded-xl bg-surface px-4 py-3 text-sm">
          That link has expired or was already used. Sign in, or ask for a new link.
        </p>
      )}
      {phoneEnabled && (
        <nav aria-label="Sign-in method" className="flex gap-1 rounded-full border border-border p-1">
          <Link href={`/account/sign-in?next=${next}`} aria-current={!mobile ? "page" : undefined} className={tab(!mobile)}>
            Email
          </Link>
          <Link href={`/account/sign-in?via=mobile&next=${next}`} aria-current={mobile ? "page" : undefined} className={tab(mobile)}>
            Mobile number
          </Link>
        </nav>
      )}
      {mobile ? <PhoneCodeForm next={next} /> : <PasswordSignInForm next={next} />}
      <p className="border-t border-border pt-4 text-sm text-muted">
        New here?{" "}
        <Link href="/account/sign-up" className={`font-semibold text-accent hover:underline ${touchLinkClass}`}>
          Create an account
        </Link>
        {phoneEnabled && !mobile && " or sign in with your mobile number."}
      </p>
    </div>
  );
}
