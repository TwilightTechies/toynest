import { runAgentLoop } from "../agent-loop";
import type { AIProvider } from "../types";
import type { ProductDraft, ProductDraftAssistant } from "./contract";
import { getCategoriesTool, searchProductsTool, submitDraftTool, type CatalogDeps } from "./tools";

const SYSTEM_PROMPT = `You draft product listings for ToyNest, an online shop for toys, personalised toys, educational toys and stationery.

Work in this order:
1. Call get_categories and choose the best category for the product.
2. Call search_products to find up to 3 similar existing products.
3. Call submit_product_draft once with the complete draft.

Rules:
- Use only facts from the admin's brief and from tool results. Never invent materials, ages, sizes, certifications or prices.
- For every required attribute of the chosen category that the brief does not state, add a missingInformation entry instead of guessing.
- Write in British English for parents and gift buyers: factual and warm, without exaggerated claims.
- If submit_product_draft returns an error, fix the draft as the error explains and submit again.`;

export interface SingleAgentDeps extends CatalogDeps {
  provider: AIProvider;
  maxIterations?: number;
}

// Version A: one agent, one conversation, all three tools.
export function createSingleAgentDraftAssistant(deps: SingleAgentDeps): ProductDraftAssistant {
  return {
    async draft(brief) {
      let accepted: ProductDraft | undefined;

      const result = await runAgentLoop({
        provider: deps.provider,
        system: SYSTEM_PROMPT,
        prompt: `Draft a listing for this product.\n\nName: ${brief.name}\nDetails from the admin: ${brief.details}`,
        tools: [
          getCategoriesTool(deps),
          searchProductsTool(deps),
          submitDraftTool({ ...deps, onAccepted: (draft) => (accepted = draft) }),
        ],
        maxTokens: 2048,
        maxIterations: deps.maxIterations ?? 8,
      });

      if (accepted) {
        return { status: "needs_review", draft: accepted, modelCalls: result.iterations };
      }
      const reason =
        result.status === "completed"
          ? "The assistant finished without submitting a valid draft."
          : `The assistant stopped early: ${result.reason}.`;
      return { status: "failed", reason, modelCalls: result.iterations };
    },
  };
}
