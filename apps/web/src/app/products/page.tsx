import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatPounds, parseCatalogParams, type CatalogParams, type ProductSort } from "@toynest/core";
import { Pagination } from "@/components/pagination";
import { ProductGrid } from "@/components/product-card";
import { listCatalog, type CatalogPage } from "@/lib/catalog";

export const metadata: Metadata = { title: "Shop · ToyNest" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const sortOptions: { value: ProductSort; label: string }[] = [
  { value: "relevance", label: "Best match" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
];

const fieldClass = "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export default function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading products…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  // The query string is an external boundary: validated in core; bad values fall back to defaults.
  const params = parseCatalogParams(await searchParams);
  const page = await listCatalog(params);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{page.category?.name ?? "All products"}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <span>{summary(page)}</span>
        <span
          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          title={page.source === "supabase" ? "Read from the Supabase database" : "Read from data/*.json (Supabase not configured)"}
        >
          Data: {page.source === "supabase" ? "Supabase" : "Sample file"}
        </span>
      </p>

      <Filters params={params} page={page} />

      {page.items.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
          No products match these filters.{" "}
          <Link href="/products" className="underline">
            Clear filters
          </Link>
        </p>
      ) : (
        <div className="mt-8">
          <ProductGrid items={page.items} />
        </div>
      )}

      <Pagination params={params} pageCount={page.pageCount} />
    </>
  );
}

function summary({ total, params, pageCount }: CatalogPage): string {
  const count = `${total} product${total === 1 ? "" : "s"}`;
  const matching = params.text ? ` matching “${params.text}”` : "";
  const pageInfo = pageCount > 1 ? ` · page ${Math.min(params.page, pageCount)} of ${pageCount}` : "";
  return `${count}${matching}${pageInfo}`;
}

// A plain GET form: submitting it builds the URL, so filters are shareable and need no client JS.
// It has no page field, so changing a filter starts again at page 1.
function Filters({ params, page }: { params: CatalogParams; page: CatalogPage }) {
  return (
    <form role="search" action="/products" className="mt-6 flex flex-wrap items-end gap-3">
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Search
        <input
          name="q"
          type="search"
          defaultValue={params.text}
          placeholder='Try "wood" or "puzzles"'
          maxLength={100}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Category
        <select name="category" defaultValue={page.category?.slug ?? ""} className={fieldClass}>
          <option value="">All categories</option>
          {page.categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name} ({category.count})
            </option>
          ))}
        </select>
      </label>
      <label className="flex w-24 flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Min £
        <input
          name="min"
          inputMode="decimal"
          pattern="\d{1,5}(\.\d{1,2})?"
          defaultValue={params.minPriceMinor === undefined ? "" : formatPounds(params.minPriceMinor)}
          className={fieldClass}
        />
      </label>
      <label className="flex w-24 flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Max £
        <input
          name="max"
          inputMode="decimal"
          pattern="\d{1,5}(\.\d{1,2})?"
          defaultValue={params.maxPriceMinor === undefined ? "" : formatPounds(params.maxPriceMinor)}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Sort
        <select name="sort" defaultValue={params.sort} className={fieldClass}>
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Apply
      </button>
    </form>
  );
}
