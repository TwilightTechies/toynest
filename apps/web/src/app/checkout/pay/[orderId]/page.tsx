import { COD_MAX_MINOR, formatMoney } from "@toynest/core";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonClass, cardClass } from "@/components/ui";
import { getCheckoutOrder, hasPaymentInProgress } from "@/lib/checkout";
import { checkPaymentStatus, payOnDelivery, payOrder } from "../../actions";

export const metadata: Metadata = { title: "Payment · ToyNest", robots: { index: false } };

export default function PayPage({ params }: PageProps<"/checkout/pay/[orderId]">) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Payment</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading your order…</p>}>
        <Pay params={params} />
      </Suspense>
    </main>
  );
}

async function Pay({ params }: Pick<PageProps<"/checkout/pay/[orderId]">, "params">) {
  const { orderId } = await params;
  const order = await getCheckoutOrder(orderId);
  if (!order) notFound();
  // Already settled (paid, or switched to cash on delivery): nothing to pay here.
  if (order.paymentStatus === "paid" || order.paymentStatus === "cod_due") redirect(`/checkout/confirmation/${order.id}`);

  const waiting = await hasPaymentInProgress(order.id);
  const itemCount = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = formatMoney(order.totalMinor, order.currency);
  const orderField = <input type="hidden" name="orderId" value={order.id} />;

  return (
    <div className="mt-6 flex flex-col gap-5">
      <section className={`${cardClass} p-5`}>
        <p className="text-sm text-muted">Order {order.orderNumber}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{total}</p>
        <p className="mt-1 text-sm text-muted">
          {itemCount} {itemCount === 1 ? "item" : "items"} · delivery to {order.details.city} {order.details.pincode} ·{" "}
          {order.deliveryMinor === 0 ? "free delivery" : `${formatMoney(order.deliveryMinor)} delivery`}
        </p>
      </section>

      {waiting ? (
        <section role="status" className="rounded-xl bg-sage-soft p-5 text-sage-strong">
          <h2 className="font-semibold">Waiting for your bank</h2>
          <p className="mt-1 text-sm">
            Your bank hasn&apos;t confirmed the payment yet. This usually takes a few seconds; please don&apos;t pay again.
          </p>
          <form action={checkPaymentStatus} className="mt-3">
            {orderField}
            <button className={`${buttonClass("secondary", "sm")} min-h-11`}>Check status</button>
          </form>
        </section>
      ) : (
        <>
          {order.paymentStatus === "failed" && (
            <section role="alert" className="rounded-xl border border-accent bg-surface p-5">
              <h2 className="font-semibold">The payment didn&apos;t go through</h2>
              <p className="mt-1 text-sm">No money was taken. You can try again, or pay the courier when your order arrives.</p>
              {order.totalMinor <= COD_MAX_MINOR && (
                <form action={payOnDelivery} className="mt-3">
                  {orderField}
                  <button className={`${buttonClass("secondary", "sm")} min-h-11`}>Pay on delivery instead</button>
                </form>
              )}
            </section>
          )}

          {/* The mock gateway (ADR-019). A real one (e.g. Razorpay) replaces this panel with its own checkout. */}
          <section aria-labelledby="test-pay" className="rounded-2xl border-2 border-dashed border-border-strong p-5">
            <h2 id="test-pay" className="font-display text-lg font-semibold">
              Test payment
            </h2>
            <p className="mt-1 text-sm text-muted">
              ToyNest is a learning project: no real money moves. Choose what the &ldquo;bank&rdquo; should do.
            </p>
            <form action={payOrder} className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {orderField}
              <button name="outcome" value="success" className={`${buttonClass()} min-h-11`}>
                {order.paymentStatus === "failed" ? `Try again: pay ${total}` : `Pay ${total}`}
              </button>
              <button name="outcome" value="failure" className={`${buttonClass("secondary")} min-h-11`}>
                Simulate a decline
              </button>
              <button name="outcome" value="pending" className={`${buttonClass("secondary")} min-h-11`}>
                Simulate &ldquo;bank pending&rdquo;
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
