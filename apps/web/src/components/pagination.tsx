import Link from "next/link";
import { catalogSearchString, type CatalogParams } from "@toynest/core";
import { buttonClass } from "./ui";

// Plain links that keep the other filters: the page works without client JS and every page has a URL.
export function Pagination({ params, pageCount }: { params: CatalogParams; pageCount: number }) {
  if (pageCount <= 1) return null;
  const href = (page: number) => `/products${catalogSearchString(params, { page })}`;
  const numberClass = "flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-semibold";

  return (
    <nav aria-label="Pagination" className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {params.page > 1 && (
        <Link href={href(params.page - 1)} className={buttonClass("secondary", "sm")} rel="prev">
          ← Previous
        </Link>
      )}
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) =>
        page === params.page ? (
          <span key={page} aria-current="page" className={`${numberClass} bg-accent text-accent-foreground`}>
            {page}
          </span>
        ) : (
          <Link key={page} href={href(page)} className={`${numberClass} hover:bg-surface hover:text-accent`}>
            {page}
          </Link>
        ),
      )}
      {params.page < pageCount && (
        <Link href={href(params.page + 1)} className={buttonClass("secondary", "sm")} rel="next">
          Next →
        </Link>
      )}
    </nav>
  );
}
