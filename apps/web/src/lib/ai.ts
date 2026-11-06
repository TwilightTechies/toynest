import "server-only";
import path from "node:path";
import { createAnthropicProvider } from "@toynest/adapters/anthropic";
import { loadSampleCatalog } from "@toynest/adapters/sample-catalog";
import { createDraftReviewer, createSingleAgentDraftAssistant } from "@toynest/ai";
import { dataDir, repoRoot } from "./catalog";

// One key file for the whole repo: the root .env.local (gitignored). Server-only; never NEXT_PUBLIC_.
export function loadRootEnv() {
  if (process.env.ANTHROPIC_API_KEY) return;
  try {
    process.loadEnvFile(path.join(repoRoot, ".env.local"));
  } catch {
    // No file yet: callers report that the key is missing.
  }
}

// Returns null when no API key is configured, so pages can explain instead of crashing.
export async function createDraftServices() {
  loadRootEnv();
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const provider = createAnthropicProvider({ model: process.env.TOYNEST_MODEL ?? "claude-opus-5-5" });
  const catalog = await loadSampleCatalog(path.join(dataDir, "sample-catalog.json"));
  return {
    // Writer and reviewer share a provider but never a conversation: the reviewer is independent.
    writer: createSingleAgentDraftAssistant({ ...catalog, provider }),
    reviewer: createDraftReviewer({ provider }),
  };
}
