import type { Metadata } from "next";
import Link from "next/link";
import { getSampleDraft } from "@/lib/drafts";

export const metadata: Metadata = { title: "AI drafts · ToyNest admin" };

export default async function DraftsPage() {
  const { brief, outcome } = await getSampleDraft();
  const { draft } = outcome;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      {/* No auth yet: this page must not be deployed until admin login exists. */}
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Local development only · no admin login yet · example draft, not a live model call
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{draft.title}</h1>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">
          Needs review
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Category: {draft.categorySlug} · {outcome.modelCalls} model calls
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-zinc-500">Brief from the admin</h2>
        <p className="mt-1 text-sm">
          <strong>{brief.name}</strong>: {brief.details}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-zinc-500">Draft description</h2>
        <p className="mt-1">{draft.description}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {draft.tags.map((tag) => (
            <li key={tag} className="rounded bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
              {tag}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-zinc-500">Attributes</h2>
        <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          {draft.attributes.map((attribute) => (
            <div key={attribute.name} className="contents">
              <dt className="text-zinc-500">{attribute.name}</dt>
              <dd>{attribute.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6 rounded-lg border border-red-200 p-4 dark:border-red-900">
        <h2 className="font-medium">Missing information ({draft.missingInformation.length})</h2>
        <p className="text-sm text-zinc-500">The assistant listed these instead of inventing values.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {draft.missingInformation.map((item) => (
            <li key={item.field}>
              <span className="font-mono">{item.field}</span> · {item.note}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-zinc-500">Similar products (found by a tool)</h2>
        <ul className="mt-1 space-y-1 text-sm">
          {draft.similarProducts.map((similar) => (
            <li key={similar.slug}>
              <Link href="/products" className="font-mono underline">
                {similar.slug}
              </Link>{" "}
              · {similar.reason}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 flex gap-3">
        {/* Approval needs admin auth and the database; until then the buttons are disabled on purpose. */}
        <button disabled className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white opacity-40 dark:bg-zinc-100 dark:text-zinc-900">
          Approve
        </button>
        <button disabled className="rounded-md border border-zinc-300 px-4 py-2 text-sm opacity-40 dark:border-zinc-700">
          Request changes
        </button>
      </div>
    </main>
  );
}
