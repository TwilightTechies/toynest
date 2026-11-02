// Runs a product draft against the real Claude API.
//   npm run demo:draft -w @toynest/adapters -- [single|coordinator] ["Product name"] ["Details"]
// Reads ANTHROPIC_API_KEY (and optional TOYNEST_MODEL) from .env.local at the repo root.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSingleAgentDraftAssistant } from "@toynest/ai";
import { createAgentSdkDraftAssistant, createAnthropicProvider, loadSampleCatalog } from "../src/index";

const [
  mode = "single",
  name = "Wooden Alphabet Puzzle",
  details = "Age group: 3-6. Material: wood. Colourful wooden alphabet puzzle.",
] = process.argv.slice(2);

if (mode !== "single" && mode !== "coordinator") {
  console.error(`Unknown mode "${mode}". Use "single" or "coordinator".`);
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local at the repo root.");
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const catalog = await loadSampleCatalog(path.join(repoRoot, "data/sample-catalog.json"));
const model = process.env.TOYNEST_MODEL ?? "claude-opus-5-5";

const assistant =
  mode === "coordinator"
    ? createAgentSdkDraftAssistant({ ...catalog, model, onRunComplete: (summary) => console.log("Run summary:", summary) })
    : createSingleAgentDraftAssistant({ ...catalog, provider: createAnthropicProvider({ model }) });

const startedAt = Date.now();
const outcome = await assistant.draft({ name, details });
console.log(JSON.stringify(outcome, null, 2));
console.log(`\n${mode} · ${model} · ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
