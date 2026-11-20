import Link from "next/link";

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

// Accounts (ADR-022). A static link, so the header stays in the static shell and costs no session
// lookup per page: /account sends signed-out visitors to the sign-in page.
export function AccountLink() {
  return (
    <Link href="/account" aria-label="Your account or sign in" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface hover:text-accent">
      <PersonIcon />
    </Link>
  );
}
