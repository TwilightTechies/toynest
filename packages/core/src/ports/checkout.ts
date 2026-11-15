import type { CheckoutOrder, OrderDraft, PaymentMethod, PaymentStatus } from "../domain/checkout";
import type { OrderStatus } from "../domain/order";

export type PaymentAttemptStatus = "pending" | "succeeded" | "failed";

// Orders created by checkout (ADR-019). Server-only: the Supabase adapter uses the service role and
// a transactional place_order() function; guest orders are invisible to public RLS roles.
export interface CheckoutOrderRepository {
  // Idempotent on draft.checkoutToken: placing the same draft twice returns the first order
  // (created = false the second time). Order and lines are written in one transaction.
  place(draft: OrderDraft): Promise<{ order: CheckoutOrder; created: boolean }>;
  get(orderId: string): Promise<CheckoutOrder | null>;
  // Opens a payment attempt. Throws ConflictError if the order already has one in progress, so two
  // simultaneous "Pay" clicks can never both charge.
  startPayment(orderId: string, amountMinor: number): Promise<string>;
  finishPayment(
    attemptId: string,
    outcome: { status: PaymentAttemptStatus; reference: string | null; failureReason: string | null },
  ): Promise<void>;
  // The attempt still waiting for the bank, if any.
  pendingAttempt(orderId: string): Promise<{ attemptId: string; reference: string } | null>;
  // Moves the order on, but only from one of `from` payment statuses: false = it had already moved
  // (e.g. a second tab paid it first), and nothing was changed.
  setPayment(
    orderId: string,
    change: { status: OrderStatus; paymentStatus: PaymentStatus; paymentMethod?: PaymentMethod },
    from: PaymentStatus[],
  ): Promise<boolean>;
}

export interface PaymentCharge {
  // Our payment-attempt id, sent as the gateway's idempotency key.
  attemptId: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  // Honoured only by the mock provider (its test panel); a real gateway ignores it.
  testOutcome?: "success" | "failure" | "pending";
}

export interface PaymentResult {
  status: PaymentAttemptStatus;
  reference: string | null;
  failureReason: string | null;
}

// A payment gateway (ADR-019). MockPaymentProvider today; Razorpay or similar later, same port.
export interface PaymentProvider {
  readonly name: string;
  charge(charge: PaymentCharge): Promise<PaymentResult>;
  // For "pending" payments: ask the gateway again.
  getStatus(reference: string): Promise<PaymentResult>;
}

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  placedAt: string;
  customerName: string;
  totalMinor: number;
  currency: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus | null;
  itemCount: number;
}

// Read-only order list for the admin (status updates come in a later phase).
export interface AdminOrderRepository {
  list(query: { limit: number; offset: number }): Promise<{ items: AdminOrderSummary[]; total: number }>;
}
