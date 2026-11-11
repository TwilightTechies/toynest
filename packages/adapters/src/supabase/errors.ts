import { RepositoryUnavailableError } from "@toynest/core";

export interface SupabaseErrorResult {
  error: { message: string; code?: string } | null;
  status: number;
}

// "Couldn't reach the database" (network, timeout, 5xx) becomes RepositoryUnavailableError,
// which callers treat as retryable. Anything else is a bug or misconfiguration and stays loud.
export function toRepositoryError(result: SupabaseErrorResult, operation: string): Error {
  const message = result.error?.message ?? "unknown error";
  const unreachable =
    result.status === 0 ||
    result.status === 408 ||
    result.status >= 500 ||
    /fetch failed|network|timed? ?out|abort/i.test(message);
  return unreachable
    ? new RepositoryUnavailableError(`${operation}: database unavailable`)
    : new Error(`${operation} failed: ${message}`);
}
