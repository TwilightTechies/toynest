import type { AIProvider, ModelRequest, ModelResponse } from "../types";

// Plays the role of Claude in tests: returns scripted responses in order and records every request.
export function scriptedProvider(responses: ModelResponse[]) {
  const requests: ModelRequest[] = [];
  const provider: AIProvider = {
    async createMessage(request) {
      requests.push(structuredClone(request));
      const next = responses[requests.length - 1];
      if (!next) throw new Error("Script exhausted");
      return next;
    },
  };
  return { provider, requests };
}
