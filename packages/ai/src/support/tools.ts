import {
  ORDER_NUMBER_PATTERN,
  RepositoryUnavailableError,
  type CustomerRepository,
  type Order,
  type OrderRepository,
} from "@toynest/core";
import { z } from "zod";
import { defineTool, ToolError, type Tool } from "../tool";

export const REFUND_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SupportSession {
  // Comes from the signed-in session, never from Claude (isolation layer 1).
  customerId: string;
}

export interface SupportDeps {
  customers: CustomerRepository;
  orders: OrderRepository;
  // Refunds already made in this conversation, so a second refund cannot exceed what is left.
  refundsSoFar: readonly { orderId: string; amountMinor: number }[];
  now?: () => Date;
  newId?: () => string;
}

// Output shapes are exported so case facts and isolation hooks can validate them.
export const VerifiedCustomerOutput = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  verified: z.literal(true),
});

export const OrderViewOutput = z.object({
  customerId: z.string(),
  orderId: z.string(),
  status: z.string(),
  placedAt: z.string(),
  deliveredAt: z.string().nullable(),
  totalMinor: z.number().int(),
  refundedMinor: z.number().int(),
  currency: z.string(),
  items: z.array(z.object({ name: z.string(), quantity: z.number().int() })),
  refundEligibleUntil: z.string().nullable(),
});
export type OrderView = z.infer<typeof OrderViewOutput>;

export const OrderSummaryOutput = z.object({
  customerId: z.string(),
  orderId: z.string(),
  placedAt: z.string(),
  status: z.string(),
  totalMinor: z.number().int(),
  itemNames: z.array(z.string()),
});

export const RefundOutput = z.object({
  refundId: z.string(),
  orderId: z.string(),
  amountMinor: z.number().int(),
  status: z.literal("mock_refunded"),
});

export const EscalationOutput = z.object({ ticketId: z.string(), orderId: z.string().nullable(), rootCause: z.string() });

const OrderIdSchema = z.string().regex(ORDER_NUMBER_PATTERN, "Order ids look like TN-1042");

