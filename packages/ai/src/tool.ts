import { z } from "zod";
import type { ToolDefinition } from "./types";

export interface Tool {
  definition: ToolDefinition;
  run(input: unknown): Promise<unknown>;
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
    run: async (raw) => config.execute(config.input.parse(raw)),
  };
}
