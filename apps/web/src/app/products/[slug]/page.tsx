import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductGallery } from "@/components/product-gallery";
import { AddToBasketForm } from "@/components/add-to-basket-form";
import { Badge } from "@/components/ui";
import { getProduct } from "@/lib/catalog";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  return { title: product ? `${product.name} · ToyNest` : "Product not found · ToyNest" };
}

export default function ProductPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <Suspense fallback={<p className="text-sm text-muted">Loading product…</p>}>
        <Product params={params} />
      </Suspense>
    </main>
  );
}

async function Product({ params }: { params: Params }) {
  // getProduct validates the slug and returns null for unknown, draft or archived products.
  const product = await getProduct((await params).slug);
  if (!product) notFound();

  return (
    <article>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/products" className="hover:text-accent hover:underline">
              Shop
            </Link>
          </li>
          {product.categorySlug && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true">/</span>
              <Link href={`/products?category=${product.categorySlug}`} className="hover:text-accent hover:underline">
                {product.categoryName}
              </Link>
            </li>
          )}
        </ol>
      </nav>

      {/* Phones: photos, then details. Tablet and up: side by side. */}
      <div className="mt-5 grid gap-8 md:grid-cols-2 md:gap-12">
        <ProductGallery images={product.images} name={product.name} categorySlug={product.categorySlug} />

        <div>
          <Badge>{product.categoryName}</Badge>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{product.name}</h1>
          <p className="mt-3 text-2xl font-bold tabular-nums">{product.price}</p>
          <p className="mt-5 leading-relaxed text-foreground/90">{product.description}</p>

          <AddToBasketForm slug={product.slug} personalisable={product.personalisable} />

          {product.attributes.length > 0 && (
            <section aria-labelledby="details-heading" className="mt-8 border-t border-border pt-6">
              <h2 id="details-heading" className="text-xs font-semibold uppercase tracking-wide text-muted">
                Details
              </h2>
              <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-8 gap-y-2.5 text-sm">
                {product.attributes.map((attribute) => (
                  <div key={attribute.label} className="contents">
                    <dt className="text-muted">{attribute.label}</dt>
                    <dd className="font-semibold">{attribute.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
