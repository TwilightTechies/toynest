import type { Metadata } from "next";
import { DraftForm } from "./draft-form";

export const metadata: Metadata = { title: "New AI draft · ToyNest admin" };

export default function NewDraftPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12">
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Local development only · no admin login yet · each run makes live Claude API calls (a few tens of pence)
      </p>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">New AI draft</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        The writer drafts the listing; an independent reviewer then checks it against your brief.
      </p>
      <DraftForm />
    </main>
  );
}
