import { describe, expect, it } from "vitest";
import { createMockPaymentProvider } from "./mock-payment-provider";

describe("mock payment provider", () => {
  const charge = { attemptId: "a1", orderNumber: "TN-20001", amountMinor: 59900, currency: "INR" };

  it("succeeds by default and fails on request", async () => {
    const provider = createMockPaymentProvider();
    expect(await provider.charge(charge)).toMatchObject({ status: "succeeded", failureReason: null });
    expect(await provider.charge({ ...charge, testOutcome: "failure" })).toMatchObject({ status: "failed", failureReason: expect.any(String) });
  });

  it("a pending payment settles on a status check after the delay", async () => {
    let clock = 1_000_000;
    const provider = createMockPaymentProvider({ pendingSettlesAfterMs: 5000, now: () => clock });
    const { reference, status } = await provider.charge({ ...charge, testOutcome: "pending" });
    expect(status).toBe("pending");
    clock += 4999;
    expect((await provider.getStatus(reference!)).status).toBe("pending");
    clock += 1;
    expect((await provider.getStatus(reference!)).status).toBe("succeeded");
  });

  it("rejects a reference it didn't issue", async () =>
    expect((await createMockPaymentProvider().getStatus("pay_123")).status).toBe("failed"));
});
