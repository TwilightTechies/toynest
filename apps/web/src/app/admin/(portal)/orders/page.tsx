import { formatMoney, type AdminOrderSummary } from "@toynest/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { Badge, buttonClass, cardClass } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Orders · ToyNest admin" };

const PAGE_SIZE = 25;
const PageSchema = z.coerce.number().int().min(1).max(1000).catch(1);

const paymentText = (order: AdminOrderSummary) =>
  order.paymentMethod === "cod"
    ? "Cash on delivery"
    : order.paymentStatus === "paid"
      ? "Paid online"
      : order.paymentStatus === "failed"
        ? "Payment failed"
        : order.paymentStatus === "pending"
          ? "Awaiting payment"
          : "Account order";

const statusText: Record<AdminOrderSummary["status"], string> = {
  awaiting_payment: "Awaiting payment",
  placed: "Placed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// Read-only for now (ADR-019): status updates and dispatch come in a later phase.
export default function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Orders</h1>
      <p className="mt-1 text-sm text-muted">Newest first. Read-only: updating status and dispatch come later.</p>
      <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading orders…</p>}>
        <OrderList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function OrderList({ searchParams }: Pick<PageProps<"/admin/orders">, "searchParams">) {
  const { context } = await requireAdmin();
  const page = PageSchema.parse((await searchParams).page);
  const { items, total } = await context.orders.list({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <p className="mt-4 text-sm text-muted">
        {total} {total === 1 ? "order" : "orders"}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((order) => (
          <li key={order.id} className={`${cardClass} flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3`}>
            <span className="w-full font-semibold sm:w-28">{order.orderNumber}</span>
            <span className="min-w-0 flex-1 text-sm">
              {order.customerName}
              <span className="block text-muted">
                {new Date(order.placedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {order.itemCount}{" "}
                {order.itemCount === 1 ? "item" : "items"}
              </span>
            </span>
            <span className="text-sm tabular-nums">{formatMoney(order.totalMinor, order.currency)}</span>
            <span className="text-sm text-muted">{paymentText(order)}</span>
            <Badge tone={order.status === "placed" || order.status === "delivered" ? "sage" : "neutral"}>{statusText[order.status]}</Badge>
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <Link href={`/admin/orders?page=${page - 1}`} className={buttonClass("secondary", "sm")} rel="prev">
              ← Newer
            </Link>
          )}
          <span className="text-muted">
            Page {page} of {pageCount}
          </span>
          {page < pageCount && (
            <Link href={`/admin/orders?page=${page + 1}`} className={buttonClass("secondary", "sm")} rel="next">
              Older →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
