import Link from "next/link";
import { catalogSearchString, type CatalogParams } from "@toynest/core";

// Plain links that keep the other filters: the page works without client JS and every page has a URL.
export function Pagination({ params, pageCount }: { params: CatalogParams; pageCount: number }) {
  if (pageCount <= 1) return null;
  const href = (page: number) => `/products${catalogSearchString(params, { page })}`;
  const linkClass = "rounded-md border border-zinc-300 px-3 py-1.5 hover:border-zinc-500 dark:border-zinc-700";

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center gap-2 text-sm">
      {params.page > 1 && (
        <Link href={href(params.page - 1)} className={linkClass} rel="prev">
          Previous
        </Link>
      )}
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) =>
        page === params.page ? (
          <span key={page} aria-current="page" className="rounded-md bg-zinc-900 px-3 py-1.5 text-white dark:bg-zinc-100 dark:text-zinc-900">
            {page}
          </span>
        ) : (
          <Link key={page} href={href(page)} className={linkClass}>
            {page}
          </Link>
        ),
      )}
      {params.page < pageCount && (
        <Link href={href(params.page + 1)} className={linkClass} rel="next">
          Next
        </Link>
      )}
    </nav>
  );
}
