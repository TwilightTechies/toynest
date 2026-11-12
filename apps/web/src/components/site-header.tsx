import Link from "next/link";

// Category links are fixed here rather than loaded, so the header stays static (no data fetch on
// every page). If categories become admin-editable, load them from CategoryRepository instead.
const navCategories = [
  { slug: "educational-toys", name: "Educational" },
  { slug: "personalised-toys", name: "Personalised" },
  { slug: "small-toys", name: "Small toys" },
  { slug: "stationery", name: "Stationery" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          ToyNest
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/products" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Shop all
          </Link>
          {navCategories.map((category) => (
            <Link
              key={category.slug}
              href={`/products?category=${category.slug}`}
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              {category.name}
            </Link>
          ))}
          <Link href="/support" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Support
          </Link>
        </nav>
      </div>
    </header>
  );
}
