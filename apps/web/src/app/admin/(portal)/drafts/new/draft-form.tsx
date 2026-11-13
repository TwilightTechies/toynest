"use client";

import { useActionState } from "react";
import type { ProductDraftOutcome, ReviewFinding } from "@toynest/ai";
import { runDraft, saveDraftAsProduct, type DraftRunState } from "./actions";

// Below this, a finding is routed for a second look rather than shown as settled.
const LOW_CONFIDENCE = 0.7;

const severityStyle: Record<ReviewFinding["severity"], string> = {
  critical: "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100",
  major: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  minor: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
};

export function DraftForm() {
  const [state, action, pending] = useActionState<DraftRunState, FormData>(runDraft, { status: "idle" });

  return (
    <>
      <form action={action} className="mt-6 grid gap-3">
        <label className="grid gap-1 text-sm">
          Product name
          <input
            name="name"
            required
            maxLength={120}
            defaultValue="Wooden Alphabet Puzzle"
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Details
          <textarea
            name="details"
            required
            maxLength={2000}
            rows={3}
            defaultValue="Age group: 3-6. Material: wood. Colourful wooden alphabet puzzle."
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </label>
        <button
          disabled={pending}
          className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Drafting and reviewing… (up to a minute)" : "Draft with Claude"}
        </button>
      </form>

      {state.status === "error" && <p className="mt-6 text-sm text-red-600">{state.message}</p>}

      {state.status === "done" && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
            <h2 className="font-medium">Writer</h2>
            {state.draft.status === "needs_review" ? (
              <>
                <p className="mt-1 text-xs text-zinc-500">
                  Needs review · {state.draft.draft.categorySlug} · {state.draft.modelCalls} model calls
                </p>
                <h3 className="mt-3 text-lg font-semibold">{state.draft.draft.title}</h3>
                <p className="mt-2 text-sm">{state.draft.draft.description}</p>
                <p className="mt-3 text-xs text-zinc-500">Tags: {state.draft.draft.tags.join(", ")}</p>
                <SaveAsProduct draft={state.draft} />
                {state.draft.draft.missingInformation.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {state.draft.draft.missingInformation.map((gap) => (
                      <li key={gap.field}>
                        <span className="font-mono">{gap.field}</span> · {gap.note}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-red-600">{state.draft.reason}</p>
            )}
          </section>

          <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
            <h2 className="font-medium">Independent reviewer</h2>
            {!state.review && <p className="mt-2 text-sm text-zinc-500">No draft to review.</p>}
            {state.review?.status === "failed" && <p className="mt-2 text-sm text-red-600">{state.review.reason}</p>}
            {state.review?.status === "reviewed" && (
              <>
                <p className="mt-1 text-xs text-zinc-500">{state.review.modelCalls} model calls</p>
                <p className="mt-3 text-sm">{state.review.review.summary}</p>
                {state.review.review.findings.length === 0 ? (
                  <p className="mt-3 text-sm text-green-700 dark:text-green-400">No findings.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {state.review.review.findings.map((finding) => (
                      <li key={finding.quote} className="text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityStyle[finding.severity]}`}>
                            {finding.severity}
                          </span>
                          <span className="font-mono text-xs">{finding.category}</span>
                          <span className="text-xs text-zinc-500">
                            confidence {finding.confidence.toFixed(2)}
                            {finding.confidence < LOW_CONFIDENCE && " · second look"}
                          </span>
                        </div>
                        <p className="mt-1">&ldquo;{finding.quote}&rdquo;</p>
                        <p className="text-zinc-600 dark:text-zinc-400">{finding.explanation}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

// Creates a draft product from the writer's output. Publishing stays a separate, human step.
function SaveAsProduct({ draft }: { draft: Extract<ProductDraftOutcome, { status: "needs_review" }> }) {
  const [state, action, pending] = useActionState(saveDraftAsProduct, { error: null });
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="draft" value={JSON.stringify(draft.draft)} />
      <button
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Saving…" : "Save as draft product"}
      </button>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
