"use client";

import { useActionState } from "react";
import { setPincode, type PincodeState } from "@/app/basket/actions";
import { buttonClass, fieldClass } from "./ui";

const initial: PincodeState = { error: null };

export function PincodeForm({ pincode }: { pincode: string | null }) {
  const [state, action, pending] = useActionState(setPincode, initial);
  return (
    <form action={action} className="flex flex-col gap-2" noValidate>
      <label htmlFor="pincode" className="text-sm font-semibold">
        Delivery pincode
      </label>
      <div className="flex gap-2">
        <input
          id="pincode"
          name="pincode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={7}
          defaultValue={pincode ?? ""}
          placeholder="e.g. 560001"
          aria-invalid={!!state.error}
          aria-describedby={state.error ? "pincode-error" : undefined}
          className={`${fieldClass} min-w-0 flex-1`}
        />
        <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>
          {pending ? "Checking…" : pincode ? "Change" : "Check"}
        </button>
      </div>
      {state.error && (
        <p id="pincode-error" role="alert" className="text-sm font-semibold text-accent">
          {state.error}
        </p>
      )}
    </form>
  );
}
