"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./theme-toggle";

export interface NavLink {
  href: string;
  label: string;
}

// Phones and tablets (below lg): a disclosure button (aria-expanded + aria-controls) holding the
// links and the theme switch.
// Without JS the menu stays closed; the footer and the home page's category tiles still link
// everywhere the menu does.
export function MobileMenu({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape closes the menu and returns focus to the button (keyboard and screen-reader users).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="xl:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface"
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <nav
        id="mobile-menu"
        aria-label="Main"
        hidden={!open}
        className="absolute inset-x-0 top-16 border-b border-border bg-background px-4 pb-4 shadow-lg"
      >
        <ul className="flex flex-col">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-3 text-base font-semibold hover:bg-surface hover:text-accent"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-border px-3 pt-4">
          <span className="text-sm font-semibold text-muted">Theme</span>
          <ThemeToggle showLabels />
        </div>
      </nav>
    </div>
  );
}
