import { RepositoryUnavailableError } from "@toynest/core";
import { describe, expect, it } from "vitest";
import { toRepositoryError } from "./errors";

describe("toRepositoryError", () => {
  it.each([
    { status: 0, message: "TypeError: fetch failed" },
    { status: 503, message: "Service Unavailable" },
    { status: 0, message: "AbortError: This operation was aborted" },
    { status: 408, message: "Request Timeout" },
  ])("treats $status / $message as unavailable (retryable)", ({ status, message }) => {
    expect(toRepositoryError({ status, error: { message } }, "orders.find")).toBeInstanceOf(RepositoryUnavailableError);
  });

  it("keeps other errors loud, as plain errors", () => {
    const error = toRepositoryError({ status: 400, error: { message: "column orders.nope does not exist", code: "42703" } }, "orders.find");
    expect(error).not.toBeInstanceOf(RepositoryUnavailableError);
    expect(error.message).toContain("orders.find failed");
  });
});
