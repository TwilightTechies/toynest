import { z } from "zod";
import { MAX_LINE_QUANTITY, type CartLine } from "./cart";
import { normaliseIndianMobile } from "./checkout";

// Customer accounts (ADR-022): email + password, or an Indian mobile number + one-time code.

// The signed-in shopper as the auth server reports them. Tokens never leave the adapter.
export interface CustomerUser {
  id: string;
  email: string | null;
  // E.164, e.g. +919876543210.
  phone: string | null;
  // Email accounts can't sign in before confirming; phone accounts are verified by the code itself.
  emailVerified: boolean;
  // Given at email sign-up; phone sign-ups have none until checkout supplies one.
  name: string | null;
}

// The shop's customer record for an account (customers row linked to the auth user). Unlike the
// support demo's Customer, a phone-only account has no email.
export interface AccountCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

// "98765 43210", "+91 98765-43210", "098765 43210" → "+919876543210". Supabase Auth uses E.164.
export const IndianMobileSchema = z
  .string()
  .transform(normaliseIndianMobile)
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"))
  .transform((digits) => `+91${digits}`);

export function toIndianE164(raw: string): string | null {
  const parsed = IndianMobileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// For display: +919876543210 → "98765 43210"; masked → "98xxxxxx10".
export function formatIndianMobile(e164: string, { masked = false } = {}): string {
  const digits = e164.replace(/^\+91/, "");
  return masked ? `${digits.slice(0, 2)}xxxxxx${digits.slice(-2)}` : `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).pipe(z.string().max(254));

// Long passphrases welcome; 72 is bcrypt's limit (Supabase Auth hashes with bcrypt).
export const PasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters");

export const CustomerNameSchema = z.string().trim().min(2, "Enter your name").max(80);

export const SignUpSchema = z.object({ name: CustomerNameSchema, email: EmailSchema, password: PasswordSchema });
// Sign-in only checks shape: a wrong password and an unknown email get the same message.
export const PasswordSignInSchema = z.object({ email: EmailSchema, password: z.string().min(1, "Enter your password").max(72) });
export const EmailOnlySchema = z.object({ email: EmailSchema });
export const NewPasswordSchema = z.object({ password: PasswordSchema });
export const PhoneCodeRequestSchema = z.object({ phone: IndianMobileSchema });
export const PhoneCodeVerifySchema = z.object({
  phone: IndianMobileSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

// First Zod issue per field, for forms.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

// What a basket merge adds to the account's basket. Lines are the same when product AND engraved
// name match exactly, as the database's unique key does (cart_items.name_key: case-sensitive, so
// "Aarav" and "aarav" are two engravings). Quantities add up but never pass the per-line cap.
export interface CartMergeAdd {
  productId: string;
  personalisationName: string | null;
  quantity: number;
}

const lineKey = (line: Pick<CartLine, "productId" | "personalisationName">) =>
  `${line.productId}\u0000${line.personalisationName ?? ""}`;

export function planCartMerge(guest: CartLine[], account: CartLine[]): CartMergeAdd[] {
  const held = new Map<string, number>();
  for (const line of account) held.set(lineKey(line), (held.get(lineKey(line)) ?? 0) + line.quantity);
  const adds: CartMergeAdd[] = [];
  for (const line of guest) {
    const key = lineKey(line);
    const room = MAX_LINE_QUANTITY - (held.get(key) ?? 0);
    const quantity = Math.min(line.quantity, room);
    if (quantity <= 0) continue;
    held.set(key, (held.get(key) ?? 0) + quantity);
    adds.push({ productId: line.productId, personalisationName: line.personalisationName, quantity });
  }
  return adds;
}

// Shop-wide switches (store_settings, ADR-022).
export const StoreSettingsSchema = z.object({
  phoneOtpEnabled: z.boolean(),
  // Opaque version token for optimistic concurrency (the row's raw updated_at, as in ADR-016).
  version: z.string().min(1),
});
export type StoreSettings = z.infer<typeof StoreSettingsSchema>;

// A sign-in code as the mock SMS outbox recorded it (admin page, server log, tests).
export interface OutboxSms {
  phone: string;
  otp: string;
  createdAt: string;
}
