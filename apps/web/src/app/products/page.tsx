import type { Metadata } from "next";
import { listCatalog } from "@/lib/catalog";

export const metadata: Metadata = { title: "Products · ToyNest" };

export default async function ProductsPage() {
  const items = await listCatalog();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {items.length} products · synthetic sample catalogue
      </p>
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
    </main>
  );
}
