import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { listCatalog } from "@/lib/catalog";

export const metadata: Metadata = { title: "Products · ToyNest" };

// The query string is an external boundary: one bounded string, anything else is ignored.
const QuerySchema = z.object({ q: z.string().trim().max(100).catch("") }).catch({ q: "" });

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-zinc-500">Loading products…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const { q } = QuerySchema.parse(await searchParams);
  const { source, items, total } = await listCatalog(q);

  return (
    <>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <span>
          {q ? `${total} result${total === 1 ? "" : "s"} for “${q}”` : `${total} products`}
        </span>
        <span
          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          title={source === "supabase" ? "Read from the Supabase database" : "Read from data/*.json (Supabase not configured)"}
        >
          Data: {source === "supabase" ? "Supabase" : "Sample file"}
        </span>
      </p>

      <form role="search" className="mt-6 flex max-w-md gap-2" action="/products">
        <label htmlFor="q" className="sr-only">
          Search products
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder='Try "wood" or "puzzles"'
          maxLength={100}
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Search
        </button>
      </form>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">No products match “{q}”.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.slug} className="flex flex-col rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
              <span className="text-xs uppercase tracking-wide text-zinc-500">{item.categoryName}</span>
              <h2 className="mt-1 font-medium">{item.name}</h2>
              <p className="mt-2 flex-1 text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
              <p className="mt-4 font-semibold tabular-nums">{item.price}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
