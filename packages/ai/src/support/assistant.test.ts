import { RepositoryUnavailableError, type Customer, type Order, type OrderRepository } from "@toynest/core";
import { describe, expect, it } from "vitest";
import { scriptedProvider } from "../testing/scripted-provider";
import type { ModelResponse, ToolResultBlock } from "../types";
import { createSupportAssistant, RECENT_TURNS, startSupportConversation, type SupportConversation } from "./assistant";

// Synthetic data only.
const sam: Customer = { id: "cus_1001", name: "Sam Patel", email: "sam@example.com" };
const priya: Customer = { id: "cus_1002", name: "Priya Shah", email: "priya@example.com" };

const order = (overrides: Partial<Order>): Order => ({
  id: "TN-1042",
  customerId: sam.id,
  status: "delivered",
  placedAt: "2026-10-29T09:12:00Z",
  deliveredAt: "2026-11-02T14:05:00Z",
  totalMinor: 239800,
  refundedMinor: 0,
  currency: "INR",
  items: [{ productSlug: "personalised-name-train", name: "Personalised Name Train", quantity: 1, unitPriceMinor: 239800 }],
  ...overrides,
});

const orders = [
  order({}),
  order({ id: "TN-1063", customerId: priya.id, totalMinor: 389700 }),
  order({ id: "TN-1029", deliveredAt: "2026-09-20T13:10:00Z" }), // outside the 30-day window on 6 Nov
  order({ id: "TN-1051", status: "dispatched", deliveredAt: null }),
  order({ id: "TN-1077", totalMinor: 250000 }), // above the ₹2,000 automatic limit
  // Below the automatic limit, so an over-refund reaches the tool's "left to refund" check, not the hook.
  order({ id: "TN-1048", totalMinor: 59900 }),
];

const scopedRepo = (rows: Order[]): OrderRepository => ({
  findForCustomer: async (customerId, orderId) =>
    rows.find((row) => row.id === orderId && row.customerId === customerId) ?? null,
  listForCustomer: async (customerId, limit) => rows.filter((row) => row.customerId === customerId).slice(0, limit),
});

function setup(script: ModelResponse[], orderRepo: OrderRepository = scopedRepo(orders)) {
  const { provider, requests } = scriptedProvider(script);
  const assistant = createSupportAssistant({
    provider,
    customers: { findById: async (id) => [sam, priya].find((customer) => customer.id === id) ?? null },
    orders: orderRepo,
    maxAutoRefundMinor: 200000,
    now: () => new Date("2026-11-06T10:00:00Z"),
    newId: () => "TEST1",
  });
  return { assistant, requests };
}

const call = (id: string, name: string, input: unknown): ModelResponse["content"][number] => ({
  type: "tool_use",
  id,
  name,
  input,
});
const turn = (...content: ModelResponse["content"]): ModelResponse => ({ stopReason: "tool_use", content });
const say = (text: string): ModelResponse => ({ stopReason: "end_turn", content: [{ type: "text", text }] });

// The tool results Claude received in request `index`.
const resultsIn = (requests: ReturnType<typeof scriptedProvider>["requests"], index: number) =>
  requests[index]?.messages.at(-1)?.content as ToolResultBlock[];

const refund = (overrides: object = {}) => ({
  customerId: sam.id,
  orderId: "TN-1042",
  amountMinor: 149900,
  reason: "Train arrived cracked",
  ...overrides,
});

describe("customer isolation", () => {
  it("blocks a customerId that is not the signed-in customer (layer 2)", async () => {
    const { assistant, requests } = setup([
      turn(call("t1", "get_customer", {})),
      turn(call("t2", "escalate_to_human", {
        customerId: priya.id,
        rootCause: "Trying another customer's account",
        recommendedAction: "None",
        customerRequestedHuman: false,
      })),
      say("Done."),
    ]);

    const reply = await assistant.reply(startSupportConversation(sam.id), "hi");

    expect(resultsIn(requests, 2)[0]).toMatchObject({ is_error: true, content: expect.stringContaining("signed-in customer") });
    expect(reply.conversation.caseFacts.escalations).toEqual([]);
  });

  it("blocks a refund on an order that was not looked up first (layer 2)", async () => {
    const { assistant, requests } = setup([
      turn(call("t1", "get_customer", {})),
      turn(call("t2", "process_refund", refund())),
      say("Done."),
    ]);

    const reply = await assistant.reply(startSupportConversation(sam.id), "refund TN-1042");

    expect(resultsIn(requests, 2)[0]).toMatchObject({ is_error: true, content: expect.stringContaining("lookup_order") });
    expect(reply.conversation.caseFacts.refunds).toEqual([]);
  });

  it("withholds a result that contains another customer's data (layer 3)", async () => {
    // A buggy adapter that ignores the customer scope.
    const leaky: OrderRepository = {
      findForCustomer: async (_customerId, orderId) => orders.find((row) => row.id === orderId) ?? null,
      listForCustomer: async () => orders,
    };
    const { assistant, requests } = setup([turn(call("t1", "lookup_order", { orderId: "TN-1063" })), say("Sorry.")], leaky);

    const reply = await assistant.reply(startSupportConversation(sam.id), "what about TN-1063?");

    const [result] = resultsIn(requests, 1);
    expect(result).toMatchObject({ is_error: true });
    expect(JSON.parse(result!.content)).toMatchObject({ errorCategory: "permission", isRetryable: false });
    expect(result!.content).not.toContain("6748");
    expect(reply.conversation.caseFacts.orders).toEqual({});
  });
});

