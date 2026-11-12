import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runAgentLoop, type ToolHooks } from "../agent-loop";
import { scriptedProvider } from "../testing/scripted-provider";
import { defineTool } from "../tool";
import type { ModelResponse } from "../types";
import { refundPolicyHooks } from "./refund-policy";

// Mock support tools (synthetic data; no money moves).
function supportTools() {
  const refunds: unknown[] = [];
  const escalations: unknown[] = [];
  const tools = [
    defineTool({
      name: "get_customer",
      description: "Verify a customer by email.",
      input: z.object({ email: z.string() }),
      execute: async ({ email }) => ({ id: "cus_1042", email, verified: true }),
    }),
    defineTool({
      name: "lookup_order",
      description: "Look up an order by id.",
      input: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => ({ orderId, status: "delivered", placed_at: 1730419200 }),
    }),
    defineTool({
      name: "process_refund",
      description: "Refund an order (mock).",
      input: z.object({ customerId: z.string(), orderId: z.string(), amountMinor: z.number().int() }),
      execute: async (request) => {
        refunds.push(request);
        return { refunded: true };
      },
    }),
    defineTool({
      name: "escalate_to_human",
      description: "Hand the case to a human agent with a structured summary.",
      input: z.object({
        customerId: z.string(),
        orderId: z.string(),
        rootCause: z.string(),
        refundAmountMinor: z.number().int(),
        recommendedAction: z.string(),
      }),
      execute: async (handoff) => {
        escalations.push(handoff);
        return { ticket: "HUM-1" };
      },
    }),
  ];
  return { tools, refunds, escalations };
}

const call = (id: string, name: string, input: unknown): ModelResponse["content"][number] => ({
  type: "tool_use",
  id,
  name,
  input,
});
const turn = (...content: ModelResponse["content"]): ModelResponse => ({ stopReason: "tool_use", content });
const done: ModelResponse = { stopReason: "end_turn", content: [{ type: "text", text: "Done." }] };
const policy = refundPolicyHooks({ maxAutoRefundMinor: 200000 });
const base = { system: "You are ToyNest support.", prompt: "My puzzle arrived broken, refund please." };

const resultOf = (requests: ReturnType<typeof scriptedProvider>["requests"], requestIndex: number) =>
  requests[requestIndex]?.messages.at(-1)?.content;

describe("refund policy hooks (PreToolUse)", () => {
  it("blocks a refund until get_customer has verified the customer", async () => {
    const { tools, refunds } = supportTools();
    const refund = { customerId: "cus_1042", orderId: "ORD-2291", amountMinor: 125000 };
    const { provider, requests } = scriptedProvider([
      turn(call("t1", "process_refund", refund)),
      turn(call("t2", "get_customer", { email: "sam@example.com" })),
      turn(call("t3", "process_refund", refund)),
      done,
    ]);

    await runAgentLoop({ ...base, provider, tools, hooks: policy });

    expect(resultOf(requests, 1)).toEqual([
      expect.objectContaining({ is_error: true, content: expect.stringContaining("Call get_customer first") }),
    ]);
    expect(refunds).toEqual([refund]); // only the second, verified attempt ran
  });

  it("does not let a prerequisite in the same turn satisfy the gate", async () => {
    const { tools, refunds } = supportTools();
    const { provider } = scriptedProvider([
      turn(
        call("t1", "get_customer", { email: "sam@example.com" }),
        call("t2", "process_refund", { customerId: "cus_1042", orderId: "ORD-2291", amountMinor: 125000 }),
      ),
      done,
    ]);

    await runAgentLoop({ ...base, provider, tools, hooks: policy });

    expect(refunds).toEqual([]);
  });

  it("redirects refunds above the threshold to a human with a structured handoff", async () => {
    const { tools, refunds, escalations } = supportTools();
    const handoff = {
      customerId: "cus_1042",
      orderId: "ORD-2291",
      rootCause: "Puzzle arrived with a broken piece; customer sent a photo",
      refundAmountMinor: 324900,
      recommendedAction: "Approve full refund",
    };
    const { provider, requests } = scriptedProvider([
      turn(call("t1", "get_customer", { email: "sam@example.com" })),
      turn(call("t2", "process_refund", { customerId: "cus_1042", orderId: "ORD-2291", amountMinor: 324900 })),
      turn(call("t3", "escalate_to_human", handoff)),
      done,
    ]);

    await runAgentLoop({ ...base, provider, tools, hooks: policy });

    expect(resultOf(requests, 2)).toEqual([
      expect.objectContaining({ is_error: true, content: expect.stringContaining("need a human") }),
    ]);
    expect(refunds).toEqual([]);
    expect(escalations).toEqual([handoff]);
  });
});

describe("PostToolUse normalisation", () => {
  it("rewrites a Unix timestamp to ISO 8601 before Claude sees it", async () => {
    const { tools } = supportTools();
    const normaliseDates: ToolHooks = {
      afterToolCall: (_call, output) => {
        const parsed = z.object({ placed_at: z.number() }).loose().safeParse(output);
        return parsed.success ? { ...parsed.data, placed_at: new Date(parsed.data.placed_at * 1000).toISOString() } : output;
      },
    };
    const { provider, requests } = scriptedProvider([turn(call("t1", "lookup_order", { orderId: "ORD-2291" })), done]);

    await runAgentLoop({ ...base, provider, tools, hooks: normaliseDates });

    expect(resultOf(requests, 1)).toEqual([
      expect.objectContaining({ content: expect.stringContaining('"placed_at":"2024-11-01T00:00:00.000Z"') }),
    ]);
  });
});
