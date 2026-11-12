"use client";

import { useActionState } from "react";
import type { ToolActivity } from "@toynest/ai";
import type { ChatState } from "@/lib/support";
import { sendMessage } from "./actions";

const outcomeStyle: Record<ToolActivity["outcome"], string> = {
  ok: "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100",
  blocked: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  error: "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100",
};

const tryThese = [
  "My name train from order TN-1042 arrived cracked. Can I get a refund for it?",
  "I want a refund for my puzzle order.",
  "Another shop sells the robot ₹50 cheaper, can you match it?",
  "Where is order TN-1070?",
  "I'd like to speak to a real person, please.",
];

export function SupportChat({ initial }: { initial: ChatState }) {
  const [state, action, pending] = useActionState<ChatState, FormData>(sendMessage, initial);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="font-medium">Chat</h2>
        <ol className="mt-4 space-y-3">
          {state.turns.length === 0 && <li className="text-sm text-zinc-500">No messages yet.</li>}
          {state.turns.map((turn, index) => (
            <li
              key={index}
              className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                turn.role === "customer" ? "ml-8 bg-zinc-100 dark:bg-zinc-800" : "mr-8 border border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <span className="block text-xs text-zinc-500">{turn.role === "customer" ? "You" : "ToyNest support"}</span>
              {turn.text}
            </li>
          ))}
        </ol>

        <form action={action} className="mt-4 grid gap-2">
          <textarea
            name="message"
            required
            maxLength={1000}
            rows={2}
            placeholder="Type your message…"
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
          />
          <button
            disabled={pending}
            className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? "Thinking…" : "Send"}
          </button>
        </form>
        {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}

        <details className="mt-4 text-xs text-zinc-500">
          <summary className="cursor-pointer">Things to try</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {tryThese.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        </details>
      </section>

      <aside className="grid content-start gap-6">
        <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="font-medium">Case facts</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Built by code from tool results and sent at the top of every turn. Only the last 6 chat turns are sent verbatim.
          </p>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
            {state.caseFacts}
          </pre>
        </section>

        <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="font-medium">Tool activity (last turn)</h2>
          {state.activity.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No tool calls.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {state.activity.map((entry, index) => (
                <li key={index} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${outcomeStyle[entry.outcome]}`}>{entry.outcome}</span>
                    <span className="font-mono">{entry.name}</span>
                  </div>
                  <p className="mt-1 break-all font-mono text-zinc-500">in: {JSON.stringify(entry.input)}</p>
                  <p className="mt-1 break-all font-mono">out: {entry.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
