"use client";

import { useEffect, useState } from "react";

// A one-off confirmation after a redirect (e.g. /admin/products?created=<id>). The server decides the
// message; this only shows it, hides it after a few seconds, and drops the one-shot query parameter so
// a reload or Back doesn't announce the same event again.
export function Toast({ message, clearParam, durationMs = 6000 }: { message: string; clearParam?: string; durationMs?: number }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (clearParam) {
      const url = new URL(window.location.href);
      if (url.searchParams.has(clearParam)) {
        url.searchParams.delete(clearParam);
        window.history.replaceState(window.history.state, "", url);
      }
    }
    const timer = window.setTimeout(() => setOpen(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [clearParam, durationMs]);

  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-sage-soft px-4 py-3 text-sm font-semibold text-sage-strong shadow-lg sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Dismiss"
        className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-lg hover:bg-surface"
      >
        ✕
      </button>
    </div>
  );
}
