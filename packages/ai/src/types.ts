// Provider-neutral shapes that mirror the Claude Messages API. The agent loop depends only on
// these, so it can be tested with a fake provider and the Anthropic SDK stays in packages/adapters.

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "pause_turn" | "refusal";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type AssistantBlock = TextBlock | ToolUseBlock;

export type Message =
  | { role: "user"; content: string | Array<TextBlock | ToolResultBlock> }
  | { role: "assistant"; content: AssistantBlock[] };

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ModelRequest {
  system: string;
  messages: Message[];
  tools: ToolDefinition[];
  maxTokens: number;
}

export interface ModelResponse {
  content: AssistantBlock[];
  stopReason: StopReason;
}

export interface AIProvider {
  createMessage(request: ModelRequest): Promise<ModelResponse>;
}