describe("refunds", () => {
  const lookThenRefund = (orderId: string, amountMinor: number) => [
    turn(call("t1", "get_customer", {}), call("t2", "lookup_order", { orderId })),
    turn(call("t3", "process_refund", refund({ orderId, amountMinor }))),
    say("Done."),
  ];

  it("refunds a verified, looked-up order within policy and records it in case facts", async () => {
    const { assistant } = setup(lookThenRefund("TN-1042", 149900));

    const reply = await assistant.reply(startSupportConversation(sam.id), "train arrived cracked");

    expect(reply.conversation.caseFacts.refunds).toEqual([{ refundId: "RF-TEST1", orderId: "TN-1042", amountMinor: 149900 }]);
    expect(reply.conversation.caseFacts.orders["TN-1042"]?.refundedMinor).toBe(149900);
  });

  it.each([
    ["outside the refund window", "TN-1029", 1000, "business", "refund window"],
    ["not yet delivered", "TN-1051", 1000, "business", "only delivered orders"],
    ["more than is left to refund", "TN-1048", 60000, "validation", "left to refund"],
  ])("rejects a refund %s with a structured error", async (_case, orderId, amountMinor, category, message) => {
    const { assistant, requests } = setup(lookThenRefund(orderId, amountMinor));

    const reply = await assistant.reply(startSupportConversation(sam.id), "refund please");

    const [result] = resultsIn(requests, 2);
    expect(JSON.parse(result!.content)).toMatchObject({ errorCategory: category, isRetryable: false });
    expect(result!.content).toContain(message);
    expect(reply.conversation.caseFacts.refunds).toEqual([]);
  });

  it("sends refunds above the limit to a human (refundPolicyHooks, combined with isolation hooks)", async () => {
    const { assistant, requests } = setup(lookThenRefund("TN-1077", 250000));

    await assistant.reply(startSupportConversation(sam.id), "refund the lot");

    expect(resultsIn(requests, 2)[0]).toMatchObject({ is_error: true, content: expect.stringContaining("need a human") });
  });
});

describe("errors (task 5.3)", () => {
  it("distinguishes 'could not check' from 'not on your account'", async () => {
    const down: OrderRepository = {
      findForCustomer: async () => {
        throw new RepositoryUnavailableError("timeout");
      },
      listForCustomer: async () => [],
    };
    const outage = setup([turn(call("t1", "lookup_order", { orderId: "TN-1042" })), say("Try later.")], down);
    const missing = setup([turn(call("t1", "lookup_order", { orderId: "TN-9999" })), say("Not found.")]);

    await outage.assistant.reply(startSupportConversation(sam.id), "where is TN-1042?");
    await missing.assistant.reply(startSupportConversation(sam.id), "where is TN-9999?");

    expect(JSON.parse(resultsIn(outage.requests, 1)[0]!.content)).toMatchObject({ errorCategory: "transient", isRetryable: true });
    expect(JSON.parse(resultsIn(missing.requests, 1)[0]!.content)).toMatchObject({ errorCategory: "business", isRetryable: false });
  });
});

describe("multi-turn context (task 5.1)", () => {
  it("carries verification and lookups into the next turn, with exact amounts in case facts", async () => {
    const { assistant, requests } = setup([
      turn(call("t1", "get_customer", {}), call("t2", "lookup_order", { orderId: "TN-1042" })),
      say("I can refund ₹1,499 for the train. Shall I go ahead?"),
      // Next customer turn: the refund is the very first call, allowed by the earlier turn's calls.
      turn(call("t3", "process_refund", refund())),
      say("Done, ₹1,499 refunded."),
    ]);

    const first = await assistant.reply(startSupportConversation(sam.id), "My train arrived cracked (TN-1042)");
    const second = await assistant.reply(first.conversation, "Yes please");

    expect(second.conversation.caseFacts.refunds).toHaveLength(1);
    const secondTurnPrompt = requests[2]?.messages.at(-1)?.content;
    expect(secondTurnPrompt).toContain("<case_facts>");
    expect(secondTurnPrompt).toContain("total ₹2,398");
  });

  it(`sends only the last ${RECENT_TURNS} turns verbatim, while case facts keep the details`, async () => {
    let conversation: SupportConversation = startSupportConversation(sam.id);
    const script: ModelResponse[] = [
      turn(call("t1", "get_customer", {}), call("t2", "lookup_order", { orderId: "TN-1042" })),
      say("reply 1"),
      ...[2, 3, 4, 5].map((n) => say(`reply ${n}`)),
    ];
    const { assistant, requests } = setup(script);

    for (const n of [1, 2, 3, 4, 5]) {
      conversation = (await assistant.reply(conversation, `message ${n}`)).conversation;
    }

    const last = requests.at(-1)!;
    expect(last.messages).toHaveLength(RECENT_TURNS + 1);
    expect(JSON.stringify(last.messages)).not.toContain("message 1");
    expect(last.messages.at(-1)?.content).toContain("total ₹2,398");
  });
});
