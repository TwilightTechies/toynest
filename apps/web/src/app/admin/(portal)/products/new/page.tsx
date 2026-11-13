import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/admin";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "New product · ToyNest admin" };

export default function NewProductPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/admin/products" className="text-sm font-semibold text-accent hover:underline">
        ← All products
      </Link>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">New product</h1>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <NewProduct />
        </Suspense>
      </div>
    </main>
  );
}

async function NewProduct() {
  const { context } = await requireAdmin();
  const categories = await context.categories.list();
  return (
    <ProductForm
      categories={categories}
      product={{ name: "", slug: "", description: "", categoryId: "", price: "", attributes: {} }}
    />
  );
}
