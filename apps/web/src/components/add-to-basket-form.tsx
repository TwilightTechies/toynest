"use client";

import { MAX_LINE_QUANTITY } from "@toynest/core";
import { useActionState } from "react";
import { addToBasket, type AddToBasketState } from "@/app/basket/actions";
import { buttonClass, fieldClass, labelClass } from "./ui";

const initial: AddToBasketState = { error: null, field: null };

// A form posting to a server action: it works before (and without) client JS. useActionState only
// adds inline errors and a pending state. On success the action redirects to the basket.
export function AddToBasketForm({ slug, personalisable }: { slug: string; personalisable: boolean }) {
  const [state, action, pending] = useActionState(addToBasket, initial);

  return (
    <form action={action} className="mt-6 flex flex-col gap-4" noValidate>
      <input type="hidden" name="slug" value={slug} />
      {personalisable && (
        <label className={labelClass}>
          Name to engrave
          <input
            name="personalisationName"
            maxLength={20}
            required
            autoComplete="off"
            placeholder="e.g. Aarav"
            aria-invalid={state.field === "name"}
            aria-describedby="name-help"
            className={`${fieldClass} normal-case tracking-normal ${state.field === "name" ? "border-accent" : ""}`}
          />
          <span id="name-help" className="font-normal normal-case tracking-normal">
            Up to 20 letters; spaces, apostrophes and hyphens are fine.
          </span>
        </label>
      )}
      <div className="flex items-end gap-3">
        <label className={`w-24 ${labelClass}`}>
          Quantity
          <select name="quantity" defaultValue="1" className={fieldClass}>
            {Array.from({ length: MAX_LINE_QUANTITY }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className={`flex-1 sm:flex-none ${buttonClass("primary")}`}>
          {pending ? "Adding…" : "Add to basket"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-accent">
          {state.error}
        </p>
      )}
    </form>
  );
}
