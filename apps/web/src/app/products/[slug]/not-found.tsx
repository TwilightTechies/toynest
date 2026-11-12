import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function ProductNotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-16">
      <div className="rounded-2xl bg-surface px-6 py-14 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Product not found</h1>
        <p className="mt-2 text-muted">It may have been removed, or the link is wrong.</p>
        <Link href="/products" className={`mt-6 ${buttonClass("primary")}`}>
          Back to the shop
        </Link>
      </div>
    </main>
  );
}
