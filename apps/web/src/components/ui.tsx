// Shared UI primitives. Class strings rather than wrapper components where the element varies
// (a Link, a <button>, a form <button>), so styling stays in one place without prop plumbing.

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary: "border border-border-strong bg-surface-raised text-foreground hover:border-accent hover:text-accent",
  ghost: "text-foreground hover:bg-surface",
};

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md"): string {
  const sizing = size === "sm" ? "px-3.5 py-1.5 text-sm" : "px-5 py-2.5 text-sm";
  return `${buttonBase} ${buttonVariants[variant]} ${sizing}`;
}

export const fieldClass =
  "w-full rounded-xl border border-border-strong bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent";

export const labelClass = "flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted";

export const cardClass = "rounded-2xl border border-border bg-surface-raised";

export function Badge({ children, tone = "sage" }: { children: React.ReactNode; tone?: "sage" | "neutral" }) {
  const tones = {
    sage: "bg-sage-soft text-sage-strong",
    neutral: "bg-surface text-muted",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function SectionHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-display text-2xl font-semibold tracking-tight">
      {children}
    </h2>
  );
}
