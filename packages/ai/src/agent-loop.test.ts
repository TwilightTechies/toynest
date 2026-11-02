import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runAgentLoop } from "./agent-loop";
import { scriptedProvider } from "./testing/scripted-provider";
import { defineTool } from "./tool";
import type { ModelResponse } from "./types";

const stock: Record<string, number> = { "wooden-alphabet-puzzle": 12, "rainbow-crayons": 0 };

const checkInventory = defineTool({
  name: "check_inventory",
  description: "Returns units in stock for one product, identified by its URL slug.",
  input: z.object({ slug: z.string().min(1) }),
  execute: async ({ slug }) => ({ slug, available: stock[slug] ?? 0 }),
});

const toolUse = (id: string, slug: unknown): ModelResponse["content"][number] => ({
  type: "tool_use",
  id,
  name: "check_inventory",
  input: { slug },
});

const base = { system: "You are ToyNest's product assistant.", prompt: "Is the wooden puzzle in stock?" };

describe("runAgentLoop", () => {
  it("stops on end_turn", async () => {
    const { provider } = scriptedProvider([{ stopReason: "end_turn", content: [{ type: "text", text: "Hello" }] }]);

    const result = await runAgentLoop({ ...base, provider, tools: [checkInventory] });

    expect(result).toMatchObject({ status: "completed", text: "Hello", iterations: 1 });
  });

  it("keeps looping when a reply contains text AND a tool_use", async () => {
    const { provider, requests } = scriptedProvider([
      {
        stopReason: "tool_use",
        content: [{ type: "text", text: "Let me check the stock." }, toolUse("toolu_1", "wooden-alphabet-puzzle")],
      },
      { stopReason: "end_turn", content: [{ type: "text", text: "Yes, 12 in stock." }] },
    ]);

    const result = await runAgentLoop({ ...base, provider, tools: [checkInventory] });

    expect(result).toMatchObject({ status: "completed", text: "Yes, 12 in stock.", iterations: 2 });
    // The second request carries the tool result, linked by tool_use_id, inside a user message.
    expect(requests[1]?.messages.at(-1)).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_1", content: '{"slug":"wooden-alphabet-puzzle","available":12}' },
      ],
    });
  });

  it("returns all results for one turn in a single user message", async () => {
    const { provider, requests } = scriptedProvider([
      {
        stopReason: "tool_use",
        content: [toolUse("toolu_1", "wooden-alphabet-puzzle"), toolUse("toolu_2", "rainbow-crayons")],
      },
      { stopReason: "end_turn", content: [{ type: "text", text: "Puzzle yes, crayons no." }] },
    ]);

    await runAgentLoop({ ...base, provider, tools: [checkInventory] });

    const lastMessage = requests[1]?.messages.at(-1);
    expect(lastMessage?.role).toBe("user");
    expect(lastMessage?.content).toHaveLength(2);
  });

  it("reports unknown tools and invalid input to Claude as is_error results", async () => {
    const { provider, requests } = scriptedProvider([
      {
        stopReason: "tool_use",
        content: [
          { type: "tool_use", id: "toolu_1", name: "delete_product", input: {} },
          toolUse("toolu_2", ""),
        ],
      },
      { stopReason: "end_turn", content: [{ type: "text", text: "Sorry, I could not check that." }] },
    ]);

    const result = await runAgentLoop({ ...base, provider, tools: [checkInventory] });

    expect(result.status).toBe("completed");
    const results = requests[1]?.messages.at(-1)?.content;
    expect(results).toEqual([
      expect.objectContaining({ tool_use_id: "toolu_1", is_error: true, content: "Unknown tool: delete_product" }),
      expect.objectContaining({ tool_use_id: "toolu_2", is_error: true }),
    ]);
  });

  it("uses the iteration cap only as a safety net", async () => {
    const forever: ModelResponse = { stopReason: "tool_use", content: [toolUse("toolu_x", "rainbow-crayons")] };
    const { provider } = scriptedProvider([forever, forever, forever]);

    const result = await runAgentLoop({ ...base, provider, tools: [checkInventory], maxIterations: 3 });

    expect(result).toMatchObject({ status: "incomplete", reason: "iteration_limit", iterations: 3 });
  });

  it("reports max_tokens as incomplete rather than as a finished answer", async () => {
    const { provider } = scriptedProvider([{ stopReason: "max_tokens", content: [{ type: "text", text: "The puzz" }] }]);

    const result = await runAgentLoop({ ...base, provider, tools: [checkInventory] });

    expect(result).toMatchObject({ status: "incomplete", reason: "max_tokens" });
  });

  it("sends Claude a JSON schema generated from the Zod input schema", () => {
    expect(checkInventory.definition.input_schema).toMatchObject({
      type: "object",
      properties: { slug: { type: "string", minLength: 1 } },
      required: ["slug"],
    });
  });
});
