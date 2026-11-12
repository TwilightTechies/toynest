"use client";

import { useState } from "react";

// Phones: filters collapse behind a toggle so products are visible without scrolling past a form.
// Tablet and up: always shown. The form itself (a child) stays a server-rendered GET form.
export function FilterPanel({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="filters"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-xl border border-border-strong bg-surface-raised px-4 py-3 text-sm font-semibold md:hidden"
      >
        <span>
          Filters &amp; sort
          {activeCount > 0 && (
            <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">{activeCount}</span>
          )}
        </span>
        <svg viewBox="0 0 24 24" className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div id="filters" className={open ? "mt-3 block" : "hidden md:block"}>
        {children}
      </div>
    </div>
  );
}
