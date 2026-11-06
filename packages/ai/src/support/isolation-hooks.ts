import { z } from "zod";
import type { ToolHooks } from "../agent-loop";
import { ToolError } from "../tool";
import { OrderViewOutput, type SupportSession } from "./tools";

const CustomerIdInput = z.object({ customerId: z.string() }).loose();
const OrderIdInput = z.object({ orderId: z.string() }).loose();

// Customer-data isolation, layers 2 and 3. Layer 1 is in the tools (session id injected by code);
// layer 4 will be Supabase RLS. Each layer assumes the one before it might have a bug.
export function customerIsolationHooks(session: SupportSession): ToolHooks {
  return {
    // Layer 2 (PreToolUse): Claude-supplied ids must belong to the session's customer.
    beforeToolCall(call, completed) {
      const withCustomer = CustomerIdInput.safeParse(call.input);
      if (withCustomer.success && withCustomer.data.customerId !== session.customerId) {
        return { block: "customerId must be the signed-in customer's id returned by get_customer." };
      }

      if (call.name === "process_refund") {
        const target = OrderIdInput.safeParse(call.input);
        const lookedUp = completed.some((previous) => {
          if (previous.name !== "lookup_order" || previous.isError) return false;
          const view = OrderViewOutput.safeParse(previous.output);
          return (
            view.success && view.data.orderId === target.data?.orderId && view.data.customerId === session.customerId
          );
        });
        if (!lookedUp) return { block: "Call lookup_order for this order before refunding it." };
      }
      return undefined;
    },

    // Layer 3 (PostToolUse): if any result names a different customer, withhold it before Claude sees it.
    afterToolCall(call, output) {
      const owners = call.name === "get_customer" ? [idOf(output)] : collectCustomerIds(output);
      if (owners.some((owner) => owner !== undefined && owner !== session.customerId)) {
        throw new ToolError("Result withheld: it contained another customer's data.", {
          category: "permission",
          retryable: false,
        });
      }
      return output;
    },
  };
}

function idOf(value: unknown): string | undefined {
  const parsed = z.object({ id: z.string() }).loose().safeParse(value);
  return parsed.success ? parsed.data.id : undefined;
}

// Finds every customerId field, however deeply nested (e.g. in a list of orders).
function collectCustomerIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectCustomerIds);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === "customerId" && typeof child === "string" ? [child] : collectCustomerIds(child),
  );
}
