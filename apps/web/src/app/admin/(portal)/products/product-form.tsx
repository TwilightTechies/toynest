"use client";

import { attributeLabel, STATUS_TRANSITIONS, type ProductStatus, type StatusAction } from "@toynest/core";
import { useActionState, useState } from "react";
import { buttonClass, cardClass, fieldClass, labelClass } from "@/components/ui";
import { changeStatus, saveProduct, type ProductFormState } from "./actions";
import { ATTRIBUTE_FIELD_PREFIX } from "./form-fields";

export interface CategoryOption {
  id: string;
  name: string;
  requiredAttributes: string[];
}

// What the form starts from: an existing product (prices already in rupees) or blanks.
export interface ProductFormValues {
  id?: string;
  version?: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  price: string;
  attributes: Record<string, string>;
}

const initialState: ProductFormState = { message: null, problems: [] };

function Feedback({ state }: { state: ProductFormState }) {
  if (!state.message) return null;
  return (
    <div role="alert" className="rounded-xl border border-accent bg-surface px-4 py-3 text-sm">
      <p className="font-semibold">{state.message}</p>
      {state.problems.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {state.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProductForm({ product, categories }: { product: ProductFormValues; categories: CategoryOption[] }) {
  const [state, action, pending] = useActionState(saveProduct, initialState);
  // A rejected save echoes the typed values back. Remounting the fields with them as defaults keeps
  // the admin's input after React's automatic form reset.
  const echo = state.values;
  return (
    <form action={action} className={`${cardClass} flex flex-col gap-5 p-5 sm:p-6`}>
      {product.id && <input type="hidden" name="id" value={product.id} />}
      {product.version && <input type="hidden" name="version" value={product.version} />}
      <Feedback state={state} />
      <Fields key={JSON.stringify(echo ?? {})} product={product} echo={echo} categories={categories} />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={`${buttonClass()} min-h-11`}>
          {pending ? "Saving…" : product.id ? "Save changes" : "Create draft"}
        </button>
        {!product.id && <p className="text-sm text-muted">New products start as drafts. Publish them once they&apos;re complete.</p>}
      </div>
    </form>
  );
}

function Fields({
  product,
  echo,
  categories,
}: {
  product: ProductFormValues;
  echo: Record<string, string> | undefined;
  categories: CategoryOption[];
}) {
  const value = (field: string, fallback: string) => echo?.[field] ?? fallback;
  const attribute = (key: string) => value(`${ATTRIBUTE_FIELD_PREFIX}${key}`, product.attributes[key] ?? "");

  const [categoryId, setCategoryId] = useState(value("categoryId", product.categoryId));
  const required = categories.find((category) => category.id === categoryId)?.requiredAttributes ?? [];
  // Attributes the product already has beyond its category's list (e.g. from an AI draft) stay editable.
  const extra = Object.keys(product.attributes).filter((key) => key !== "personalisation" && !required.includes(key));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>
          Name
          <input name="name" required maxLength={120} defaultValue={value("name", product.name)} className={fieldClass} />
        </label>
        <label className={labelClass}>
          Web address (slug)
          <input
            name="slug"
            maxLength={80}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="Made from the name if empty"
            defaultValue={value("slug", product.slug)}
            className={`${fieldClass} font-mono`}
          />
        </label>
        <label className={labelClass}>
          Price (₹)
          <input
            name="price"
            required
            inputMode="decimal"
            placeholder="599"
            defaultValue={value("price", product.price)}
            className={fieldClass}
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Category
          {/* Uncontrolled (defaultValue) on purpose: React resets the form after each action, and a
              controlled select without a default would be reset to the first category. The state
              only drives which attribute fields are shown. */}
          <select
            name="categoryId"
            required
            defaultValue={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className={fieldClass}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Description
          <textarea name="description" rows={5} maxLength={5000} defaultValue={value("description", product.description)} className={fieldClass} />
        </label>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-display text-lg font-semibold">Details</legend>
        {required.map((key) => (
          <label key={key} className={labelClass}>
            {attributeLabel(key)} (needed to publish)
            <input name={`${ATTRIBUTE_FIELD_PREFIX}${key}`} maxLength={100} defaultValue={attribute(key)} className={fieldClass} />
          </label>
        ))}
        {extra.map((key) => (
          <label key={key} className={labelClass}>
            {attributeLabel(key)}
            <input name={`${ATTRIBUTE_FIELD_PREFIX}${key}`} maxLength={100} defaultValue={attribute(key)} className={fieldClass} />
          </label>
        ))}
        <label className={labelClass}>
          Personalisation
          <select
            name="personalisation"
            defaultValue={value("personalisation", product.attributes.personalisation ?? "")}
            className={fieldClass}
          >
            <option value="">None</option>
            <option value="name">Shopper adds a name</option>
          </select>
        </label>
      </fieldset>
    </>
  );
}

const actionLabels: Record<StatusAction, string> = {
  publish: "Publish",
  unpublish: "Move back to draft",
  archive: "Archive",
  restore: "Restore as draft",
};

// Status changes are their own small form: they never save unsaved edits from the main form.
export function StatusControls({ id, version, status }: { id: string; version: string; status: ProductStatus }) {
  const [state, action, pending] = useActionState(changeStatus, initialState);
  const available = (Object.keys(STATUS_TRANSITIONS) as StatusAction[]).filter((key) =>
    STATUS_TRANSITIONS[key].from.includes(status),
  );
  return (
    <form action={action} className={`${cardClass} flex flex-col gap-3 p-5`}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <h2 className="font-display text-lg font-semibold">Status</h2>
      <Feedback state={state} />
      <div className="flex flex-wrap gap-2">
        {available.map((key) => (
          <button
            key={key}
            name="action"
            value={key}
            disabled={pending}
            className={`${buttonClass(key === "publish" ? "primary" : "secondary", "sm")} min-h-11`}
          >
            {actionLabels[key]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">Save your edits first: status buttons don&apos;t save changes in the form above.</p>
    </form>
  );
}
