"use server";

import {
  EmailOnlySchema,
  fieldErrors,
  NewPasswordSchema,
  PasswordSignInSchema,
  PhoneCodeRequestSchema,
  PhoneCodeVerifySchema,
  formatIndianMobile,
  SignUpSchema,
} from "@toynest/core";
import { redirect } from "next/navigation";
import {
  finishSignIn,
  getCustomerContext,
  isPhoneOtpEnabled,
  logMockSms,
  requireSignedIn,
  safeNext,
  signOutCustomer,
  siteUrl,
} from "@/lib/account";

// Customer account actions (ADR-022). Public POST endpoints: every field is validated with Zod, the
// shopper's identity comes only from the verified session, and redirects go to a fixed list.

export interface AccountFormState {
  error: string | null;
  fieldErrors: Record<string, string>;
  done?: boolean;
  values?: Record<string, string>;
}

const UNAVAILABLE = "Accounts aren't available right now. You can still check out as a guest.";
// One message for every credential failure, so the form doesn't reveal which emails have accounts.
const WRONG_CREDENTIALS = "That email and password don't match an account, or the email isn't confirmed yet.";
const PROFILE_CONFLICT = "We couldn't open your account. Please contact us and we'll sort it out.";

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function signInWithPassword(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const values = { email: text(formData, "email") };
  const context = await getCustomerContext();
  if (!context) return { error: UNAVAILABLE, fieldErrors: {}, values };
  const parsed = PasswordSignInSchema.safeParse({ email: values.email, password: text(formData, "password") });
  if (!parsed.success) return { error: null, fieldErrors: fieldErrors(parsed.error), values };

  if (!(await context.session.signInWithPassword(parsed.data.email, parsed.data.password))) {
    return { error: WRONG_CREDENTIALS, fieldErrors: {}, values };
  }
  if (!(await finishSignIn())) return { error: PROFILE_CONFLICT, fieldErrors: {}, values };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const values = { name: text(formData, "name"), email: text(formData, "email") };
  const context = await getCustomerContext();
  if (!context) return { error: UNAVAILABLE, fieldErrors: {}, values };
  const parsed = SignUpSchema.safeParse({ ...values, password: text(formData, "password") });
  if (!parsed.success) return { error: null, fieldErrors: fieldErrors(parsed.error), values };

  const result = await context.session.signUp({ ...parsed.data, redirectTo: await siteUrl("/auth/callback?next=/account") });
  if (result === "failed") return { error: "We couldn't create your account. Please try again in a minute.", fieldErrors: {}, values };
  // Same answer whether or not the email already had an account.
  return { error: null, fieldErrors: {}, done: true, values: { email: parsed.data.email } };
}

// Mobile sign-in, two steps on one form: "send" a code, then "verify" it. Works only while the
// admin switch is on, checked here AND by the database hook that would send the SMS.
export async function phoneCode(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const values = { phone: text(formData, "phone") };
  const context = await getCustomerContext();
  if (!context) return { error: UNAVAILABLE, fieldErrors: {}, values };
  if (!(await isPhoneOtpEnabled())) return { error: "Mobile number sign-in is turned off. Use your email instead.", fieldErrors: {}, values };

  if (formData.get("intent") === "verify") {
    const parsed = PhoneCodeVerifySchema.safeParse({ phone: values.phone, code: text(formData, "code") });
    if (!parsed.success) return { error: null, fieldErrors: fieldErrors(parsed.error), done: true, values };
    if (!(await context.session.verifyPhoneCode(parsed.data.phone, parsed.data.code))) {
      return { error: "That code is wrong or has expired. Check it, or send a new one.", fieldErrors: {}, done: true, values };
    }
    if (!(await finishSignIn(text(formData, "name") || undefined))) return { error: PROFILE_CONFLICT, fieldErrors: {}, values };
    redirect(safeNext(formData.get("next")));
  }

  const parsed = PhoneCodeRequestSchema.safeParse(values);
  if (!parsed.success) return { error: null, fieldErrors: fieldErrors(parsed.error), values };
  const sent = await context.session.sendPhoneCode(parsed.data.phone);
  if (sent === "disabled") return { error: "Mobile number sign-in is turned off. Use your email instead.", fieldErrors: {}, values };
  if (sent === "rate_limited") return { error: "Too many codes requested. Wait a minute, then try again.", fieldErrors: {}, values };
  if (sent === "failed") return { error: "We couldn't send a code. Please try again.", fieldErrors: {}, values };
  await logMockSms(parsed.data.phone);
  return {
    error: null,
    fieldErrors: {},
    done: true,
    values: { phone: parsed.data.phone, masked: formatIndianMobile(parsed.data.phone, { masked: true }) },
  };
}

export async function requestPasswordReset(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const values = { email: text(formData, "email") };
  const context = await getCustomerContext();
  if (!context) return { error: UNAVAILABLE, fieldErrors: {}, values };
  const parsed = EmailOnlySchema.safeParse(values);
  if (!parsed.success) return { error: null, fieldErrors: fieldErrors(parsed.error), values };
  await context.session.requestPasswordReset(parsed.data.email, await siteUrl("/auth/callback?next=/account/reset-password"));
  // The same answer whether or not the email has an account.
  return { error: null, fieldErrors: {}, done: true, values };
}

// The reset link signed the shopper in (/auth/callback); now they choose a new password.
export async function setNewPassword(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  await requireSignedIn();
  const context = await getCustomerContext();
  const parsed = NewPasswordSchema.safeParse({ password: text(formData, "password") });
  if (!parsed.success) return { error: null, fieldErrors: fieldErrors(parsed.error) };
  if (!context || !(await context.session.updatePassword(parsed.data.password))) {
    return { error: "We couldn't change your password. Request a new reset link and try again.", fieldErrors: {} };
  }
  redirect("/account?password=changed");
}

export async function signOut(): Promise<void> {
  await signOutCustomer();
  redirect("/");
}
