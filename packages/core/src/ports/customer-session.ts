import type { CheckoutOrder } from "../domain/checkout";
import type { AccountCustomer, CustomerUser, OutboxSms, StoreSettings } from "../domain/account";

// The signed-in shopper's session (ADR-022). The adapter keeps it in httpOnly cookies, as for admins
// (ADR-016); core and the web app never see tokens.
// No "email taken" result on purpose: it would reveal who has an account (Supabase hides it too).
export type SignUpResult = "check_email" | "failed";
export type SendCodeResult = "sent" | "disabled" | "rate_limited" | "failed";

export interface CustomerSession {
  // false for wrong credentials or an unconfirmed email (one generic message, never which).
  signInWithPassword(email: string, password: string): Promise<boolean>;
  // Sends a confirmation email whose link returns to `redirectTo` (the /auth/callback route).
  signUp(input: { name: string; email: string; password: string; redirectTo: string }): Promise<SignUpResult>;
  // A one-time code by SMS. Creates the account on first use: the code proves the number is theirs.
  sendPhoneCode(e164: string): Promise<SendCodeResult>;
  verifyPhoneCode(e164: string, code: string): Promise<boolean>;
  // Always resolves: whether the email has an account is never revealed.
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  // Needs a session (the reset link signs the shopper in first).
  updatePassword(password: string): Promise<boolean>;
  // The ?code= of an email confirmation or reset link (PKCE): turns it into a session.
  exchangeCode(code: string): Promise<boolean>;
  signOut(): Promise<void>;
  // Verified with the auth server, not just decoded from the cookie. null = signed out.
  currentUser(): Promise<CustomerUser | null>;
}

// Creates the shop's customer row for a signed-in user, once (server-only, service role).
// Deliberately never "claims" an existing unlinked customer row or guest orders by email or phone:
// that is a separate, future feature (ADR-022, claim_guest_orders) that needs its own rules.
export interface CustomerProvisioning {
  ensureForUser(user: CustomerUser, name?: string): Promise<AccountCustomer>;
}

// The signed-in customer's own orders (checkout orders, with frozen lines). Runs with the user's
// session, so RLS (layer 4) applies; callers still pass their customer id (layer 3).
export interface CustomerAccountRepository {
  listOrders(customerId: string, limit: number): Promise<CheckoutOrder[]>;
  // null when it doesn't exist OR isn't theirs; callers can't tell which.
  getOrder(customerId: string, orderNumber: string): Promise<CheckoutOrder | null>;
}

// Shop-wide switches. Reads are server-side; writes come from an admin's own session (RLS).
export interface StoreSettingsReader {
  get(): Promise<StoreSettings>;
}

export interface StoreSettingsAdmin extends StoreSettingsReader {
  // false = someone changed the settings since `version` was read (nothing is overwritten).
  setPhoneOtp(enabled: boolean, version: string): Promise<boolean>;
}

// The mock SMS outbox (ADR-022). Only in mock delivery mode; never shown to shoppers.
export interface SmsOutbox {
  latestFor(e164: string): Promise<OutboxSms | null>;
  recent(limit: number): Promise<OutboxSms[]>;
}
