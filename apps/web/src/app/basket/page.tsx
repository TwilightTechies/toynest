import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PincodeForm } from "@/components/pincode-form";
import { ProductCardPhoto } from "@/components/product-photo";
import { buttonClass, cardClass } from "@/components/ui";
import { getBasketView, type BasketLineView, type BasketView } from "@/lib/cart";
import { removeLine, updateQuantity } from "./actions";

export const metadata: Metadata = { title: "Basket · ToyNest" };

// The basket reads the cart cookie, so it renders per request inside Suspense; the shell stays static.
export default function BasketPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Your basket</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading your basket…</p>}>
        <Basket />
      </Suspense>
    </main>
  );
}

async function Basket() {
  const basket = await getBasketView();
  if (!basket || basket.lines.length === 0) return <EmptyBasket />;

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <section aria-label="Items">
        {basket.hasUnavailable && (
          <p className="mb-4 rounded-xl bg-surface px-4 py-3 text-sm">
            Some items are no longer available. They aren&apos;t included in your total; you can remove them.
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {basket.lines.map((line) => (
            <Line key={line.lineId} line={line} />
          ))}
        </ul>
      </section>
      <Summary basket={basket} />
    </div>
  );
}

function Line({ line }: { line: BasketLineView }) {
  const stepClass =
    "flex h-9 w-9 items-center justify-center rounded-full border border-border-strong text-lg font-semibold hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-border-strong disabled:hover:text-current";
  return (
    <li className={`flex gap-4 p-3 ${cardClass} ${line.available ? "" : "opacity-70"}`}>
      <div className="w-24 shrink-0 sm:w-32">
        <ProductCardPhoto image={line.image} categorySlug={line.categorySlug} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold leading-snug">
              {line.slug && line.available ? (
                <Link href={`/products/${line.slug}`} className="hover:text-accent">
                  {line.name}
                </Link>
              ) : (
                line.name
              )}
            </h2>
            {line.personalisationName && (
              <p className="mt-0.5 text-sm">
                <span className="text-muted">Name:</span> <span className="font-semibold">{line.personalisationName}</span>
              </p>
            )}
            {line.unitPrice && <p className="mt-0.5 text-sm text-muted">{line.unitPrice} each</p>}
            {!line.available && <p className="mt-0.5 text-sm font-semibold text-accent">No longer available</p>}
          </div>
          {line.lineTotal && <p className="shrink-0 font-bold tabular-nums">{line.lineTotal}</p>}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          {line.available ? (
            // − and + are tiny forms: no client JS, and each click sends an absolute quantity.
            <div className="flex items-center gap-2" role="group" aria-label={`Quantity of ${line.name}`}>
              <form action={updateQuantity}>
                <input type="hidden" name="lineId" value={line.lineId} />
                <input type="hidden" name="quantity" value={line.quantity - 1} />
                <button type="submit" disabled={line.quantity <= 1} className={stepClass} aria-label="One fewer">
                  −
                </button>
              </form>
              <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
                {line.quantity}
              </span>
              <form action={updateQuantity}>
                <input type="hidden" name="lineId" value={line.lineId} />
                <input type="hidden" name="quantity" value={line.quantity + 1} />
                <button type="submit" disabled={line.quantity >= 10} className={stepClass} aria-label="One more">
                  +
                </button>
              </form>
            </div>
          ) : (
            <span />
          )}
          <form action={removeLine}>
            <input type="hidden" name="lineId" value={line.lineId} />
            <button type="submit" className="text-sm font-semibold text-muted underline-offset-4 hover:text-accent hover:underline">
              Remove
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

function Summary({ basket }: { basket: BasketView }) {
  return (
    <aside aria-label="Order summary" className={`flex flex-col gap-5 p-5 lg:sticky lg:top-24 ${cardClass}`}>
      <PincodeForm pincode={basket.pincode} />

      <dl className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">
            Subtotal ({basket.itemCount} item{basket.itemCount === 1 ? "" : "s"})
          </dt>
          <dd className="font-semibold tabular-nums">{basket.subtotal}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Delivery{basket.zoneName ? ` · ${basket.zoneName}` : ""}</dt>
          <dd className="text-right font-semibold tabular-nums">{basket.delivery ?? "Enter pincode"}</dd>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-3 text-base">
          <dt className="font-semibold">Total</dt>
          <dd className="font-bold tabular-nums">{basket.total}</dd>
        </div>
      </dl>

      {basket.freeDeliveryRemaining && (
        <p className="rounded-xl bg-sage-soft px-4 py-3 text-sm text-sage-strong">
          Add <strong>{basket.freeDeliveryRemaining}</strong> more for free delivery
          {basket.zoneName ? ` to ${basket.zoneName}` : ""}.
        </p>
      )}
      {basket.delivery === "Free" && basket.itemCount > 0 && (
        <p className="rounded-xl bg-sage-soft px-4 py-3 text-sm text-sage-strong">You get free delivery.</p>
      )}
      {basket.delivery === null && (
        <p className="text-sm text-muted">Delivery charges depend on your pincode.</p>
      )}

      {basket.hasUnavailable ? (
        <p className="text-sm">Remove the items that are no longer available to check out.</p>
      ) : (
        <Link href="/checkout" className={`${buttonClass("primary")} min-h-11`}>
          Checkout
        </Link>
      )}
    </aside>
  );
}

function EmptyBasket() {
  return (
    <div className="mt-8 rounded-2xl bg-surface px-6 py-14 text-center">
      <p className="font-display text-2xl font-semibold">Your basket is empty</p>
      <p className="mt-2 text-muted">Find something worth keeping.</p>
      <Link href="/products" className={`mt-6 ${buttonClass("primary")}`}>
        Shop all toys
      </Link>
    </div>
  );
}
