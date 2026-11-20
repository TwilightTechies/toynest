import type {
  AccountCustomer,
  CustomerAccountRepository,
  CustomerProvisioning,
  CustomerSession,
  CustomerUser,
} from "@toynest/core";
import { z } from "zod";
import type { SupabaseClient } from "./client";
import { toRepositoryError } from "./errors";
import { CHECKOUT_ORDER_COLUMNS, toCheckoutOrder } from "./checkout-repository";
import { createSessionClient, type SessionClientOptions } from "./session-client";

export type CustomerContextOptions = SessionClientOptions;

// Supabase stores phone numbers without the "+"; the shop uses E.164 with it.
const toE164 = (phone: string | undefined | null) => (phone ? `+${phone.replace(/^\+/, "")}` : null);

const UserMetadataSchema = z.object({ name: z.string().trim().min(1).max(80).optional() }).loose();

// ADR-022. One client per request carrying the shopper's session (anon key + their JWT, httpOnly
// cookies), so the account repository's reads run as them and RLS applies (layer 4).
export function createSupabaseCustomerContext(options: CustomerContextOptions) {
  const client = createSessionClient(options);

  const session: CustomerSession = {
    async signInWithPassword(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      return !error;
    },

    async signUp({ name, email, password, redirectTo }) {
      // With "Confirm email" on, no session is created until the link is clicked. For an email that
      // already has an account, Supabase answers the same way without sending a sign-up email, so
      // nobody can test which emails are registered.
      const { error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo, data: { name } },
      });
      return error ? "failed" : "check_email";
    },

    async sendPhoneCode(e164) {
      // shouldCreateUser: the code itself proves the number belongs to the person typing it, so a
      // first-time number simply gets an account.
      const { error } = await client.auth.signInWithOtp({ phone: e164, options: { shouldCreateUser: true, channel: "sms" } });
      if (!error) return "sent";
      // The send_sms hook refuses while the admin switch is off (403 "turned off"); the Phone
      // provider switched off in the dashboard is "disabled" too.
      if (error.status === 403 || /turned off/i.test(error.message) || error.code === "phone_provider_disabled") return "disabled";
      if (error.status === 429) return "rate_limited";
      return "failed";
    },

    async verifyPhoneCode(e164, code) {
      const { error } = await client.auth.verifyOtp({ phone: e164, token: code, type: "sms" });
      return !error;
    },

    async requestPasswordReset(email, redirectTo) {
      // The result is ignored on purpose: the page says "if that email has an account..." either way.
      await client.auth.resetPasswordForEmail(email, { redirectTo });
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      return !error;
    },

    async exchangeCode(code) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      return !error;
    },

    async signOut() {
      // Revokes the refresh token server-side and clears the cookies.
      await client.auth.signOut();
    },

    // getUser() asks the auth server, so a forged or revoked token is rejected (ADR-016).
    async currentUser(): Promise<CustomerUser | null> {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      const user = data.user;
      const metadata = UserMetadataSchema.safeParse(user.user_metadata ?? {});
      return {
        id: user.id,
        email: user.email || null,
        phone: toE164(user.phone),
        emailVerified: Boolean(user.email_confirmed_at),
        name: metadata.success ? (metadata.data.name ?? null) : null,
      };
    },
  };

  return { session, account: createSupabaseCustomerAccountRepository(client) };
}

export type SupabaseCustomerContext = ReturnType<typeof createSupabaseCustomerContext>;

const isUuid = (value: string) => z.uuid().safeParse(value).success;
const ORDER_NUMBER = /^TN-\d{4,8}$/;

// Layer 3 (filter by the session's customer id) AND layer 4 (the user-scoped client: RLS shows a
// signed-in user only orders of their own customer row). Checkout orders only (they have a token).
export function createSupabaseCustomerAccountRepository(client: SupabaseClient): CustomerAccountRepository {
  return {
    async listOrders(customerId, limit) {
      if (!isUuid(customerId)) return [];
      const result = await client
        .from("orders")
        .select(CHECKOUT_ORDER_COLUMNS)
        .eq("customer_id", customerId)
        .not("checkout_token", "is", null)
        .order("placed_at", { ascending: false })
        .limit(limit);
      if (result.error) throw toRepositoryError(result, "account.listOrders");
      return z.array(z.unknown()).parse(result.data).map(toCheckoutOrder);
    },

    async getOrder(customerId, orderNumber) {
      if (!isUuid(customerId) || !ORDER_NUMBER.test(orderNumber)) return null;
      const result = await client
        .from("orders")
        .select(CHECKOUT_ORDER_COLUMNS)
        .eq("customer_id", customerId)
        .eq("order_number", orderNumber)
        .not("checkout_token", "is", null)
        .maybeSingle();
      if (result.error) throw toRepositoryError(result, "account.getOrder");
      return result.data ? toCheckoutOrder(result.data) : null;
    },
  };
}

const AccountRowSchema = z.object({ id: z.string(), name: z.string(), email: z.string().nullable(), phone: z.string().nullable() });
const ACCOUNT_COLUMNS = "id, name, email, phone";
const UNIQUE_VIOLATION = "23505";

export class CustomerProfileConflictError extends Error {
  constructor() {
    super("A customer record with this email or phone already exists without a login.");
    this.name = "CustomerProfileConflictError";
  }
}

// Server-only (service role): customers has no insert policy for shoppers. Idempotent, race-safe.
export function createSupabaseCustomerProvisioning(client: SupabaseClient): CustomerProvisioning {
  const findByUser = async (authUserId: string): Promise<AccountCustomer | null> => {
    const result = await client.from("customers").select(ACCOUNT_COLUMNS).eq("auth_user_id", authUserId).maybeSingle();
    if (result.error) throw toRepositoryError(result, "customers.findByUser");
    return result.data ? AccountRowSchema.parse(result.data) : null;
  };

  return {
    async ensureForUser(user, name) {
      const existing = await findByUser(user.id);
      if (existing) return existing;

      const result = await client
        .from("customers")
        .insert({
          auth_user_id: user.id,
          name: (name ?? user.name ?? "").trim() || "Customer",
          // Only a confirmed email is recorded; phone accounts are verified by the code.
          email: user.emailVerified ? user.email : null,
          phone: user.phone,
        })
        .select(ACCOUNT_COLUMNS)
        .single();
      if (!result.error) return AccountRowSchema.parse(result.data);
      if (result.error.code === UNIQUE_VIOLATION) {
        // A parallel request created it first: that row wins.
        const raced = await findByUser(user.id);
        if (raced) return raced;
        // An older row (e.g. demo data) has this email or phone but no login. Linking it would be
        // the "claim earlier orders" feature, which needs its own rules (ADR-022), so refuse.
        throw new CustomerProfileConflictError();
      }
      throw toRepositoryError(result, "customers.ensureForUser");
    },
  };
}
