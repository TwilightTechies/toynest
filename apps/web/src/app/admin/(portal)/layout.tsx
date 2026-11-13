import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { signOut } from "../actions";

const links = [
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/drafts/new", label: "AI drafts" },
  { href: "/admin/mcp", label: "MCP explorer" },
];

// Every page under (portal) needs a signed-in admin. The login page sits outside this group, so it
// isn't caught by its own check. Pages and actions call requireAdmin() too (see lib/admin.ts).
export default function PortalLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-muted">Checking your session…</p>}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
          <span className="font-display font-semibold">Admin</span>
          <nav aria-label="Admin" className="flex flex-wrap gap-1">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-full px-3 py-2 font-semibold hover:bg-surface-raised hover:text-accent">
                {link.label}
              </Link>
            ))}
          </nav>
          <form action={signOut} className="ml-auto flex items-center gap-3">
            <span className="hidden text-muted sm:inline">{user.email}</span>
            <button className={buttonClass("ghost", "sm")}>Sign out</button>
          </form>
        </div>
      </div>
      {children}
    </>
  );
}
