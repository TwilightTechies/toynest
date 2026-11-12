import "server-only";
import { createAnthropicProvider } from "@toynest/adapters/anthropic";
import {
  createSupportAssistant,
  renderCaseFacts,
  type SupportConversation,
  type SupportTurn,
  type ToolActivity,
} from "@toynest/ai";
import { cookies } from "next/headers";
import { getRepositories } from "./data";
import { loadRootEnv } from "./env";

export const MAX_AUTO_REFUND_MINOR = 200000; // ₹2,000

// Cookie names for the demo. The customer cookie is a MOCK session standing in for Supabase Auth.
export const CUSTOMER_COOKIE = "toynest_demo_customer";
export const CONVERSATION_COOKIE = "toynest_support_conversation";

export interface StoredConversation {
  conversation: SupportConversation;
  lastActivity: ToolActivity[];
}

// Dev-only, in-process store: lost on restart. Kept on globalThis so hot reload does not wipe it.
// Conversation state lives on the server so the client cannot edit case facts or prior tool calls.
const globalStore = globalThis as typeof globalThis & { __toynestSupport?: Map<string, StoredConversation> };
export const conversations = (globalStore.__toynestSupport ??= new Map());

// What the browser receives: the rendered case-facts block (exactly what Claude sees) and tool activity.
export interface ChatState {
  turns: SupportTurn[];
  caseFacts: string;
  activity: ToolActivity[];
  error: string | null;
}

export function toChatState(stored: StoredConversation, error: string | null = null): ChatState {
  return {
    turns: stored.conversation.turns,
    caseFacts: renderCaseFacts(stored.conversation.caseFacts),
    activity: stored.lastActivity,
    error,
  };
}

// Returns the conversation only if it belongs to the customer in the session cookie.
export async function currentConversation(): Promise<{ id: string; stored: StoredConversation } | null> {
  const jar = await cookies();
  const customerId = jar.get(CUSTOMER_COOKIE)?.value;
  const id = jar.get(CONVERSATION_COOKIE)?.value;
  if (!customerId || !id) return null;
  const stored = conversations.get(id);
  return stored && stored.conversation.customerId === customerId ? { id, stored } : null;
}

// Supabase when configured, otherwise the sample JSON (see lib/data.ts).
export async function loadSupportData() {
  const { customers, orders, demoCustomers } = await getRepositories();
  return { customers, orders, sampleCustomers: await demoCustomers() };
}

// Returns null when no API key is configured, so the page can explain instead of crashing.
export async function createSupportService() {
  loadRootEnv();
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { customers, orders } = await loadSupportData();
  return createSupportAssistant({
    provider: createAnthropicProvider({ model: process.env.TOYNEST_MODEL ?? "claude-opus-5-5" }),
    customers,
    orders,
    maxAutoRefundMinor: MAX_AUTO_REFUND_MINOR,
  });
}
