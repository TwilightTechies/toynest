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

// A tool call that has already finished, as seen by hooks.
export interface CompletedToolCall {
  name: string;
  input: unknown;
  output: unknown;
  isError: boolean;
}

// Deterministic enforcement around tool calls; Claude cannot skip these.
export interface ToolHooks {
  // PreToolUse: return { block: reason } to stop the call. The reason reaches Claude as an is_error result.
  // `completed` holds calls from earlier turns only, so a call cannot satisfy a prerequisite in the same turn.
  beforeToolCall?(call: ToolUseBlock, completed: readonly CompletedToolCall[]): { block: string } | undefined;
  // PostToolUse: transform a successful result before Claude sees it (e.g. normalise formats).
  afterToolCall?(call: ToolUseBlock, output: unknown): unknown;
}

export interface RunAgentOptions {
  provider: AIProvider;
  system: string;
  prompt: string;
  tools: Tool[];
  hooks?: ToolHooks;
  maxTokens?: number;
  // Safety net only. Normal termination is driven by stop_reason, never by counting turns.
  maxIterations?: number;
}

export async function runAgentLoop(options: RunAgentOptions): Promise<LoopResult> {
  const { provider, system, tools, hooks = {}, maxTokens = 16000, maxIterations = 10 } = options;
  const toolsByName = new Map(tools.map((tool) => [tool.definition.name, tool]));
  const definitions = tools.map((tool) => tool.definition);
  const messages: Message[] = [{ role: "user", content: options.prompt }];
  const completed: CompletedToolCall[] = [];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const response = await provider.createMessage({ system, messages, tools: definitions, maxTokens });
    messages.push({ role: "assistant", content: response.content, providerContent: response.providerContent });

    switch (response.stopReason) {
      case "end_turn":
        return { status: "completed", text: textOf(response.content), messages, iterations: iteration };

      case "tool_use": {
        // Text in the same reply ("Let me check...") is not a completion signal; keep looping.
        const calls = response.content.filter((block): block is ToolUseBlock => block.type === "tool_use");
        // Hooks see only earlier turns: snapshot before running this turn's calls.
        const earlier = [...completed];
        const outcomes = await Promise.all(calls.map((call) => executeTool(toolsByName, hooks, earlier, call)));
        completed.push(...outcomes.map((outcome) => outcome.record));
        // Every result for one assistant turn goes back in a single user message.
        messages.push({ role: "user", content: outcomes.map((outcome) => outcome.result) });
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

// Tool failures and blocked calls are reported to Claude as is_error results so it can recover,
// instead of crashing the loop.
async function executeTool(
  toolsByName: Map<string, Tool>,
  hooks: ToolHooks,
  earlier: readonly CompletedToolCall[],
  call: ToolUseBlock,
): Promise<{ result: ToolResultBlock; record: CompletedToolCall }> {
  const fail = (content: string) => ({
    result: { type: "tool_result" as const, tool_use_id: call.id, content, is_error: true },
    record: { name: call.name, input: call.input, output: content, isError: true },
  });

  const tool = toolsByName.get(call.name);
  if (!tool) return fail(`Unknown tool: ${call.name}`);

  const decision = hooks.beforeToolCall?.(call, earlier);
  if (decision) return fail(`Blocked by policy: ${decision.block}`);

  try {
    const raw = await tool.run(call.input);
    const output = hooks.afterToolCall ? hooks.afterToolCall(call, raw) : raw;
    return {
      result: { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(output) },
      record: { name: call.name, input: call.input, output, isError: false },
    };
  } catch (error) {
    return fail(
      error instanceof z.ZodError
        ? `Invalid input: ${z.prettifyError(error)}`
        : error instanceof Error
          ? error.message
          : "Tool failed",
    );
  }
}

function textOf(content: AssistantBlock[]): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
