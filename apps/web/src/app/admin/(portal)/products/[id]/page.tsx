import { formatRupeesInput } from "@toynest/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { ProductForm, StatusControls } from "../product-form";
import { statusLabel, statusTone } from "../status";
import { PhotosCard } from "./photos";

export const metadata: Metadata = { title: "Edit product · ToyNest admin" };

export default function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/admin/products" className="text-sm font-semibold text-accent hover:underline">
        ← All products
      </Link>
      <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading product…</p>}>
        <EditProduct params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function EditProduct({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const { context } = await requireAdmin();
  const { id } = await params;
  const { saved, status, photo, photoError } = await searchParams;
  const [product, categories, photos] = await Promise.all([
    context.products.get(id),
    context.categories.list(),
    context.productImages.list(id),
  ]);
  if (!product) notFound();

  const notice =
    saved === "1" ? "Saved." : status === "active" ? "Published: shoppers can see it now." : status ? `Moved to ${statusLabel[product.status].toLowerCase()}.` : null;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{product.name}</h1>
        <Badge tone={statusTone(product.status)}>{statusLabel[product.status]}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">
        Last updated {new Date(product.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        {product.status === "active" && (
          <>
            {" · "}
            <Link href={`/products/${product.slug}`} className="font-semibold text-accent hover:underline">
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
      <div className="mt-6 flex flex-col gap-6">
        {/* key: a new version remounts the forms, so they never hold a stale version token. */}
        <ProductForm
          key={product.version}
          categories={categories}
          product={{
            id: product.id,
            version: product.version,
            name: product.name,
            slug: product.slug,
            description: product.description,
            categoryId: product.categoryId,
            price: formatRupeesInput(product.priceMinor),
            attributes: product.attributes,
          }}
        />
        <PhotosCard
          productId={product.id}
          photos={photos}
          notice={typeof photo === "string" ? photo : undefined}
          error={typeof photoError === "string" ? photoError.slice(0, 300) : undefined}
        />
        <StatusControls key={`status-${product.version}`} id={product.id} version={product.version} status={product.status} />
      </div>
    </>
  );
}
