import { randomUUID } from "node:crypto";
import { ConflictError, type CheckoutOrder, type CheckoutOrderRepository } from "@toynest/core";

// Sample-mode orders (ADR-019): kept in memory for the life of the server process, so the app can be
// tried end to end with no database. Same rules as the Supabase adapter: idempotent on the checkout
// token, one open payment attempt per order, conditional payment moves.
export function createInMemoryCheckoutRepository(): CheckoutOrderRepository {
  const orders = new Map<string, CheckoutOrder & { token: string }>();
  const attempts = new Map<string, { orderId: string; status: "started" | "pending" | "succeeded" | "failed"; reference: string | null }>();
  let nextNumber = 20001;

  return {
    async place(draft) {
      const existing = [...orders.values()].find((order) => order.token === draft.checkoutToken);
      if (existing) return { order: structuredClone(existing), created: false };
      if (draft.lines.length === 0) throw new Error("an order needs at least one line");
      const order = {
        id: randomUUID(),
        token: draft.checkoutToken,
        orderNumber: `TN-${nextNumber++}`,
        status: draft.status,
        paymentMethod: draft.paymentMethod,
        paymentStatus: draft.paymentStatus,
        placedAt: new Date().toISOString(),
        cartId: draft.cartId,
        details: draft.details,
        subtotalMinor: draft.subtotalMinor,
        deliveryMinor: draft.deliveryMinor,
        totalMinor: draft.totalMinor,
        currency: draft.currency,
        zoneName: draft.zoneName,
        lines: draft.lines.map(({ productId: _id, ...line }) => line),
      };
      orders.set(order.id, order);
      return { order: structuredClone(order), created: true };
    },
    async get(orderId) {
      const order = orders.get(orderId);
      return order ? structuredClone(order) : null;
    },
    async startPayment(orderId) {
      const open = [...attempts.values()].some((a) => a.orderId === orderId && (a.status === "started" || a.status === "pending"));
      if (open) throw new ConflictError("A payment is already in progress");
      const id = randomUUID();
      attempts.set(id, { orderId, status: "started", reference: null });
      return id;
    },
    async finishPayment(attemptId, { status, reference }) {
      const attempt = attempts.get(attemptId);
      if (attempt) attempts.set(attemptId, { ...attempt, status, reference });
    },
    async pendingAttempt(orderId) {
      for (const [attemptId, a] of attempts) {
        if (a.orderId === orderId && a.status === "pending" && a.reference) return { attemptId, reference: a.reference };
      }
      return null;
    },
    async setPayment(orderId, { status, paymentStatus, paymentMethod }, from) {
      const order = orders.get(orderId);
      if (!order || !from.includes(order.paymentStatus)) return false;
      order.status = status;
      order.paymentStatus = paymentStatus;
      if (paymentMethod) order.paymentMethod = paymentMethod;
      return true;
    },
  };
}
