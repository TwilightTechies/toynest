"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, fieldClass, labelClass, touchLinkClass } from "@/components/ui";
import {
  phoneCode,
  requestPasswordReset,
  setNewPassword,
  signInWithPassword,
  signUp,
  type AccountFormState,
} from "./actions";

// Account forms (ADR-022): server actions with useActionState, so they work without JavaScript too.

const initial: AccountFormState = { error: null, fieldErrors: {} };

function useForm(action: (state: AccountFormState, data: FormData) => Promise<AccountFormState>) {
  const [state, formAction, pending] = useActionState(action, initial);
  const described = (key: string) =>
    state.fieldErrors[key] ? { "aria-invalid": true, "aria-describedby": `${key}-error` } : {};
  const errorFor = (key: string) =>
    state.fieldErrors[key] ? (
      <span id={`${key}-error`} className="normal-case tracking-normal text-accent">
        {state.fieldErrors[key]}
      </span>
    ) : null;
  return { state, formAction, pending, described, errorFor };
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm font-semibold text-accent">
      {children}
    </p>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-xl bg-surface px-4 py-3 text-sm">
      {children}
    </p>
  );
}

export function PasswordSignInForm({ next }: { next: string }) {
  const { state, formAction, pending, described, errorFor } = useForm(signInWithPassword);
  return (
    <form action={formAction} className="flex flex-col gap-4" key={state.values?.email}>
      <input type="hidden" name="next" value={next} />
      <label className={labelClass}>
        Email
        <input name="email" type="email" required autoComplete="username" defaultValue={state.values?.email} className={fieldClass} {...described("email")} />
        {errorFor("email")}
      </label>
      <label className={labelClass}>
        Password
        <input name="password" type="password" required autoComplete="current-password" className={fieldClass} {...described("password")} />
        {errorFor("password")}
      </label>
      {state.error && <Alert>{state.error}</Alert>}
      <button disabled={pending} className={`${buttonClass()} min-h-11`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <Link href="/account/forgot-password" className={`text-sm font-semibold text-accent hover:underline ${touchLinkClass}`}>
        Forgot your password?
      </Link>
    </form>
  );
}

export function SignUpForm() {
  const { state, formAction, pending, described, errorFor } = useForm(signUp);
  if (state.done) {
    return (
      <Notice>
        Check <strong>{state.values?.email}</strong> for a link to confirm your email, then sign in. It can take a minute
        to arrive; look in spam if it doesn&apos;t.
      </Notice>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-4" key={JSON.stringify(state.values ?? {})}>
      <label className={labelClass}>
        Your name
        <input name="name" required autoComplete="name" maxLength={80} defaultValue={state.values?.name} className={fieldClass} {...described("name")} />
        {errorFor("name")}
      </label>
      <label className={labelClass}>
        Email
        <input name="email" type="email" required autoComplete="email" defaultValue={state.values?.email} className={fieldClass} {...described("email")} />
        {errorFor("email")}
      </label>
      <label className={labelClass}>
        Password <span className="normal-case tracking-normal">(at least 8 characters)</span>
        <input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={fieldClass} {...described("password")} />
        {errorFor("password")}
      </label>
      {state.error && <Alert>{state.error}</Alert>}
      <button disabled={pending} className={`${buttonClass()} min-h-11`}>
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

// Step 1: the mobile number. Step 2: the 6-digit code (and a name for first-time numbers).
// Used on the sign-in page and at checkout; `next` is checked against a fixed list on the server.
export function PhoneCodeForm({ next, defaultPhone = "", compact = false }: { next: string; defaultPhone?: string; compact?: boolean }) {
  const { state, formAction, pending, described, errorFor } = useForm(phoneCode);
  const sent = state.done === true;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {sent ? (
        <>
          <input type="hidden" name="phone" value={state.values?.phone ?? ""} />
          <Notice>
            We sent a 6-digit code to {state.values?.masked ?? "your mobile"}. It works for a few minutes.
          </Notice>
          <label className={labelClass}>
            Code
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} className={fieldClass} {...described("code")} />
            {errorFor("code")}
          </label>
          {!compact && (
            <label className={labelClass}>
              Your name <span className="normal-case tracking-normal">(only if you&apos;re new)</span>
              <input name="name" autoComplete="name" maxLength={80} className={fieldClass} />
            </label>
          )}
          {state.error && <Alert>{state.error}</Alert>}
          <div className="flex flex-wrap gap-3">
            <button name="intent" value="verify" disabled={pending} className={`${buttonClass()} min-h-11`}>
              {pending ? "Checking…" : "Verify and sign in"}
            </button>
            <button name="intent" value="send" formNoValidate disabled={pending} className={`${buttonClass("secondary")} min-h-11`}>
              Send a new code
            </button>
          </div>
        </>
      ) : (
        <>
          <label className={labelClass}>
            Mobile number
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="98765 43210"
              defaultValue={state.values?.phone ?? defaultPhone}
              className={fieldClass}
              {...described("phone")}
            />
            {errorFor("phone")}
          </label>
          {state.error && <Alert>{state.error}</Alert>}
          <button name="intent" value="send" disabled={pending} className={`${buttonClass(compact ? "secondary" : "primary")} min-h-11`}>
            {pending ? "Sending…" : "Send code"}
          </button>
        </>
      )}
    </form>
  );
}

export function ForgotPasswordForm() {
  const { state, formAction, pending, described, errorFor } = useForm(requestPasswordReset);
  if (state.done) {
    return <Notice>If {state.values?.email} has an account, we&apos;ve sent a link to choose a new password.</Notice>;
  }
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className={labelClass}>
        Email
        <input name="email" type="email" required autoComplete="email" defaultValue={state.values?.email} className={fieldClass} {...described("email")} />
        {errorFor("email")}
      </label>
      {state.error && <Alert>{state.error}</Alert>}
      <button disabled={pending} className={`${buttonClass()} min-h-11`}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

export function NewPasswordForm() {
  const { state, formAction, pending, described, errorFor } = useForm(setNewPassword);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className={labelClass}>
        New password <span className="normal-case tracking-normal">(at least 8 characters)</span>
        <input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={fieldClass} {...described("password")} />
        {errorFor("password")}
      </label>
      {state.error && <Alert>{state.error}</Alert>}
      <button disabled={pending} className={`${buttonClass()} min-h-11`}>
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
