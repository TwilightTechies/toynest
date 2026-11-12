import Link from "next/link";
import { Logo } from "./logo";
import { MobileMenu, type NavLink } from "./mobile-menu";

// Category links are fixed here rather than loaded, so the header stays static (no data fetch on
// every page). If categories become admin-editable, load them from CategoryRepository instead.
const navLinks: NavLink[] = [
  { href: "/products", label: "Shop all" },
  { href: "/products?category=educational-toys", label: "Educational" },
  { href: "/products?category=personalised-toys", label: "Personalised" },
  { href: "/products?category=small-toys", label: "Small toys" },
  { href: "/products?category=stationery", label: "Stationery" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-4">
        <Logo />
        {/* Desktop: inline links. Phones: the menu button below (md:hidden). */}
        <nav aria-label="Main" className="hidden items-center gap-1 text-sm font-semibold md:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-full px-3 py-2 hover:bg-surface hover:text-accent">
              {link.label}
            </Link>
          ))}
          <Link href="/support" className="ml-2 rounded-full px-3 py-2 text-muted hover:bg-surface hover:text-accent">
            Help
          </Link>
        </nav>
        <MobileMenu links={[...navLinks, { href: "/support", label: "Help & support" }]} />
      </div>
    </header>
  );
}
