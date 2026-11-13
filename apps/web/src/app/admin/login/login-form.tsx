"use client";

import { useActionState } from "react";
import { buttonClass, fieldClass, labelClass } from "@/components/ui";
import { signIn, type SignInState } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null });
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <label className={labelClass}>
        Email
        <input name="email" type="email" required autoComplete="username" className={fieldClass} />
      </label>
      <label className={labelClass}>
        Password
        <input name="password" type="password" required autoComplete="current-password" className={fieldClass} />
      </label>
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-accent">
          {state.error}
        </p>
      )}
      <button disabled={pending} className={`${buttonClass()} min-h-11`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
