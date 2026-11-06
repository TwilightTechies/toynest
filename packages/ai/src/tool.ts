import { z } from "zod";
import type { ToolDefinition } from "./types";

export interface Tool {
  definition: ToolDefinition;
  // Exposed so adapters (e.g. the Agent SDK's MCP server) can reuse the same validation.
  inputSchema: z.ZodType;
  run(input: unknown): Promise<unknown>;
}

export type ToolErrorCategory = "transient" | "validation" | "business" | "permission";

// A failure Claude can act on: the loop sends it as { error, errorCategory, isRetryable } so Claude
// can tell "retry later" from "this will never work" from "ask a human".
export class ToolError extends Error {
  readonly category: ToolErrorCategory;
  readonly retryable: boolean;

  constructor(message: string, options: { category: ToolErrorCategory; retryable: boolean }) {
    super(message);
    this.name = "ToolError";
    this.category = options.category;
    this.retryable = options.retryable;
  }
}

// One Zod schema drives both the JSON schema Claude sees and the runtime validation of its input.
export function defineTool<S extends z.ZodType>(config: {
  name: string;
  description: string;
  input: S;
  execute: (input: z.infer<S>) => Promise<unknown>;
}): Tool {
  // io: "input" describes what Claude must send, so fields with defaults stay optional.
  const { $schema: _ignored, ...inputSchema } = z.toJSONSchema(config.input, { io: "input" });
  return {
    definition: { name: config.name, description: config.description, input_schema: inputSchema },
    inputSchema: config.input,
    run: async (raw) => config.execute(config.input.parse(raw)),
  };
}
