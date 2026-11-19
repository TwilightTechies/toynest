import Link from "next/link";
import { LogoMark } from "./logo";

// 44 px tall on touch screens; unchanged for a mouse.
const footerLink = "inline-flex items-center hover:text-accent pointer-coarse:min-h-11";

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
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 pointer-coarse:gap-y-0 text-sm">
          <Link href="/products" className={footerLink}>
            Shop all
          </Link>
          <Link href="/support" className={footerLink}>
            Help &amp; support
          </Link>
          <Link href="/#demos" className={footerLink}>
            Project demos
          </Link>
        </nav>
      </div>
    </footer>
  );
}
