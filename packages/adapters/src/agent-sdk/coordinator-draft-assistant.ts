import { createSdkMcpServer, query, tool, type AgentDefinition, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  getCategoriesTool,
  searchProductsTool,
  submitDraftTool,
  type CatalogDeps,
  type ProductDraft,
  type ProductDraftAssistant,
  type Tool,
} from "@toynest/ai";
import { z } from "zod";

const SERVER = "catalog";
const mcpToolName = (name: string) => `mcp__${SERVER}__${name}`;

const COORDINATOR_PROMPT = `You coordinate ToyNest's product drafting team. You do not research, write copy or check attributes yourself: you delegate to specialists and assemble their results.

Subagents see nothing except the task you write for them, so include every fact they need.

1. Delegate to product-researcher with the full brief.
2. In a single response, delegate to product-writer (the brief plus all research findings) and to product-validator (the brief, the chosen category slug and its required attributes), so they run in parallel.
3. Call submit_product_draft once: the writer's title, description and tags; the validator's attributes and missingInformation; the researcher's category and similar products. If it returns an error, fix the draft as the error explains and submit again.`;

const agents: Record<string, AgentDefinition> = {
  "product-researcher": {
    description: "Picks the best-fitting ToyNest category and finds similar existing products. Use first.",
    prompt: `You research ToyNest's catalogue for a product brief given in your task.
Use get_categories, then search_products. Only cite categories and products the tools return; never invent slugs or prices. An empty search result is valid.
Reply with JSON: categorySlug, categoryReason, requiredAttributes, similarProducts [{slug, name, priceMinor, reason}] (max 3), priceRangeMinor {min, max} or null.`,
    tools: [mcpToolName("get_categories"), mcpToolName("search_products")],
  },
  "product-writer": {
    description: "Writes the title, description and tags from a brief plus research findings. Use after research.",
    prompt: `You write ToyNest product copy for parents and gift buyers in British English: warm, factual, no exaggerated claims.
Use only facts from the brief and research findings in your task. Never invent sizes, piece counts, certifications, safety claims or prices.
Reply with JSON: title (5-80 chars), description (60-150 words), tags (3-8), factsNotUsed (details you wanted but were not given).`,
    tools: [],
  },
  "product-validator": {
    description: "Checks a brief against a category's required attributes. Use once a category is chosen.",
    prompt: `You check which of the required attributes listed in your task the brief states explicitly. Do not infer from the product name.
Reply with JSON: attributes [{name, value}] for stated ones (values normalised, e.g. "3-6 years"), missingInformation [{field, note}] for the rest.`,
    tools: [],
  },
};

export interface CoordinatorDeps extends CatalogDeps {
  model: string;
  maxBudgetUsd?: number;
  onRunComplete?: (summary: { subtype: string; turns: number; costUsd: number; durationMs: number }) => void;
}

// Version B: a coordinator delegating to three specialists via the Claude Agent SDK.
export function createAgentSdkDraftAssistant(deps: CoordinatorDeps): ProductDraftAssistant {
  return {
    async draft(brief) {
      let accepted: ProductDraft | undefined;
      const catalogServer = createSdkMcpServer({
        name: SERVER,
        version: "1.0.0",
        tools: [
          toSdkTool(getCategoriesTool(deps)),
          toSdkTool(searchProductsTool(deps)),
          toSdkTool(submitDraftTool({ ...deps, onAccepted: (draft) => (accepted = draft) })),
        ],
      });

      let result: SDKResultMessage | undefined;
      try {
        for await (const message of query({
          prompt: `Draft a listing for this product.\n\nName: ${brief.name}\nDetails from the admin: ${brief.details}`,
          options: {
            systemPrompt: COORDINATOR_PROMPT,
            model: deps.model,
            agents,
            mcpServers: { [SERVER]: catalogServer },
            // Pre-approved tools; with dontAsk, anything else is denied rather than prompting.
            allowedTools: ["Agent", ...["get_categories", "search_products", "submit_product_draft"].map(mcpToolName)],
            disallowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "NotebookEdit"],
            permissionMode: "dontAsk",
            // Keep this repository's CLAUDE.md, hooks and skills out of the product agent.
            settingSources: [],
            maxTurns: 20,
            maxBudgetUsd: deps.maxBudgetUsd ?? 1,
            env: { ...process.env, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "1" },
          },
        })) {
          if (message.type === "result") result = message;
        }
      } catch (error) {
        // query() throws after yielding an error result; the result (if any) is already captured.
        if (!result) throw error;
      }

      if (result) {
        deps.onRunComplete?.({
          subtype: result.subtype,
          turns: result.num_turns,
          costUsd: result.total_cost_usd,
          durationMs: result.duration_ms,
        });
      }

      const modelCalls = result?.num_turns ?? 0;
      if (accepted) return { status: "needs_review", draft: accepted, modelCalls };
      return {
        status: "failed",
        reason: result ? `The coordinator ended without a valid draft (${result.subtype}).` : "No result from the coordinator.",
        modelCalls,
      };
    },
  };
}

// Exposes a ToyNest Tool through the SDK's in-process MCP server, so versions A and B share one implementation.
function toSdkTool(toyNestTool: Tool) {
  const schema = toyNestTool.inputSchema;
  if (!(schema instanceof z.ZodObject)) {
    throw new Error(`Tool ${toyNestTool.definition.name} needs an object input schema`);
  }
  return tool(toyNestTool.definition.name, toyNestTool.definition.description, schema.shape, async (args) => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(await toyNestTool.run(args)) }] };
    } catch (error) {
      const text = error instanceof Error ? error.message : "Tool failed";
      return { content: [{ type: "text" as const, text }], isError: true };
    }
  });
}
