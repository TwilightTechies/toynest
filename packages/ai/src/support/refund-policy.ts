import { formatMoney } from "@toynest/core";
import { z } from "zod";
import type { ToolHooks } from "../agent-loop";

const RefundRequestSchema = z.object({ customerId: z.string(), amountMinor: z.number().int() });
const VerifiedCustomerSchema = z.object({ id: z.string(), verified: z.literal(true) });

// Support rules that must never be skipped. The system prompt explains them; these hooks guarantee them.
export function refundPolicyHooks({ maxAutoRefundMinor }: { maxAutoRefundMinor: number }): ToolHooks {
  return {
    beforeToolCall(call, completed) {
      if (call.name !== "process_refund") return undefined;
      const request = RefundRequestSchema.safeParse(call.input);
      if (!request.success) return undefined; // the tool's own input validation reports this

      // Prerequisite gate: the same customer must have been verified by get_customer in an earlier turn.
      const verified = completed.some((previous) => {
        if (previous.name !== "get_customer" || previous.isError) return false;
        const customer = VerifiedCustomerSchema.safeParse(previous.output);
        return customer.success && customer.data.id === request.data.customerId;
      });
      if (!verified) {
        return { block: "Call get_customer first and use the verified customer id it returns." };
      }

      // Threshold rule: large refunds are redirected to a human with a structured handoff.
      if (request.data.amountMinor > maxAutoRefundMinor) {
        return {
          block:
            `Refunds above ${formatMoney(maxAutoRefundMinor)} need a human. Call escalate_to_human with customerId, orderId, ` +
            "rootCause, refundAmountMinor and recommendedAction instead.",
        };
      }
      return undefined;
    },
  };
}
