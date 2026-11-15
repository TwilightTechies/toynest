import { attributeLabel } from "@toynest/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { CategoryControls, CategoryForm } from "../category-form";

export const metadata: Metadata = { title: "Edit category · ToyNest admin" };

export default function EditCategoryPage({ params, searchParams }: PageProps<"/admin/categories/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/admin/categories" className="text-sm font-semibold text-accent hover:underline">
        ← All categories
      </Link>
      <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading category…</p>}>
        <EditCategory params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function EditCategory({ params, searchParams }: PageProps<"/admin/categories/[id]">) {
  const { context } = await requireAdmin();
  const { id } = await params;
  const { saved, shown } = await searchParams;
  const category = await context.categories.get(id);
  if (!category) notFound();

  // Live products that a newly required detail would block from being edited (they stay live).
  const live = await context.products.list({ categoryId: category.id, status: "active", limit: 100, offset: 0 });
  const missing = category.requiredAttributes
    .map((key) => ({ key, count: live.items.filter((product) => !product.attributes[key]?.trim()).length }))
    .filter((entry) => entry.count > 0);

  const notice =
    saved === "1" ? "Saved." : shown === "true" ? "Shown in the shop." : shown === "false" ? "Hidden from the shop." : null;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{category.name}</h1>
        <Badge tone={category.visible ? "sage" : "neutral"}>{category.visible ? "Shown" : "Hidden"}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">
        <Link href={`/admin/products?category=${category.id}`} className="font-semibold text-accent hover:underline">
          {category.productCount} {category.productCount === 1 ? "product" : "products"}
        </Link>
        {category.visible && (
          <>
            {" · "}
            <Link href={`/products?category=${category.slug}`} className="font-semibold text-accent hover:underline">
              View in shop
            </Link>
          </>
        )}
      </p>
      {notice && (
        <p role="status" className="mt-4 rounded-xl bg-sage-soft px-4 py-3 text-sm font-semibold text-sage-strong">
          {notice}
        </p>
      )}
      {missing.length > 0 && (
        <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm">
          {missing.map(({ key, count }) => `${count} live ${count === 1 ? "product is" : "products are"} missing "${attributeLabel(key)}"`).join("; ")}.
          They stay live, but editing them will ask for it.
        </p>
      )}
      <div className="mt-6 flex flex-col gap-6">
        <CategoryForm
          key={category.version}
          category={{
            id: category.id,
            version: category.version,
            name: category.name,
            slug: category.slug,
            menuLabel: category.menuLabel ?? "",
            requiredAttributes: category.requiredAttributes.map(attributeLabel).join(", "),
          }}
        />
        <CategoryControls
          key={`controls-${category.version}`}
          id={category.id}
          version={category.version}
          visible={category.visible}
          productCount={category.productCount}
        />
      </div>
    </>
  );
}
