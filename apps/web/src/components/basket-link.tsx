import Link from "next/link";
import { RepositoryUnavailableError } from "@toynest/core";
import { Suspense } from "react";
import { getBasketCount } from "@/lib/cart";

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </svg>
  );
}

function BasketLinkView({ count }: { count: number | null }) {
  const label = count ? `Basket, ${count} item${count === 1 ? "" : "s"}` : "Basket";
  return (
    <Link href="/basket" aria-label={label} className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface hover:text-accent">
      <BagIcon />
      {count ? (
        <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

// The header is on every page: a database blip must not break a product page over a badge, so an
// unavailable database shows the plain link (the basket page itself reports the problem). Bugs still
// throw. (In `next dev`, Next also aborts the fetches of a discarded validation render; that lands here.)
async function countOrNull(): Promise<number | null> {
  try {
    return await getBasketCount();
  } catch (error) {
    if (error instanceof RepositoryUnavailableError) return null;
    throw error;
  }
}

async function BasketCount() {
  return <BasketLinkView count={await countOrNull()} />;
}

// The count reads the cart cookie, so only this link renders per request (inside Suspense);
// the rest of the header stays in the static shell. The fallback is the same link without a count.
export function BasketLink() {
  return (
    <Suspense fallback={<BasketLinkView count={null} />}>
      <BasketCount />
    </Suspense>
  );
}
