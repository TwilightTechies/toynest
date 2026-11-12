import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatMajorUnits, parseCatalogParams, type CatalogParams, type ProductSort } from "@toynest/core";
import { FilterPanel } from "@/components/filter-panel";
import { Pagination } from "@/components/pagination";
import { ProductGrid } from "@/components/product-card";
import { Badge, buttonClass, fieldClass, labelClass } from "@/components/ui";
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


export default function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <Suspense fallback={<p className="text-sm text-muted">Loading products…</p>}>
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
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {page.category?.name ?? "All products"}
      </h1>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{summary(page)}</span>
        <span title={page.source === "supabase" ? "Read from the Supabase database" : "Read from data/*.json (Supabase not configured)"}>
          <Badge tone="neutral">Data: {page.source === "supabase" ? "Supabase" : "Sample file"}</Badge>
        </span>
      </p>

      <FilterPanel activeCount={activeFilterCount(params)}>
        <Filters params={params} page={page} />
      </FilterPanel>

      {page.items.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-surface px-6 py-12 text-center">
          <p className="font-display text-xl font-semibold">No products match these filters</p>
          <p className="mt-2 text-sm text-muted">Try a wider price range or another category.</p>
          <Link href="/products" className={`mt-5 ${buttonClass("secondary", "sm")}`}>
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <ProductGrid items={page.items} />
        </div>
      )}

      <Pagination params={params} pageCount={page.pageCount} />
    </>
  );
}

function activeFilterCount(params: CatalogParams): number {
  return [params.text, params.categorySlug, params.minPriceMinor, params.maxPriceMinor].filter(
    (value) => value !== undefined && value !== "",
  ).length + (params.sort === "relevance" ? 0 : 1);
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
    <form
      role="search"
      action="/products"
      className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-surface-raised p-4 md:grid-cols-[minmax(12rem,1fr)_auto_6rem_6rem_auto_auto] md:items-end"
    >
      <label className={`col-span-2 md:col-span-1 ${labelClass}`}>
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
      <label className={`col-span-2 md:col-span-1 ${labelClass}`}>
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
      <label className={labelClass}>
        Min ₹
        <input
          name="min"
          inputMode="decimal"
          pattern="\d{1,7}(\.\d{1,2})?"
          defaultValue={params.minPriceMinor === undefined ? "" : formatMajorUnits(params.minPriceMinor)}
          className={fieldClass}
        />
      </label>
      <label className={labelClass}>
        Max ₹
        <input
          name="max"
          inputMode="decimal"
          pattern="\d{1,7}(\.\d{1,2})?"
          defaultValue={params.maxPriceMinor === undefined ? "" : formatMajorUnits(params.maxPriceMinor)}
          className={fieldClass}
        />
      </label>
      <label className={`col-span-2 md:col-span-1 ${labelClass}`}>
        Sort
        <select name="sort" defaultValue={params.sort} className={fieldClass}>
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={`col-span-2 md:col-span-1 ${buttonClass("primary")}`}>
        Apply
      </button>
    </form>
  );
}
