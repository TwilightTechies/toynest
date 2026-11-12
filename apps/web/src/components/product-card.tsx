import Link from "next/link";
import type { CatalogItem } from "@/lib/catalog";
import { ProductImage } from "./product-image";

export function ProductCard({ item }: { item: CatalogItem }) {
  return (
    <li className="group relative flex flex-col rounded-2xl border border-border bg-surface-raised p-3 transition-shadow hover:shadow-md">
      <ProductImage categorySlug={item.categorySlug} />
      <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{item.categoryName}</span>
        <h3 className="mt-1 font-display text-lg font-semibold leading-snug">
          {/* The ::after overlay makes the whole card clickable while keeping one link per card. */}
          <Link href={`/products/${item.slug}`} className="after:absolute after:inset-0 group-hover:text-accent">
            {item.name}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted">{item.description}</p>
        <p className="mt-3 text-lg font-bold tabular-nums">{item.price}</p>
      </div>
    </li>
  );
}

// Two columns even on phones: product grids are scanned, and one card per screen means endless scrolling.
// "listing" tops out at 3 columns so a page of CATALOG_PAGE_SIZE (6) fills whole rows; home shelves
// show 4 items, so they go to 4.
export function ProductGrid({ items, layout = "listing" }: { items: CatalogItem[]; layout?: "listing" | "shelf" }) {
  const columns = layout === "shelf" ? "lg:grid-cols-4" : "lg:grid-cols-3";
  return (
    <ul className={`grid grid-cols-2 gap-3 sm:gap-5 ${columns}`}>
      {items.map((item) => (
        <ProductCard key={item.slug} item={item} />
      ))}
    </ul>
  );
}
