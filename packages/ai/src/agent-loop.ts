import { z } from "zod";
import type { Tool } from "./tool";
import type { AIProvider, AssistantBlock, Message, ToolResultBlock, ToolUseBlock } from "./types";

export type LoopResult =
  | { status: "completed"; text: string; messages: Message[]; iterations: number }
  | {
      status: "incomplete";
      reason: "max_tokens" | "refusal" | "iteration_limit" | "unexpected_stop";
      messages: Message[];
      iterations: number;
    };

export interface RunAgentOptions {
  provider: AIProvider;
  system: string;
  prompt: string;
  tools: Tool[];
  maxTokens?: number;
  // Safety net only. Normal termination is driven by stop_reason, never by counting turns.
  maxIterations?: number;
}

export async function runAgentLoop(options: RunAgentOptions): Promise<LoopResult> {
  const { provider, system, tools, maxTokens = 16000, maxIterations = 10 } = options;
  const toolsByName = new Map(tools.map((tool) => [tool.definition.name, tool]));
  const definitions = tools.map((tool) => tool.definition);
  const messages: Message[] = [{ role: "user", content: options.prompt }];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const response = await provider.createMessage({ system, messages, tools: definitions, maxTokens });
    messages.push({ role: "assistant", content: response.content, providerContent: response.providerContent });

    switch (response.stopReason) {
      case "end_turn":
        return { status: "completed", text: textOf(response.content), messages, iterations: iteration };

      case "tool_use": {
        // Text in the same reply ("Let me check...") is not a completion signal; keep looping.
        const calls = response.content.filter((block): block is ToolUseBlock => block.type === "tool_use");
        // Every result for one assistant turn goes back in a single user message.
        const results = await Promise.all(calls.map((call) => executeTool(toolsByName, call)));
        messages.push({ role: "user", content: results });
        break;
      }

      case "max_tokens":
      case "refusal":
        return { status: "incomplete", reason: response.stopReason, messages, iterations: iteration };

      default:
        return { status: "incomplete", reason: "unexpected_stop", messages, iterations: iteration };
    }
  }

  return { status: "incomplete", reason: "iteration_limit", messages, iterations: maxIterations };
}

// Tool failures are reported to Claude as is_error results so it can recover, instead of crashing the loop.
async function executeTool(toolsByName: Map<string, Tool>, call: ToolUseBlock): Promise<ToolResultBlock> {
  const tool = toolsByName.get(call.name);
  if (!tool) {
    return { type: "tool_result", tool_use_id: call.id, content: `Unknown tool: ${call.name}`, is_error: true };
  }
  try {
    const output = await tool.run(call.input);
    return { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(output) };
  } catch (error) {
    const content =
      error instanceof z.ZodError
        ? `Invalid input: ${z.prettifyError(error)}`
        : error instanceof Error
          ? error.message
          : "Tool failed";
    return { type: "tool_result", tool_use_id: call.id, content, is_error: true };
  }
}

function textOf(content: AssistantBlock[]): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
