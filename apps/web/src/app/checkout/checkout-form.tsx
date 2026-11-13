"use client";

import { useActionState } from "react";
import { buttonClass, cardClass, fieldClass, labelClass } from "@/components/ui";
import { placeOrder, type CheckoutFormState } from "./actions";

const initial: CheckoutFormState = { message: null, fieldErrors: {} };

export function CheckoutForm({
  checkoutToken,
  defaultPincode,
  states,
  codAllowed,
  codLimit,
}: {
  checkoutToken: string;
  defaultPincode: string;
  states: string[];
  codAllowed: boolean;
  codLimit: string;
}) {
  const [state, action, pending] = useActionState(placeOrder, initial);
  const value = (key: string, fallback = "") => state.values?.[key] ?? fallback;
  const error = (key: string) => state.fieldErrors[key];
  // Ties a field to its error message for screen readers.
  const described = (key: string) => (error(key) ? { "aria-invalid": true, "aria-describedby": `${key}-error` } : {});
  const errorFor = (field: string) =>
    error(field) ? (
      <span id={`${field}-error`} className="normal-case tracking-normal text-accent">
        {error(field)}
      </span>
    ) : null;

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="checkoutToken" value={checkoutToken} />
      {state.message && (
        <p role="alert" className="rounded-xl border border-accent bg-surface px-4 py-3 text-sm font-semibold">
          {state.message}
        </p>
      )}

      {/* key: remount with the echoed values after a rejected submit (React resets forms after actions). */}
      <fieldset key={JSON.stringify(state.values ?? {})} className={`${cardClass} grid gap-4 p-5 sm:grid-cols-2 sm:p-6`}>
        <legend className="sr-only">Delivery details</legend>
        <h2 className="font-display text-xl font-semibold sm:col-span-2">Delivery details</h2>
        <label className={`${labelClass} sm:col-span-2`}>
          Full name
          <input name="name" required autoComplete="name" maxLength={80} defaultValue={value("name")} className={fieldClass} {...described("name")} />
          {errorFor("name")}
        </label>
        <label className={labelClass}>
          Mobile number
          <input name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" defaultValue={value("phone")} className={fieldClass} {...described("phone")} />
          {errorFor("phone")}
        </label>
        <label className={labelClass}>
          Email
          <input name="email" required type="email" autoComplete="email" defaultValue={value("email")} className={fieldClass} {...described("email")} />
          {errorFor("email")}
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          House number and street
          <input name="line1" required autoComplete="address-line1" maxLength={120} defaultValue={value("line1")} className={fieldClass} {...described("line1")} />
          {errorFor("line1")}
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Area or landmark (optional)
          <input name="line2" autoComplete="address-line2" maxLength={120} defaultValue={value("line2")} className={fieldClass} />
        </label>
        <label className={labelClass}>
          Town or city
          <input name="city" required autoComplete="address-level2" maxLength={60} defaultValue={value("city")} className={fieldClass} {...described("city")} />
          {errorFor("city")}
        </label>
        <label className={labelClass}>
          Pincode
          <input
            name="pincode"
            required
            inputMode="numeric"
            autoComplete="postal-code"
            pattern="[1-9][0-9]{5}"
            maxLength={6}
            defaultValue={value("pincode", defaultPincode)}
            className={fieldClass}
            {...described("pincode")}
          />
          {errorFor("pincode")}
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          State or union territory
          <select name="state" required autoComplete="address-level1" defaultValue={value("state")} className={fieldClass} {...described("state")}>
            <option value="" disabled>
              Choose…
            </option>
            {states.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          {errorFor("state")}
        </label>
      </fieldset>

      <fieldset key={`pay-${JSON.stringify(state.values ?? {})}`} className={`${cardClass} flex flex-col gap-3 p-5 sm:p-6`} {...described("paymentMethod")}>
        <legend className="sr-only">Payment</legend>
        <h2 className="font-display text-xl font-semibold">Payment</h2>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-accent">
          <input type="radio" name="paymentMethod" value="online" required defaultChecked={value("paymentMethod", "online") === "online"} className="mt-1" />
          <span>
            <span className="font-semibold">Pay online (UPI or card)</span>
            <span className="block text-sm text-muted">Test payments only: no money is taken.</span>
          </span>
        </label>
        <label
          className={`flex min-h-11 items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-accent ${codAllowed ? "cursor-pointer" : "opacity-60"}`}
        >
          <input type="radio" name="paymentMethod" value="cod" disabled={!codAllowed} defaultChecked={value("paymentMethod") === "cod"} className="mt-1" />
          <span>
            <span className="font-semibold">Cash on delivery</span>
            <span className="block text-sm text-muted">
              {codAllowed ? "Pay the courier when your order arrives." : `Available for orders up to ${codLimit}.`}
            </span>
          </span>
        </label>
        {errorFor("paymentMethod")}
      </fieldset>

      <button disabled={pending} className={`${buttonClass()} min-h-12 text-base`}>
        {pending ? "Placing your order…" : "Place order"}
      </button>
    </form>
  );
}
