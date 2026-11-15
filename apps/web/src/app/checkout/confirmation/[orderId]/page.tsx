import { formatMoney } from "@toynest/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Badge, buttonClass, cardClass } from "@/components/ui";
import { getCheckoutOrder, paymentStatusText } from "@/lib/checkout";

export const metadata: Metadata = { title: "Order confirmed · ToyNest", robots: { index: false } };

// Reached through the order's random id (a capability URL: guest orders have no account yet).
export default function ConfirmationPage({ params }: PageProps<"/checkout/confirmation/[orderId]">) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-10">
      <Suspense fallback={<p className="text-sm text-muted">Loading your order…</p>}>
        <Confirmation params={params} />
      </Suspense>
    </main>
  );
}

async function Confirmation({ params }: Pick<PageProps<"/checkout/confirmation/[orderId]">, "params">) {
  const { orderId } = await params;
  const order = await getCheckoutOrder(orderId);
  if (!order) notFound();
  // Not paid yet (e.g. a bookmarked link): back to the payment page.
  if (order.paymentStatus === "pending" || order.paymentStatus === "failed") redirect(`/checkout/pay/${order.id}`);

  const money = (minor: number) => formatMoney(minor, order.currency);
  const { details } = order;

  return (
    <>
      <div className="rounded-2xl bg-sage-soft p-5 text-sage-strong">
        <p className="text-sm font-semibold">Thank you, {details.name.split(" ")[0]}!</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Order {order.orderNumber} is confirmed</h1>
        <p className="mt-2 text-sm">
          {order.paymentStatus === "cod_due"
            ? `Please keep ${money(order.totalMinor)} ready for the courier.`
            : "Your payment was received."}{" "}
          We&apos;ll send updates to {details.email}.
        </p>
      </div>

      <section className={`${cardClass} mt-6 p-5`} aria-labelledby="items-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="items-heading" className="font-display text-xl font-semibold">
            Your order
          </h2>
          <Badge tone={order.paymentStatus === "paid" ? "sage" : "neutral"}>{paymentStatusText[order.paymentStatus]}</Badge>
        </div>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {order.lines.map((line, index) => (
            <li key={`${line.productSlug}-${index}`} className="flex justify-between gap-3">
              <span>
                {line.productName} × {line.quantity}
                {line.personalisationName && <span className="block text-muted">Name: {line.personalisationName}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{money(line.unitPriceMinor * line.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{money(order.subtotalMinor)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Delivery ({order.zoneName})</dt>
            <dd className="tabular-nums">{order.deliveryMinor === 0 ? "Free" : money(order.deliveryMinor)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(order.totalMinor)}</dd>
          </div>
        </dl>
      </section>

      <section className={`${cardClass} mt-4 p-5 text-sm`} aria-labelledby="address-heading">
        <h2 id="address-heading" className="font-display text-xl font-semibold">
          Delivering to
        </h2>
        <address className="mt-2 not-italic leading-relaxed">
          {details.name}
          <br />
          {details.line1}
          {details.line2 && (
            <>
              <br />
              {details.line2}
            </>
          )}
          <br />
          {details.city}, {details.state} {details.pincode}
          <br />
          Mobile: {details.phone}
        </address>
      </section>

      <p className="mt-6 text-sm text-muted">
        Keep this page&apos;s link to check your order: guest orders don&apos;t have an account yet.
      </p>
      <Link href="/products" className={`${buttonClass("secondary")} mt-4 min-h-11`}>
        Continue shopping
      </Link>
    </>
  );
}
