"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { buttonClass, cardClass, fieldClass, labelClass } from "@/components/ui";
import { placeOrder, type CheckoutFormState } from "./actions";

const WHATSAPP_STORE_NUMBER = "919884246030";
const initial: CheckoutFormState = { message: null, fieldErrors: {} };

function buildWhatsAppUrl(name: string, phone: string, city: string, state: string, pincode: string): string {
  const digits = phone.replace(/\D/g, "");
  const formattedPhone = `+91${digits.slice(-10)}`;
  const message =
    `Hello ToyNest! 🛍️\n\n` +
    `I'd like to confirm my order:\n\n` +
    `Name: ${name}\n` +
    `Mobile: ${formattedPhone}\n` +
    `Delivery to: ${city}, ${state} – ${pincode}\n` +
    `Payment: Cash on Delivery\n\n` +
    `Please confirm my order. Thank you! 🙏`;
  return `https://web.whatsapp.com/send?phone=${WHATSAPP_STORE_NUMBER}&text=${encodeURIComponent(message)}`;
}

export function CheckoutForm({
  checkoutToken,
  defaults,
  defaultPincode,
  states,
}: {
  checkoutToken: string;
  defaults: { name: string; email: string; phone: string };
  defaultPincode: string;
  states: string[];
  codAllowed: boolean; // kept for API compatibility; COD is now always the only method
  codLimit: string;    // kept for API compatibility; unused
}) {
  const [state, action, pending] = useActionState(placeOrder, initial);
  const [showConfirm, setShowConfirm] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const value = (key: string, fallback = "") => state.values?.[key] ?? fallback;
  const error = (key: string) => state.fieldErrors[key];
  const described = (key: string) => (error(key) ? { "aria-invalid": true as const, "aria-describedby": `${key}-error` } : {});
  const errorFor = (field: string) =>
    error(field) ? (
      <span id={`${field}-error`} className="normal-case tracking-normal text-accent">
        {error(field)}
      </span>
    ) : null;

  // Focus the confirm button when the dialog opens.
  useEffect(() => {
    if (showConfirm) confirmBtnRef.current?.focus();
  }, [showConfirm]);

  // Close on Escape.
  useEffect(() => {
    if (!showConfirm) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setShowConfirm(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showConfirm]);

  function handlePlaceOrderClick() {
    if (!formRef.current?.reportValidity()) return;
    setShowConfirm(true);
  }

  function handleConfirm() {
    const form = formRef.current;
    if (!form) return;

    const name    = (form.elements.namedItem("name")    as HTMLInputElement)?.value  ?? "";
    const phone   = (form.elements.namedItem("phone")   as HTMLInputElement)?.value  ?? "";
    const city    = (form.elements.namedItem("city")    as HTMLInputElement)?.value  ?? "";
    const stateVal = (form.elements.namedItem("state") as HTMLSelectElement)?.value ?? "";
    const pincode = (form.elements.namedItem("pincode") as HTMLInputElement)?.value  ?? "";

    window.open(buildWhatsAppUrl(name, phone, city, stateVal, pincode), "_blank", "noopener,noreferrer");

    setShowConfirm(false);
    const formData = new FormData(form);
    startTransition(() => { action(formData); });
  }

  return (
    <>
      {/* The form has no action= prop; we call action(formData) manually after WhatsApp is opened. */}
      <form ref={formRef} className="flex flex-col gap-6">
        <input type="hidden" name="checkoutToken" value={checkoutToken} />
        {/* Payment method is always COD; no gateway. */}
        <input type="hidden" name="paymentMethod" value="cod" />

        {state.message && (
          <p role="alert" className="rounded-xl border border-accent bg-surface px-4 py-3 text-sm font-semibold">
            {state.message}
          </p>
        )}

        <fieldset key={JSON.stringify(state.values ?? {})} className={`${cardClass} grid gap-4 p-5 sm:grid-cols-2 sm:p-6`}>
          <legend className="sr-only">Delivery details</legend>
          <h2 className="font-display text-xl font-semibold sm:col-span-2">Delivery details</h2>
          <label className={`${labelClass} sm:col-span-2`}>
            Full name
            <input name="name" required autoComplete="name" maxLength={80} defaultValue={value("name", defaults.name)} className={fieldClass} {...described("name")} />
            {errorFor("name")}
          </label>
          <label className={labelClass}>
            Mobile number
            <input name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" defaultValue={value("phone", defaults.phone)} className={fieldClass} {...described("phone")} />
            {errorFor("phone")}
          </label>
          <label className={labelClass}>
            Email
            <input name="email" required type="email" autoComplete="email" defaultValue={value("email", defaults.email)} className={fieldClass} {...described("email")} />
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

        <div className={`${cardClass} flex flex-col gap-3 p-5 sm:p-6`}>
          <h2 className="font-display text-xl font-semibold">Payment</h2>
          <div className="flex min-h-11 items-start gap-3 rounded-xl border border-accent bg-surface p-3">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-accent" aria-hidden="true">
              <span className="h-2 w-2 rounded-full bg-accent" />
            </span>
            <span>
              <span className="font-semibold">Cash on delivery</span>
              <span className="block text-sm text-muted">Pay the courier when your order arrives.</span>
            </span>
          </div>
          {errorFor("paymentMethod")}
        </div>

        <button
          type="button"
          onClick={handlePlaceOrderClick}
          disabled={pending}
          className={`${buttonClass()} min-h-12 text-base`}
        >
          {pending ? "Placing your order…" : "Place order"}
        </button>
      </form>

      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}
        >
          <div className={`${cardClass} w-full max-w-sm p-6`}>
            <h2 id="confirm-dialog-title" className="font-display text-xl font-semibold">
              Confirm your order?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Your order will be placed and you&apos;ll be taken to WhatsApp to confirm with us. You&apos;ll pay cash when it&apos;s delivered.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                ref={confirmBtnRef}
                onClick={handleConfirm}
                className={`${buttonClass()} min-h-11 flex-1`}
              >
                Yes, place my order
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className={`${buttonClass("secondary")} min-h-11 flex-1`}
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
