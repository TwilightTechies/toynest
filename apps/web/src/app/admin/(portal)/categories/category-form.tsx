"use client";

import { useActionState } from "react";
import { buttonClass, cardClass, fieldClass, labelClass } from "@/components/ui";
import { deleteCategory, saveCategory, setCategoryVisible, type CategoryFormState } from "./actions";

export interface CategoryFormValues {
  id?: string;
  version?: string;
  name: string;
  slug: string;
  menuLabel: string;
  // Labels, comma separated ("Material, Size").
  requiredAttributes: string;
}

const initial: CategoryFormState = { message: null, problems: [] };

function Feedback({ state }: { state: CategoryFormState }) {
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

export function CategoryForm({ category }: { category: CategoryFormValues }) {
  const [state, action, pending] = useActionState(saveCategory, initial);
  const value = (field: keyof CategoryFormValues) => state.values?.[field] ?? category[field] ?? "";
  return (
    <form action={action} className={`${cardClass} flex flex-col gap-5 p-5 sm:p-6`}>
      {category.id && <input type="hidden" name="id" value={category.id} />}
      {category.version && <input type="hidden" name="version" value={category.version} />}
      <Feedback state={state} />
      {/* key: remount with the echoed values after a rejected save (React resets forms after actions). */}
      <div key={JSON.stringify(state.values ?? {})} className="grid gap-4 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>
          Name
          <input name="name" required maxLength={60} defaultValue={value("name")} className={fieldClass} />
        </label>
        <label className={labelClass}>
          Web address (slug)
          {category.id ? (
            <>
              <input value={category.slug} readOnly aria-describedby="slug-note" className={`${fieldClass} font-mono opacity-70`} />
              <span id="slug-note" className="normal-case tracking-normal">
                Fixed: it&apos;s in shop links and bookmarks.
              </span>
            </>
          ) : (
            <input
              name="slug"
              maxLength={60}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="Made from the name if empty"
              defaultValue={value("slug")}
              className={`${fieldClass} font-mono`}
            />
          )}
        </label>
        <label className={labelClass}>
          Menu label (optional)
          <input name="menuLabel" maxLength={30} placeholder="e.g. Christmas" defaultValue={value("menuLabel")} className={fieldClass} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Details every product needs before it can be published
          <input
            name="requiredAttributes"
            placeholder="e.g. Material, Size"
            defaultValue={value("requiredAttributes")}
            className={fieldClass}
          />
          <span className="normal-case tracking-normal">Separate with commas. Up to 10.</span>
        </label>
      </div>
      <button disabled={pending} className={`${buttonClass()} min-h-11 w-fit`}>
        {pending ? "Saving…" : category.id ? "Save changes" : "Create category"}
      </button>
    </form>
  );
}

// Show/hide and delete: separate small forms, so they never save unsaved edits above.
export function CategoryControls({
  id,
  version,
  visible,
  productCount,
}: {
  id: string;
  version: string;
  visible: boolean;
  productCount: number;
}) {
  const [visibleState, visibleAction, visiblePending] = useActionState(setCategoryVisible, initial);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteCategory, initial);
  return (
    <div className={`${cardClass} flex flex-col gap-4 p-5`}>
      <h2 className="font-display text-lg font-semibold">In the shop</h2>
      <Feedback state={visibleState} />
      <form action={visibleAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="visible" value={visible ? "false" : "true"} />
        <p className="text-sm">
          {visible
            ? "Shown: it's in the menu and its live products are for sale."
            : "Hidden: it's out of the menu, and its products can't be found or bought. Their status, photos and prices are kept."}
        </p>
        <button disabled={visiblePending} className={`${buttonClass(visible ? "secondary" : "primary", "sm")} min-h-11 w-fit`}>
          {visible ? "Hide from shop" : "Show in shop"}
        </button>
      </form>

      <form action={deleteAction} className="flex flex-col gap-2 border-t border-border pt-4">
        <input type="hidden" name="id" value={id} />
        <Feedback state={deleteState} />
        <p className="text-sm text-muted">
          {productCount > 0
            ? `${productCount} ${productCount === 1 ? "product uses" : "products use"} this category, so it can't be deleted. Hide it instead.`
            : "No products use this category, so it can be deleted."}
        </p>
        <button disabled={deletePending || productCount > 0} className={`${buttonClass("ghost", "sm")} min-h-11 w-fit`}>
          Delete category
        </button>
      </form>
    </div>
  );
}
