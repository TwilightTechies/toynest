import { formatMoney } from "@toynest/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, cardClass, touchLinkClass } from "@/components/ui";
import { getCustomerContext, requireSignedIn } from "@/lib/account";
import { paymentStatusText } from "@/lib/checkout";

export const metadata: Metadata = { title: "Order · ToyNest", robots: { index: false } };

export default function AccountOrderPage({ params }: PageProps<"/account/orders/[orderNumber]">) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-10">
      <Link href="/account" className={`text-sm font-semibold text-accent hover:underline ${touchLinkClass}`}>
        ← Your orders
      </Link>
      <Suspense fallback={<p className="mt-4 text-sm text-muted">Loading the order…</p>}>
        <Order params={params} />
      </Suspense>
    </main>
  );
}

async function Order({ params }: Pick<PageProps<"/account/orders/[orderNumber]">, "params">) {
  const { customer } = await requireSignedIn();
  const { orderNumber } = await params;
  const context = await getCustomerContext();
  // Someone else's order and a missing one look the same: 404 (layers 3 and 4).
  const order = context ? await context.account.getOrder(customer.id, orderNumber) : null;
  if (!order) notFound();
  const money = (minor: number) => formatMoney(minor, order.currency);
  const { details } = order;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Order {order.orderNumber}</h1>
        <Badge tone="neutral">{paymentStatusText[order.paymentStatus]}</Badge>
      </div>
      <section aria-labelledby="items-heading" className={`${cardClass} mt-6 p-5`}>
        <h2 id="items-heading" className="font-display text-xl font-semibold">
          Items
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {order.lines.map((line, index) => (
            <li key={index} className="flex justify-between gap-3">
              <span className="min-w-0">
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
      <section aria-labelledby="delivery-heading" className={`${cardClass} mt-4 p-5 text-sm`}>
        <h2 id="delivery-heading" className="font-display text-xl font-semibold">
          Delivery to
        </h2>
        <address className="mt-2 not-italic">
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
        </address>
      </section>
    </>
  );
}
