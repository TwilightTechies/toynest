import Link from "next/link";
import { LogoMark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <LogoMark className="h-7 w-7" />
          <p className="max-w-xs text-sm text-muted">
            ToyNest is a learning project. Products, prices and customers are synthetic.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/products" className="hover:text-accent">
            Shop all
          </Link>
          <Link href="/support" className="hover:text-accent">
            Help &amp; support
          </Link>
          <Link href="/#demos" className="hover:text-accent">
            Project demos
          </Link>
        </nav>
      </div>
    </footer>
  );
}
