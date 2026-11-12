import Link from "next/link";
import type { CatalogItem } from "@/lib/catalog";

export function ProductCard({ item }: { item: CatalogItem }) {
  return (
    <li className="relative flex flex-col rounded-lg border border-zinc-200 p-5 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{item.categoryName}</span>
      <h3 className="mt-1 font-medium">
        {/* The ::after overlay makes the whole card clickable while keeping one link per card. */}
        <Link href={`/products/${item.slug}`} className="after:absolute after:inset-0">
          {item.name}
        </Link>
      </h3>
      <p className="mt-2 flex-1 text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
      <p className="mt-4 font-semibold tabular-nums">{item.price}</p>
    </li>
  );
}

export function ProductGrid({ items }: { items: CatalogItem[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <ProductCard key={item.slug} item={item} />
      ))}
    </ul>
  );
}
