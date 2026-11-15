import Link from "next/link";
import { getMenuCategories } from "@/lib/catalog";
import { BasketLink } from "./basket-link";
import { Logo } from "./logo";
import { MobileMenu, type NavLink } from "./mobile-menu";
import { ThemeToggle } from "./theme-toggle";

// Category links come from the database (shown categories, in admin order: ADR-018), through a cached
// read, so the header is still part of the static shell.
export async function SiteHeader() {
  const navLinks: NavLink[] = [{ href: "/products", label: "Shop all" }, ...(await getMenuCategories())];
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4">
        <Logo />
        {/* Wide screens (xl+): inline links and theme switch. Below that, the menu button. xl rather than lg
            because admins can add categories (ADR-018), and seven links no longer fit at 1024 px. */}
        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 text-sm font-semibold xl:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="whitespace-nowrap rounded-full px-3 py-2 hover:bg-surface hover:text-accent">
              {link.label}
            </Link>
          ))}
          <Link href="/support" className="ml-2 rounded-full px-3 py-2 text-muted hover:bg-surface hover:text-accent">
            Help
          </Link>
          <div className="ml-3">
            <ThemeToggle />
          </div>
        </nav>
        {/* Basket: always visible, on every screen size. ml-auto pushes it right when the nav is hidden. */}
        <div className="ml-auto flex items-center gap-1 xl:ml-0">
          <BasketLink />
          <MobileMenu links={[...navLinks, { href: "/support", label: "Help & support" }]} />
        </div>
      </div>
    </header>
  );
}