export function createSupportTools(session: SupportSession, deps: SupportDeps): Tool[] {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID().slice(0, 8).toUpperCase());

  // Scoped lookup (layer 1): the repository only ever sees the session's customer id.
  async function findOrder(orderId: string): Promise<Order> {
    let order: Order | null;
    try {
      order = await deps.orders.findForCustomer(session.customerId, orderId);
    } catch (error) {
      if (error instanceof RepositoryUnavailableError) {
        throw new ToolError(`Could not check order ${orderId}: the order service is unavailable.`, {
          category: "transient",
          retryable: true,
        });
      }
      throw error;
    }
    if (!order) {
      // Same answer whether the order is missing or someone else's: never confirm other customers' orders.
      throw new ToolError(`No order ${orderId} on this customer's account. Ask the customer to check the number.`, {
        category: "business",
        retryable: false,
      });
    }
    return order;
  }

  // The support view: a handful of fields instead of the full order row ("trim at the door").
  function toView(order: Order): OrderView {
    const until = order.deliveredAt ? new Date(Date.parse(order.deliveredAt) + REFUND_WINDOW_DAYS * DAY_MS) : null;
    return {
      customerId: order.customerId,
      orderId: order.id,
      status: order.status,
      placedAt: order.placedAt.slice(0, 10),
      deliveredAt: order.deliveredAt?.slice(0, 10) ?? null,
      totalMinor: order.totalMinor,
      refundedMinor: order.refundedMinor + refundedInConversation(order.id),
      currency: order.currency,
      items: order.items.map(({ name, quantity }) => ({ name, quantity })),
      refundEligibleUntil: until ? until.toISOString().slice(0, 10) : null,
    };
  }

  function refundedInConversation(orderId: string) {
    return deps.refundsSoFar.filter((refund) => refund.orderId === orderId).reduce((sum, r) => sum + r.amountMinor, 0);
  }

  return [
    defineTool({
      name: "get_customer",
      description:
        "Get the signed-in customer's verified profile (id, name, email). Call it once at the start of a case. " +
        "Takes no input: the customer is identified by their session, so you cannot look up anyone else.",
      input: z.object({}),
      execute: async () => {
        const customer = await deps.customers.findById(session.customerId);
        if (!customer) throw new ToolError("Signed-in customer not found.", { category: "permission", retryable: false });
        return { id: customer.id, name: customer.name, email: customer.email, verified: true as const };
      },
    }),

    defineTool({
      name: "list_orders",
      description:
        "List the signed-in customer's most recent orders (newest first) with order id, date, status, total and item names. " +
        "Use it when the customer describes an order without giving its id. If more than one order matches their " +
        "description, ask which one they mean; never pick one yourself. An empty list means they have no orders.",
      input: z.object({ limit: z.number().int().min(1).max(10).default(5) }),
      execute: async ({ limit }) =>
        (await deps.orders.listForCustomer(session.customerId, limit)).map((order) => ({
          customerId: order.customerId,
          orderId: order.id,
          placedAt: order.placedAt.slice(0, 10),
          status: order.status,
          totalMinor: order.totalMinor,
          itemNames: order.items.map((item) => item.name),
        })),
    }),

    defineTool({
      name: "lookup_order",
      description:
        "Get one of the signed-in customer's orders by id (e.g. TN-1042): status, delivery date, total, amount already " +
        "refunded, items and refundEligibleUntil. Amounts are in minor units (paise; ₹1 = 100 paise). Call this before any refund. " +
        "Errors include errorCategory and isRetryable: 'transient' means try once more or tell the customer to try later; " +
        "'business' means the order is not on their account.",
      input: z.object({ orderId: OrderIdSchema }),
      execute: async ({ orderId }) => toView(await findOrder(orderId)),
    }),

    defineTool({
      name: "process_refund",
      description:
        "Refund part or all of a delivered order (mock: no money moves). Requires get_customer and lookup_order for this " +
        "order in an earlier turn. amountMinor is in paise and may not exceed the total minus what is already refunded. " +
        "Refunds above the automatic limit are blocked; use escalate_to_human for those.",
      input: z.object({
        customerId: z.string(),
        orderId: OrderIdSchema,
        amountMinor: z.number().int().positive(),
        reason: z.string().min(3).max(300),
      }),
      execute: async ({ orderId, amountMinor }) => {
        const view = toView(await findOrder(orderId));
        if (view.status !== "delivered") {
          throw new ToolError(`Order ${orderId} is ${view.status}; only delivered orders can be refunded.`, {
            category: "business",
            retryable: false,
          });
        }
        if (view.refundEligibleUntil && now().toISOString().slice(0, 10) > view.refundEligibleUntil) {
          throw new ToolError(
            `Order ${orderId} is outside the ${REFUND_WINDOW_DAYS}-day refund window (ended ${view.refundEligibleUntil}). ` +
              "Policy does not cover exceptions: escalate if the customer wants one.",
            { category: "business", retryable: false },
          );
        }
        const remaining = view.totalMinor - view.refundedMinor;
        if (amountMinor > remaining) {
          throw new ToolError(`Only ${remaining} paise of order ${orderId} is left to refund.`, {
            category: "validation",
            retryable: false,
          });
        }
        return { refundId: `RF-${newId()}`, orderId, amountMinor, status: "mock_refunded" as const };
      },
    }),

    defineTool({
      name: "escalate_to_human",
      description:
        "Hand the case to a human agent. The human does not see this conversation, so include everything they need: " +
        "rootCause (what happened, with exact amounts and dates), recommendedAction, and orderId/refundAmountMinor when " +
        "relevant. Set customerRequestedHuman when the customer asked for a person.",
      input: z.object({
        customerId: z.string(),
        orderId: OrderIdSchema.optional(),
        rootCause: z.string().min(10).max(1000),
        refundAmountMinor: z.number().int().positive().optional(),
        recommendedAction: z.string().min(5).max(500),
        customerRequestedHuman: z.boolean(),
      }),
      execute: async ({ orderId, rootCause }) => ({ ticketId: `HUM-${newId()}`, orderId: orderId ?? null, rootCause }),
    }),
  ];
}
