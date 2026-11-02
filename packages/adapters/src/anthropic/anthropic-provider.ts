import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, AssistantBlock, Message, StopReason } from "@toynest/ai";

export interface AnthropicProviderOptions {
  model: string;
  client?: Anthropic;
}

// Implements the AIProvider port with the Claude Messages API.
export function createAnthropicProvider({ model, client = new Anthropic() }: AnthropicProviderOptions): AIProvider {
  return {
    async createMessage(request) {
      const response = await client.beta.messages.create({
        model,
        max_tokens: request.maxTokens,
        system: request.system,
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema as Anthropic.Beta.BetaTool.InputSchema,
        })),
        messages: request.messages.map(toMessageParam),
        // If a safety classifier declines the request, the API re-runs it on a suitable fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });

      const content: AssistantBlock[] = response.content.flatMap((block): AssistantBlock[] => {
        if (block.type === "text") return [{ type: "text", text: block.text }];
        if (block.type === "tool_use") return [{ type: "tool_use", id: block.id, name: block.name, input: block.input }];
        return []; // thinking, fallback and other blocks travel in providerContent
      });

      // Unknown stop reasons fall through to the loop's "unexpected_stop" branch.
      return { content, stopReason: response.stop_reason as StopReason, providerContent: response.content };
    },
  };
}

function toMessageParam(message: Message): Anthropic.Beta.BetaMessageParam {
  if (message.role === "assistant") {
    // Send the original blocks back unchanged; dropping or editing thinking blocks breaks the next request.
    if (message.providerContent) {
      return { role: "assistant", content: message.providerContent as Anthropic.Beta.BetaContentBlockParam[] };
    }
    return {
      role: "assistant",
      content: message.content.map((block) =>
        block.type === "text"
          ? { type: "text", text: block.text }
          : { type: "tool_use", id: block.id, name: block.name, input: block.input },
      ),
    };
  }

  if (typeof message.content === "string") return { role: "user", content: message.content };
  return {
    role: "user",
    content: message.content.map((block) =>
      block.type === "text"
        ? { type: "text", text: block.text }
        : { type: "tool_result", tool_use_id: block.tool_use_id, content: block.content, is_error: block.is_error },
    ),
  };
}
