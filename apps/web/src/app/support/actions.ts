"use server";

import { randomUUID } from "node:crypto";
import { startSupportConversation } from "@toynest/ai";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  CONVERSATION_COOKIE,
  conversations,
  createSupportService,
  currentConversation,
  CUSTOMER_COOKIE,
  loadSupportData,
  toChatState,
  type ChatState,
} from "@/lib/support";

const cookieOptions = { httpOnly: true, sameSite: "lax", path: "/support" } as const;

// Mock sign-in: picks one of the synthetic customers. Supabase Auth replaces this later.
export async function signIn(formData: FormData) {
  const { sampleCustomers } = await loadSupportData();
  const known = new Set(sampleCustomers.map((customer) => customer.id));
  const customerId = z.string().refine((id) => known.has(id)).safeParse(formData.get("customerId"));
  if (!customerId.success) return;

  const conversationId = randomUUID();
  conversations.set(conversationId, { conversation: startSupportConversation(customerId.data), lastActivity: [] });
  const jar = await cookies();
  jar.set(CUSTOMER_COOKIE, customerId.data, cookieOptions);
  jar.set(CONVERSATION_COOKIE, conversationId, cookieOptions);
  revalidatePath("/support");
}

export async function signOut() {
  const jar = await cookies();
  const conversationId = jar.get(CONVERSATION_COOKIE)?.value;
  if (conversationId) conversations.delete(conversationId);
  jar.delete({ name: CUSTOMER_COOKIE, path: "/support" });
  jar.delete({ name: CONVERSATION_COOKIE, path: "/support" });
  revalidatePath("/support");
}

export async function sendMessage(previous: ChatState, formData: FormData): Promise<ChatState> {
  // Form input is an external boundary.
  const message = z.string().trim().min(1).max(1000).safeParse(formData.get("message"));
  if (!message.success) return { ...previous, error: "Type a message (up to 1000 characters)." };

  const current = await currentConversation();
  if (!current) return { ...previous, error: "Your session has expired. Sign out and sign in again." };

  const service = await createSupportService();
  if (!service) {
    return { ...previous, error: "ANTHROPIC_API_KEY is not set. Add it to .env.local at the repo root and try again." };
  }

  try {
    const reply = await service.reply(current.stored.conversation, message.data);
    const next = { conversation: reply.conversation, lastActivity: reply.activity };
    conversations.set(current.id, next);
    return toChatState(next, reply.status === "failed" ? reply.reason : null);
  } catch (error) {
    console.error("Support reply failed", error);
    return { ...previous, error: "The Claude API call failed. Check the server log for details." };
  }
}
