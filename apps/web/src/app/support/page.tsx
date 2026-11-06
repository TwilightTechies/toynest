import Link from "next/link";
import { Suspense } from "react";
import { currentConversation, loadSupportData, toChatState } from "@/lib/support";
import { signIn, signOut } from "./actions";
import { SupportChat } from "./support-chat";

export const metadata = { title: "Support · ToyNest" };

// The static shell prerenders; the session part reads cookies, so it streams in behind Suspense.
export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← ToyNest
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Customer support</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        A Claude support assistant with refunds up to £50, escalation to a human, and customer-data isolation. Synthetic
        customers and orders; refunds are mock-only.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm text-zinc-500">Loading…</p>}>
        <SupportSession />
      </Suspense>
    </main>
  );
}

async function SupportSession() {
  const [current, { sampleCustomers }] = await Promise.all([currentConversation(), loadSupportData()]);
  const signedIn = current
    ? sampleCustomers.find((customer) => customer.id === current.stored.conversation.customerId)
    : null;

  return (
    <>
      {!current || !signedIn ? (
        <form action={signIn} className="mt-8 grid max-w-md gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="font-medium">Sign in as a demo customer</h2>
          <p className="text-xs text-zinc-500">Mock session: a stand-in for Supabase Auth.</p>
          <select
            name="customerId"
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          >
            {sampleCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · {customer.email}
              </option>
            ))}
          </select>
          <button className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
            Start a support chat
          </button>
        </form>
      ) : (
        <>
          <form action={signOut} className="mt-6 flex items-center gap-3 text-sm">
            <span>
              Signed in as <strong>{signedIn.name}</strong> <span className="text-zinc-500">({signedIn.id})</span>
            </span>
            <button className="rounded-md border border-zinc-300 px-3 py-1 dark:border-zinc-700">Sign out</button>
          </form>
          <SupportChat key={current.id} initial={toChatState(current.stored)} />
        </>
      )}
    </>
  );
}
