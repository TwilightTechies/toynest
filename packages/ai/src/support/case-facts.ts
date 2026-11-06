import type { CompletedToolCall } from "../agent-loop";
import { EscalationOutput, OrderViewOutput, RefundOutput, VerifiedCustomerOutput, type OrderView } from "./tools";

// The "bed chart" for one support case: exact transactional facts, built by code from validated
// tool results. It is sent in full on every turn and never summarised, so amounts and dates cannot drift.
export interface CaseFacts {
  customer: { id: string; name: string; email: string } | null;
  orders: Record<string, OrderView>;
  refunds: { refundId: string; orderId: string; amountMinor: number }[];
  escalations: { ticketId: string; orderId: string | null; rootCause: string }[];
}

export const emptyCaseFacts = (): CaseFacts => ({ customer: null, orders: {}, refunds: [], escalations: [] });

// Only successful calls whose output passes the schema become facts; anything else is ignored.
export function applyToolCalls(facts: CaseFacts, calls: readonly CompletedToolCall[]): CaseFacts {
  const next: CaseFacts = {
    customer: facts.customer,
    orders: { ...facts.orders },
    refunds: [...facts.refunds],
    escalations: [...facts.escalations],
  };
  for (const call of calls) {
    if (call.isError) continue;
    switch (call.name) {
      case "get_customer": {
        const parsed = VerifiedCustomerOutput.safeParse(call.output);
        if (parsed.success) next.customer = { id: parsed.data.id, name: parsed.data.name, email: parsed.data.email };
        break;
      }
      case "lookup_order": {
        const parsed = OrderViewOutput.safeParse(call.output);
        if (parsed.success) next.orders[parsed.data.orderId] = parsed.data;
        break;
      }
      case "process_refund": {
        const parsed = RefundOutput.safeParse(call.output);
        if (parsed.success) {
          const { refundId, orderId, amountMinor } = parsed.data;
          next.refunds.push({ refundId, orderId, amountMinor });
          const order = next.orders[orderId];
          if (order) next.orders[orderId] = { ...order, refundedMinor: order.refundedMinor + amountMinor };
        }
        break;
      }
      case "escalate_to_human": {
        const parsed = EscalationOutput.safeParse(call.output);
        if (parsed.success) next.escalations.push(parsed.data);
        break;
      }
    }
  }
  return next;
}

export function formatMoney(minor: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100);
}

export function renderCaseFacts(facts: CaseFacts): string {
  const lines: string[] = [];
  lines.push(
    facts.customer
      ? `customer: ${facts.customer.name} (${facts.customer.id}, verified)`
      : "customer: not yet verified (call get_customer)",
  );
  for (const order of Object.values(facts.orders)) {
    const items = order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ");
    lines.push(
      `order ${order.orderId} · ${order.status}` +
        (order.deliveredAt ? ` ${order.deliveredAt}` : "") +
        ` · total ${formatMoney(order.totalMinor, order.currency)}` +
        ` · already refunded ${formatMoney(order.refundedMinor, order.currency)}` +
        (order.refundEligibleUntil ? ` · refund window until ${order.refundEligibleUntil}` : "") +
        ` · items: ${items}`,
    );
  }
  for (const refund of facts.refunds) {
    lines.push(`refund done: ${refund.refundId} · ${refund.orderId} · ${formatMoney(refund.amountMinor)}`);
  }
  for (const escalation of facts.escalations) {
    lines.push(`escalated: ${escalation.ticketId}${escalation.orderId ? ` · ${escalation.orderId}` : ""}`);
  }
  return [
    "<case_facts>",
    "Recorded by ToyNest's systems from tool results in this conversation. These values are exact; trust them over",
    "your memory of earlier turns.",
    ...lines,
    "</case_facts>",
  ].join("\n");
}
