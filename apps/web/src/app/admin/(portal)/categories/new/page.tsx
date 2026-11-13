import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/admin";
import { CategoryForm } from "../category-form";

export const metadata: Metadata = { title: "New category · ToyNest admin" };

export default function NewCategoryPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/admin/categories" className="text-sm font-semibold text-accent hover:underline">
        ← All categories
      </Link>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">New category</h1>
      <p className="mt-1 text-sm text-muted">New categories start hidden. Add products, then press &ldquo;Show in shop&rdquo;.</p>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <NewCategory />
        </Suspense>
      </div>
    </main>
  );
}

async function NewCategory() {
  await requireAdmin();
  return <CategoryForm category={{ name: "", slug: "", menuLabel: "", requiredAttributes: "" }} />;
}
