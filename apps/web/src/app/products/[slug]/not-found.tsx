import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Product not found</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">It may have been removed, or the link is wrong.</p>
      <Link href="/products" className="mt-6 inline-block underline">
        Back to the shop
      </Link>
    </main>
  );
}
