import type { CustomerRepository, OrderRepository } from "@toynest/core";
import { combineHooks, runAgentLoop, type CompletedToolCall } from "../agent-loop";
import type { AIProvider, Message } from "../types";
import { applyToolCalls, emptyCaseFacts, renderCaseFacts, type CaseFacts } from "./case-facts";
import { customerIsolationHooks } from "./isolation-hooks";
import { supportSystemPrompt } from "./prompt";
import { refundPolicyHooks } from "./refund-policy";
import { createSupportTools } from "./tools";

// Only the last few turns are sent verbatim. Older turns are dropped, and their facts survive in case facts.
export const RECENT_TURNS = 6;

export interface SupportTurn {
  role: "customer" | "assistant";
  text: string;
}

// Everything the server keeps between turns. The client never holds or edits this.
export interface SupportConversation {
  customerId: string;
  caseFacts: CaseFacts;
  // Successful tool calls from earlier turns, so hooks can see that verification and lookups already happened.
  priorCalls: CompletedToolCall[];
  turns: SupportTurn[];
}

export interface ToolActivity {
  name: string;
  input: unknown;
  outcome: "ok" | "blocked" | "error";
  detail: string;
}

export type SupportReply =
  | { status: "answered"; conversation: SupportConversation; text: string; activity: ToolActivity[] }
  | { status: "failed"; conversation: SupportConversation; reason: string; activity: ToolActivity[] };

export interface SupportAssistantDeps {
  provider: AIProvider;
  customers: CustomerRepository;
  orders: OrderRepository;
  maxAutoRefundMinor: number;
  now?: () => Date;
  newId?: () => string;
  maxIterations?: number;
}

export function startSupportConversation(customerId: string): SupportConversation {
  return { customerId, caseFacts: emptyCaseFacts(), priorCalls: [], turns: [] };
}

export function createSupportAssistant(deps: SupportAssistantDeps) {
  const system = supportSystemPrompt({ maxAutoRefundMinor: deps.maxAutoRefundMinor });

  return {
    async reply(conversation: SupportConversation, message: string): Promise<SupportReply> {
      const session = { customerId: conversation.customerId };
      const tools = createSupportTools(session, {
        customers: deps.customers,
        orders: deps.orders,
        refundsSoFar: conversation.caseFacts.refunds,
        now: deps.now,
        newId: deps.newId,
      });

      const result = await runAgentLoop({
        provider: deps.provider,
        system,
        history: recentHistory(conversation.turns),
        // Case facts go at the top of the newest message, rebuilt from code every turn.
        prompt: `${renderCaseFacts(conversation.caseFacts)}\n\nCustomer message:\n${message}`,
        priorCalls: conversation.priorCalls,
        tools,
        hooks: combineHooks(
          customerIsolationHooks(session),
          refundPolicyHooks({ maxAutoRefundMinor: deps.maxAutoRefundMinor }),
        ),
        maxTokens: 8000,
        maxIterations: deps.maxIterations ?? 8,
      });

      const activity = result.toolCalls.map(toActivity);
      const updated: SupportConversation = {
        ...conversation,
        caseFacts: applyToolCalls(conversation.caseFacts, result.toolCalls),
        priorCalls: [...conversation.priorCalls, ...result.toolCalls.filter((call) => !call.isError)],
      };

      if (result.status !== "completed") {
        // Tool effects (e.g. a refund) still count, but the unanswered turn is not added to the history.
        return { status: "failed", conversation: updated, reason: `The assistant stopped early: ${result.reason}.`, activity };
      }
      const text = result.text.trim() || "Sorry, I couldn't put together a reply. Please try again.";
      return {
        status: "answered",
        conversation: { ...updated, turns: [...conversation.turns, { role: "customer", text: message }, { role: "assistant", text }] },
        text,
        activity,
      };
    },
  };
}

function recentHistory(turns: readonly SupportTurn[]): Message[] {
  const recent = turns.slice(-RECENT_TURNS);
  // The Messages API needs the conversation to start with a user message.
  const start = recent.findIndex((turn) => turn.role === "customer");
  return recent.slice(start === -1 ? recent.length : start).map((turn): Message =>
    turn.role === "customer"
      ? { role: "user", content: turn.text }
      : { role: "assistant", content: [{ type: "text", text: turn.text }] },
  );
}

function toActivity(call: CompletedToolCall): ToolActivity {
  if (!call.isError) return { name: call.name, input: call.input, outcome: "ok", detail: JSON.stringify(call.output) };
  const detail = typeof call.output === "string" ? call.output : JSON.stringify(call.output);
  return {
    name: call.name,
    input: call.input,
    outcome: detail.startsWith("Blocked by policy:") ? "blocked" : "error",
    detail,
  };
}
