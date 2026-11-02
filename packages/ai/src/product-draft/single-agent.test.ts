import type { Category, Product, ProductRepository } from "@toynest/core";
import { describe, expect, it } from "vitest";
import { scriptedProvider } from "../testing/scripted-provider";
import type { ModelResponse } from "../types";
import type { ProductDraft } from "./contract";
import { createSingleAgentDraftAssistant } from "./single-agent";

const categoryList: Category[] = [
  {
    id: "5b0c6a0e-0f4e-4d2a-9a51-1c3d5e7f9a01",
    slug: "educational-toys",
    name: "Educational toys",
    requiredAttributes: ["ageRange", "material", "learningFocus"],
  },
  { id: "5b0c6a0e-0f4e-4d2a-9a51-1c3d5e7f9a02", slug: "stationery", name: "Stationery", requiredAttributes: ["material"] },
];

const productList: Product[] = [
  {
    id: "9d8e7f6a-5b4c-4d3e-8f2a-1b0c9d8e7f01",
    slug: "wooden-number-puzzle",
    name: "Wooden Number Puzzle",
    description: "Numbers 0-9 in chunky wood.",
    categoryId: "5b0c6a0e-0f4e-4d2a-9a51-1c3d5e7f9a01",
    priceMinor: 1299,
    currency: "GBP",
    status: "active",
  },
];

const products: ProductRepository = {
  findBySlug: async (slug) => productList.find((product) => product.slug === slug) ?? null,
  search: async ({ text = "", limit }) => {
    const words = text.toLowerCase().split(/\s+/);
    const items = productList.filter((p) => words.some((word) => p.name.toLowerCase().includes(word))).slice(0, limit);
    return { items, total: items.length };
  },
};
const categories = { list: async () => categoryList };

const validDraft: ProductDraft = {
  title: "Wooden Alphabet Puzzle",
  description: "A colourful wooden alphabet puzzle that helps children aged 3 to 6 learn their letters through play.",
  categorySlug: "educational-toys",
  attributes: [
    { name: "ageRange", value: "3-6 years" },
    { name: "material", value: "Wood" },
  ],
  tags: ["puzzle", "alphabet", "wooden"],
  similarProducts: [{ slug: "wooden-number-puzzle", reason: "Same material and puzzle format" }],
  missingInformation: [{ field: "learningFocus", note: "Brief implies letters but does not state it; please confirm." }],
};

const call = (id: string, name: string, input: unknown): ModelResponse => ({
  stopReason: "tool_use",
  content: [{ type: "tool_use", id, name, input }],
});
const done: ModelResponse = { stopReason: "end_turn", content: [{ type: "text", text: "Draft submitted." }] };
const brief = { name: "Wooden Alphabet Puzzle", details: "Ages 3-6. Wood. Colourful wooden alphabet puzzle." };

function assistantWith(script: ModelResponse[], maxIterations?: number) {
  const { provider, requests } = scriptedProvider(script);
  return { assistant: createSingleAgentDraftAssistant({ provider, products, categories, maxIterations }), requests };
}

// The tool_result Claude received for its most recent tool call.
const lastToolResult = (requests: ReturnType<typeof scriptedProvider>["requests"]) => {
  const content = requests.at(-1)?.messages.at(-1)?.content;
  return Array.isArray(content) ? content[0] : undefined;
};

describe("single-agent product draft assistant", () => {
  it("researches, submits, and returns the draft for admin review", async () => {
    const { assistant } = assistantWith([
      call("t1", "get_categories", {}),
      call("t2", "search_products", { query: "wooden puzzle" }),
      call("t3", "submit_product_draft", validDraft),
      done,
    ]);

    const outcome = await assistant.draft(brief);

    expect(outcome).toEqual({ status: "needs_review", draft: validDraft, modelCalls: 4 });
  });

  it("lets Claude recover from an invented category", async () => {
    const { assistant, requests } = assistantWith([
      call("t1", "submit_product_draft", { ...validDraft, categorySlug: "puzzles" }),
      call("t2", "submit_product_draft", validDraft),
      done,
    ]);

    const outcome = await assistant.draft(brief);

    expect(outcome.status).toBe("needs_review");
    const firstFeedback = requests[1]?.messages.at(-1)?.content;
    expect(firstFeedback).toEqual([
      expect.objectContaining({ is_error: true, content: expect.stringContaining("Call get_categories") }),
    ]);
  });

  it("rejects a draft that silently drops a required attribute", async () => {
    const { assistant, requests } = assistantWith([
      call("t1", "submit_product_draft", { ...validDraft, missingInformation: [] }),
      done,
    ]);

    const outcome = await assistant.draft(brief);

    expect(lastToolResult(requests)).toMatchObject({ is_error: true, content: expect.stringContaining("learningFocus") });
    expect(outcome).toMatchObject({ status: "failed", reason: expect.stringContaining("without submitting") });
  });

  it("rejects similar products that are not in the catalogue", async () => {
    const { requests, assistant } = assistantWith([
      call("t1", "submit_product_draft", {
        ...validDraft,
        similarProducts: [{ slug: "imaginary-toy", reason: "Looks similar" }],
      }),
      done,
    ]);

    await assistant.draft(brief);

    expect(lastToolResult(requests)).toMatchObject({ is_error: true, content: expect.stringContaining("imaginary-toy") });
  });

  it("fails rather than looping forever when Claude never submits", async () => {
    const { assistant } = assistantWith(
      [call("t1", "get_categories", {}), call("t2", "get_categories", {}), call("t3", "get_categories", {})],
      3,
    );

    const outcome = await assistant.draft(brief);

    expect(outcome).toEqual({ status: "failed", reason: "The assistant stopped early: iteration_limit.", modelCalls: 3 });
  });
});
