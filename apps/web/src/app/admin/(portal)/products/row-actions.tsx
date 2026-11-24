"use client";

import { useActionState, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";
import { changeStatus, deleteProduct, type ProductFormState } from "./actions";

const initialState: ProductFormState = { message: null, problems: [] };

// Per-row action on the admin product list (ADR-023). A never-ordered product can be deleted, after
// an inline confirmation (no browser confirm(): it blocks the page and can't be styled or tested); an
// ordered one can only be archived, which keeps its order history and Best-sellers ranking.
export function RowActions({
  id,
  version,
  name,
  mode,
}: {
  id: string;
  version: string;
  name: string;
  mode: "delete" | "archive";
}) {
  return mode === "delete" ? <DeleteAction id={id} version={version} name={name} /> : <ArchiveAction id={id} version={version} />;
}

function Problem({ state }: { state: ProductFormState }) {
  if (!state.message) return null;
  return (
    <p role="alert" className="w-full text-sm font-semibold text-accent">
      {state.message}
    </p>
  );
}

function DeleteAction({ id, version, name }: { id: string; version: string; name: string }) {
  const [state, action, pending] = useActionState(deleteProduct, initialState);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirming(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirming]);

  if (!confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setConfirming(true)} className={`${buttonClass("secondary", "sm")} pointer-coarse:min-h-11`}>
          Delete
        </button>
        <Problem state={state} />
      </div>
    );
  }
  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <span className="w-full text-sm font-semibold sm:w-auto">
        Delete “{name}”? This can&apos;t be undone.
      </span>
      <button disabled={pending} className={`${buttonClass("primary", "sm")} pointer-coarse:min-h-11`}>
        {pending ? "Deleting…" : "Delete"}
      </button>
      <button
        type="button"
        autoFocus
        disabled={pending}
        onClick={() => setConfirming(false)}
        className={`${buttonClass("secondary", "sm")} pointer-coarse:min-h-11`}
      >
        Cancel
      </button>
      <Problem state={state} />
    </form>
  );
}

function ArchiveAction({ id, version }: { id: string; version: string }) {
  const [state, action, pending] = useActionState(changeStatus, initialState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="returnTo" value="list" />
      <button
        name="action"
        value="archive"
        disabled={pending}
        title="This product has orders, so it can't be deleted"
        className={`${buttonClass("secondary", "sm")} pointer-coarse:min-h-11`}
      >
        {pending ? "Archiving…" : "Archive"}
      </button>
      <Problem state={state} />
    </form>
  );
}
