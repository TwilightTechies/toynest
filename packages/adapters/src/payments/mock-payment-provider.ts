import type { PaymentProvider, PaymentResult } from "@toynest/core";

// A stand-in payment gateway (ADR-019): no money moves. The shopper's test panel picks the outcome.
// It is stateless, like a real gateway call: the outcome and the time are encoded in the reference,
// so any server instance can answer "what happened to this payment?".
//   success → succeeded; failure → failed (card declined); pending → pending, and a status check at
//   least `pendingSettlesAfterMs` later reports succeeded (the bank confirmed it).
export function createMockPaymentProvider({
  pendingSettlesAfterMs = 5000,
  now = () => Date.now(),
}: { pendingSettlesAfterMs?: number; now?: () => number } = {}): PaymentProvider {
  return {
    name: "mock",

    async charge({ attemptId, testOutcome = "success" }) {
      const reference = `mock_${testOutcome}_${now()}_${attemptId}`;
      if (testOutcome === "failure") {
        return { status: "failed", reference, failureReason: "The bank declined this test payment." };
      }
      return { status: testOutcome === "pending" ? "pending" : "succeeded", reference, failureReason: null };
    },

    async getStatus(reference): Promise<PaymentResult> {
      const match = /^mock_(success|failure|pending)_(\d+)_/.exec(reference);
      if (!match) return { status: "failed", reference, failureReason: "Unknown payment reference." };
      const [, outcome, startedAt] = match;
      if (outcome === "failure") return { status: "failed", reference, failureReason: "The bank declined this test payment." };
      if (outcome === "pending" && now() - Number(startedAt) < pendingSettlesAfterMs) {
        return { status: "pending", reference, failureReason: null };
      }
      return { status: "succeeded", reference, failureReason: null };
    },
  };
}
