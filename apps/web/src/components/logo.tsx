import Link from "next/link";

// The mark: a nest (bowl with twigs) holding three eggs. Same drawing as app/icon.svg.
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="11" cy="14" r="4.5" fill="#7a9471" />
      <circle cx="21" cy="14" r="4.5" fill="#e8b48a" />
      <circle cx="16" cy="11.5" r="4.5" fill="#f3eadb" stroke="#c9b8a2" strokeWidth="1" />
      <path d="M3 16h26c0 7-5.8 11-13 11S3 23 3 16Z" fill="#c2562f" />
      <path d="M7 20.5c3 1 6 1.4 9 1.4s6-.4 9-1.4M9.5 24.5c2 .6 4.3.9 6.5.9s4.5-.3 6.5-.9" stroke="#fbf7f0" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity=".7" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md" aria-label="ToyNest home">
      <LogoMark />
      <span className="font-display text-xl font-semibold tracking-tight">ToyNest</span>
    </Link>
  );
}
