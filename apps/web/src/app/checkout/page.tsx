import { randomUUID } from "node:crypto";
import { COD_MAX_MINOR, formatMoney, INDIAN_STATES } from "@toynest/core";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { cardClass } from "@/components/ui";
import { getBasketView } from "@/lib/cart";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout · ToyNest", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <Link href="/basket" className="text-sm font-semibold text-accent hover:underline">
        ← Back to basket
      </Link>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Checkout</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading your basket…</p>}>
        <Checkout />
      </Suspense>
    </main>
  );
}

async function Checkout() {
  const basket = await getBasketView();
  // Nothing to buy, or something must be removed first: the basket page explains.
  if (!basket || basket.itemCount === 0 || basket.hasUnavailable) redirect("/basket");

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <CheckoutForm
        // A fresh token per page view: submitting this form twice gives one order (ADR-019).
        checkoutToken={randomUUID()}
        defaultPincode={basket.pincode ?? ""}
        states={[...INDIAN_STATES]}
        codAllowed={basket.totalMinor <= COD_MAX_MINOR}
        codLimit={formatMoney(COD_MAX_MINOR)}
      />

      <aside aria-labelledby="summary-heading" className={`${cardClass} flex flex-col gap-4 p-5 lg:sticky lg:top-24`}>
        <h2 id="summary-heading" className="font-display text-xl font-semibold">
          Order summary
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          {basket.lines.map((line) => (
            <li key={line.lineId} className="flex justify-between gap-3">
              <span className="min-w-0">
                {line.name} × {line.quantity}
                {line.personalisationName && <span className="block text-muted">Name: {line.personalisationName}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{line.lineTotal}</span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{basket.subtotal}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Delivery{basket.zoneName ? ` (${basket.zoneName})` : ""}</dt>
            <dd className="tabular-nums">{basket.delivery ?? "From your pincode"}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{basket.total}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted">
          Prices include taxes. Delivery is worked out again for the pincode you enter, and the final total is shown before
          you pay.
        </p>
      </aside>
    </div>
  );
}
