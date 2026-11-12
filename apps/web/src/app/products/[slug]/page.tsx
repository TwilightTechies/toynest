import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getProduct } from "@/lib/catalog";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  return { title: product ? `${product.name} · ToyNest` : "Product not found · ToyNest" };
}

export default function ProductPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading product…</p>}>
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
      <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
        <Link href="/products" className="hover:underline">
          Shop
        </Link>
        {product.categorySlug && (
          <>
            {" / "}
            <Link href={`/products?category=${product.categorySlug}`} className="hover:underline">
              {product.categoryName}
            </Link>
          </>
        )}
      </nav>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{product.name}</h1>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{product.price}</p>
      <p className="mt-6 text-zinc-700 dark:text-zinc-300">{product.description}</p>

      {product.attributes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Details</h2>
          <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            {product.attributes.map((attribute) => (
              <div key={attribute.label} className="contents">
                <dt className="text-zinc-500">{attribute.label}</dt>
                <dd>{attribute.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <p className="mt-10 rounded-md bg-zinc-100 px-4 py-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        The basket arrives in the next phase.
      </p>
    </article>
  );
}
