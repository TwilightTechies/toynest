import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// What kind of failure, so Claude knows whether retrying, fixing the input, or stopping is right.
export type ErrorCategory = "transient" | "validation" | "permission" | "business_rule";

export function toolError(errorCategory: ErrorCategory, message: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ errorCategory, isRetryable: errorCategory === "transient", message }),
      },
    ],
  };
}

export function toolResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

// Wraps a handler so an unexpected failure (e.g. the database timing out) is reported as a
// retryable error instead of crashing the server or being disguised as an empty result.
export async function guarded(handler: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await handler();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return toolError("transient", `The catalogue could not be read (${reason}). Retrying may help.`);
  }
}
