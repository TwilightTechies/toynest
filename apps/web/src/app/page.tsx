import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/logo";
import { ProductGrid } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { buttonClass, cardClass, SectionHeading } from "@/components/ui";
import { formatMoney } from "@toynest/core";
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
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
      <section className="relative overflow-hidden rounded-3xl bg-surface px-6 py-12 sm:px-12 sm:py-16">
        <div className="relative z-10 max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-strong">Made to be played with</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Toys worth keeping.
          </h1>
          <p className="mt-4 text-lg text-muted">
            Wooden puzzles, personalised gifts and bright stationery for little hands.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/products" className={buttonClass("primary")}>
              Shop all toys
            </Link>
            <Link href="/products?category=personalised-toys" className={buttonClass("secondary")}>
              Personalised gifts
            </Link>
          </div>
        </div>
        {/* Decorative mark: large and faint on tablet and up, hidden on phones to keep the text clear. */}
        <LogoMark className="pointer-events-none absolute -bottom-10 -right-10 hidden h-80 w-80 opacity-90 md:block" />
      </section>

      <Suspense fallback={<p className="mt-10 text-sm text-muted">Loading the shop…</p>}>
        <ShopSections />
      </Suspense>

      <section id="demos" aria-labelledby="demos-heading" className="mt-20 border-t border-border pt-10">
        <h2 id="demos-heading" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Project demos
        </h2>
        <p className="mt-1 text-sm text-muted">Claude-powered pages built during the certification sprint.</p>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2">
          {demos.map((demo) => (
            <li key={demo.href}>
              <Link href={demo.href} className={`block h-full p-5 hover:border-accent ${cardClass}`}>
                <h3 className="font-semibold">{demo.title}</h3>
                <p className="mt-1 text-sm text-muted">{demo.body}</p>
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
  const underLabel = `Under ${formatMoney(UNDER_PRICE_MINOR)}`;

  return (
    <>
      <section aria-labelledby="categories-heading" className="mt-14">
        <SectionHeading id="categories-heading">Shop by category</SectionHeading>
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/products?category=${category.slug}`}
                className={`group block p-3 transition-shadow hover:shadow-md ${cardClass}`}
              >
                <ProductImage categorySlug={category.slug} />
                <span className="mt-3 block px-1 font-display text-lg font-semibold group-hover:text-accent">
                  {category.name}
                </span>
                <span className="block px-1 pb-1 text-sm text-muted">
                  {category.count} product{category.count === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Shelf id="new-arrivals" title="New arrivals" href="/products?sort=newest" items={newArrivals} />
      <Shelf id="under-ten" title={underLabel} href={`/products?max=${UNDER_PRICE_MINOR / 100}&sort=price-asc`} items={underTen} />
    </>
  );
}

function Shelf({ id, title, href, items }: { id: string; title: string; href: string; items: CatalogItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={id} className="mt-14">
      <div className="flex items-baseline justify-between gap-4">
        <SectionHeading id={id}>{title}</SectionHeading>
        <Link href={href} className="text-sm font-semibold text-accent hover:underline">
          See all →
        </Link>
      </div>
      <div className="mt-5">
        <ProductGrid items={items} layout="shelf" />
      </div>
    </section>
  );
}
