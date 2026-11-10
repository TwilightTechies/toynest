import "server-only";
import { createAnthropicProvider } from "@toynest/adapters/anthropic";
import { createDraftReviewer, createSingleAgentDraftAssistant } from "@toynest/ai";
import { getRepositories } from "./data";
import { loadRootEnv } from "./env";

export { loadRootEnv };

// Returns null when no API key is configured, so pages can explain instead of crashing.
export async function createDraftServices() {
  loadRootEnv();
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const provider = createAnthropicProvider({ model: process.env.TOYNEST_MODEL ?? "claude-opus-5-5" });
  const { products, categories } = await getRepositories();
  return {
    // Writer and reviewer share a provider but never a conversation: the reviewer is independent.
    writer: createSingleAgentDraftAssistant({ products, categories, provider }),
    reviewer: createDraftReviewer({ provider }),
  };
}
