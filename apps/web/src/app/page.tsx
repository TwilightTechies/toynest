import Link from "next/link";
import { Suspense } from "react";
import { ProductGrid } from "@/components/product-card";
import { getHomeSections, UNDER_PRICE_MINOR, type CatalogItem } from "@/lib/catalog";

// Learning-project pages built during the certification sprint, kept reachable from the home page.
const demos = [
  {
    href: "/support",
    title: "Customer support",
    body: "Chat with the Claude support assistant as a demo customer: refunds, escalation, case facts. Needs an API key.",
  },
  {
    href: "/admin/drafts",
    title: "Admin · AI drafts",
    body: "A product draft waiting for review, with the facts the assistant refused to invent.",
  },
  {
    href: "/admin/drafts/new",
    title: "Admin · New AI draft",
    body: "Draft a listing with Claude, then check it with an independent reviewer. Needs an API key.",
  },
  {
    href: "/admin/mcp",
    title: "Admin · MCP explorer",
    body: "Call the ToyNest MCP server's tools and see results and structured errors.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <section className="rounded-2xl bg-amber-50 px-6 py-12 dark:bg-amber-950/40 sm:px-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Toys worth keeping.</h1>
        <p className="mt-3 max-w-xl text-zinc-700 dark:text-zinc-300">
          Wooden puzzles, personalised gifts and bright stationery for little hands.
        </p>
        <Link
          href="/products"
          className="mt-6 inline-block rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Shop all toys
        </Link>
      </section>

      <Suspense fallback={<p className="mt-10 text-sm text-zinc-500">Loading the shop…</p>}>
        <ShopSections />
      </Suspense>

      <section className="mt-16 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Project demos</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {demos.map((demo) => (
            <li key={demo.href}>
              <Link
                href={demo.href}
                className="block h-full rounded-lg border border-zinc-200 p-5 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <h3 className="font-medium">{demo.title}</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{demo.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

async function ShopSections() {
  const { categories, newArrivals, underTen } = await getHomeSections();
  const underLabel = `Under £${UNDER_PRICE_MINOR / 100}`;

  return (
    <>
      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Shop by category</h2>
        <ul className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/products?category=${category.slug}`}
                className="block rounded-lg border border-zinc-200 p-5 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <span className="font-medium">{category.name}</span>
                <span className="mt-1 block text-sm text-zinc-500">
                  {category.count} product{category.count === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Shelf title="New arrivals" href="/products?sort=newest" items={newArrivals} />
      <Shelf title={underLabel} href={`/products?max=${UNDER_PRICE_MINOR / 100}&sort=price-asc`} items={underTen} />
    </>
  );
}

function Shelf({ title, href, items }: { title: string; href: string; items: CatalogItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <Link href={href} className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          See all
        </Link>
      </div>
      <div className="mt-4">
        <ProductGrid items={items} />
      </div>
    </section>
  );
}
