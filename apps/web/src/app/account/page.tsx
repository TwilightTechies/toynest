import { formatIndianMobile, formatMoney } from "@toynest/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, buttonClass, cardClass, touchLinkClass } from "@/components/ui";
import { getCustomerContext, requireSignedIn } from "@/lib/account";
import { paymentStatusText } from "@/lib/checkout";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Your account · ToyNest", robots: { index: false } };

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <Suspense fallback={<p className="text-sm text-muted">Loading your account…</p>}>
        <Account searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Account({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  // Layer 3: the page checks the session itself. Layer 4: the orders below are read with the
  // shopper's own session, so RLS only returns their rows even if this filter were wrong.
  const { customer } = await requireSignedIn();
  const context = await getCustomerContext();
  const orders = context ? await context.account.listOrders(customer.id, 20) : [];
  const { password } = await searchParams;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Hello, {customer.name.split(" ")[0]}</h1>
          <p className="mt-1 break-words text-sm text-muted">
            {[customer.email, customer.phone && formatIndianMobile(customer.phone)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <form action={signOut}>
          <button className={buttonClass("secondary", "sm")}>Sign out</button>
        </form>
      </div>
      {password === "changed" && (
        <p role="status" className="mt-4 rounded-xl bg-sage-soft px-4 py-3 text-sm text-sage-strong">
          Your password has been changed.
        </p>
      )}

      <h2 className="mt-8 font-display text-2xl font-semibold">Your orders</h2>
      {orders.length === 0 ? (
        <div className={`${cardClass} mt-4 p-6 text-sm`}>
          <p>No orders yet. Orders you place while signed in show up here.</p>
          <Link href="/products" className={`${buttonClass()} mt-4`}>
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/account/orders/${order.orderNumber}`}
                className={`${cardClass} flex flex-wrap items-center justify-between gap-3 p-4 hover:border-accent`}
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{order.orderNumber}</span>
                  <span className="block text-sm text-muted">
                    {dateFormat.format(new Date(order.placedAt))} · {order.lines.reduce((sum, line) => sum + line.quantity, 0)} items
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <Badge tone="neutral">{paymentStatusText[order.paymentStatus]}</Badge>
                  <span className="font-semibold tabular-nums">{formatMoney(order.totalMinor, order.currency)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-muted">
        Orders placed as a guest before you had an account aren&apos;t listed here yet. Use the link in their confirmation.{" "}
        <Link href="/support" className={`font-semibold text-accent hover:underline ${touchLinkClass}`}>
          Need help?
        </Link>
      </p>
    </>
  );
}
