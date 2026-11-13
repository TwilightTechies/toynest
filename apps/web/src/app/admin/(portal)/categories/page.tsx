import { menuLabelOf } from "@toynest/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, buttonClass, cardClass } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { moveCategory } from "./actions";

export const metadata: Metadata = { title: "Categories · ToyNest admin" };

export default function CategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Categories</h1>
        <Link href="/admin/categories/new" className={`${buttonClass()} min-h-11`}>
          New category
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted">The order here is the order of the shop menu and filters.</p>
      <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading categories…</p>}>
        <CategoryList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CategoryList({ searchParams }: Pick<PageProps<"/admin/categories">, "searchParams">) {
  const { context } = await requireAdmin();
  const { deleted } = await searchParams;
  const categories = await context.categories.list();

  return (
    <>
      {deleted === "1" && (
        <p role="status" className="mt-4 rounded-xl bg-sage-soft px-4 py-3 text-sm font-semibold text-sage-strong">
          Category deleted.
        </p>
      )}
      <ol className="mt-4 flex flex-col gap-2">
        {categories.map((category, index) => (
          <li key={category.id} className={`${cardClass} flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3`}>
            <div className="w-full min-w-0 sm:w-auto sm:flex-1">
              <Link href={`/admin/categories/${category.id}`} className="font-semibold hover:text-accent hover:underline">
                {category.name}
              </Link>
              <p className="text-sm text-muted">
                Menu: {menuLabelOf(category)} · {category.productCount} {category.productCount === 1 ? "product" : "products"}
              </p>
            </div>
            <Badge tone={category.visible ? "sage" : "neutral"}>{category.visible ? "Shown" : "Hidden"}</Badge>
            <div className="flex gap-2">
              {(["up", "down"] as const).map((direction) => (
                <form key={direction} action={moveCategory}>
                  <input type="hidden" name="id" value={category.id} />
                  <input type="hidden" name="direction" value={direction} />
                  <button
                    disabled={direction === "up" ? index === 0 : index === categories.length - 1}
                    aria-label={`Move ${category.name} ${direction === "up" ? "earlier" : "later"}`}
                    className={`${buttonClass("secondary", "sm")} min-h-11 min-w-11`}
                  >
                    {direction === "up" ? "↑" : "↓"}
                  </button>
                </form>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
