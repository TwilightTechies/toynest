import { formatMoney, ProductStatusSchema } from "@toynest/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { Badge, buttonClass, cardClass, fieldClass, labelClass } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { statusLabel, statusTone } from "./status";

export const metadata: Metadata = { title: "Products · ToyNest admin" };

const PAGE_SIZE = 20;

// The query string is external input.
const ListParamsSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: ProductStatusSchema.optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

export default function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Products</h1>
        <Link href="/admin/products/new" className={`${buttonClass()} min-h-11`}>
          New product
        </Link>
      </div>
      <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading products…</p>}>
        <ProductList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ProductList({ searchParams }: Pick<PageProps<"/admin/products">, "searchParams">) {
  const { context } = await requireAdmin();
  const params = ListParamsSchema.parse(await searchParams);
  const [{ items, total }, categories] = await Promise.all([
    context.products.list({ text: params.q, status: params.status, categoryId: params.category, limit: PAGE_SIZE, offset: (params.page - 1) * PAGE_SIZE }),
    context.categories.list(),
  ]);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.status) query.set("status", params.status);
    if (params.category) query.set("category", params.category);
    if (page > 1) query.set("page", String(page));
    const text = query.toString();
    return `/admin/products${text ? `?${text}` : ""}`;
  };

  return (
    <>
      {/* A plain GET form: filters live in the URL, like the storefront (ADR-012). */}
      <form className="mt-6 flex flex-wrap items-end gap-3">
        <label className={`${labelClass} min-w-48 flex-1`}>
          Search by name
          <input name="q" type="search" defaultValue={params.q} className={fieldClass} />
        </label>
        <label className={labelClass}>
          Status
          <select name="status" defaultValue={params.status ?? ""} className={fieldClass}>
            <option value="">All</option>
            {ProductStatusSchema.options.map((status) => (
              <option key={status} value={status}>
                {statusLabel[status]}
              </option>
            ))}
          </select>
        </label>
        {params.category && <input type="hidden" name="category" value={params.category} />}
        <button className={`${buttonClass("secondary")} min-h-11`}>Filter</button>
      </form>

      <p className="mt-4 text-sm text-muted">
        {total} {total === 1 ? "product" : "products"}
      </p>
      {items.length === 0 ? (
        <p className="mt-6">No products match. Try another search or status.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((product) => (
            <li key={product.id}>
              <Link
                href={`/admin/products/${product.id}`}
                className={`${cardClass} flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:border-accent`}
              >
                {/* Phones: the name gets its own line; the details wrap underneath. */}
                <span className="w-full min-w-0 font-semibold sm:w-auto sm:flex-1">{product.name}</span>
                <span className="text-sm text-muted">{categoryName.get(product.categoryId) ?? "No category"}</span>
                <span className="text-sm tabular-nums">{formatMoney(product.priceMinor, product.currency)}</span>
                <Badge tone={statusTone(product.status)}>{statusLabel[product.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3 text-sm">
          {params.page > 1 && (
            <Link href={pageHref(params.page - 1)} className={buttonClass("secondary", "sm")} rel="prev">
              ← Previous
            </Link>
          )}
          <span className="text-muted">
            Page {params.page} of {pageCount}
          </span>
          {params.page < pageCount && (
            <Link href={pageHref(params.page + 1)} className={buttonClass("secondary", "sm")} rel="next">
              Next →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
