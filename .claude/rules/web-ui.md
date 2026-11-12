---
paths:
  - "apps/web/src/**/*.tsx"
  - "apps/web/src/app/globals.css"
---

# Web UI conventions (design foundation, ADR-013)
- Use the semantic colour tokens from `globals.css` (`bg-background`, `bg-surface`, `bg-surface-raised`, `text-muted`, `border-border`, `bg-accent`, `text-accent`, `bg-sage-soft`, `text-sage-strong`). Never raw Tailwind palettes (`zinc-*`, `gray-*`) or hex values in components.
- `terracotta` is decorative only (fails 4.5:1 as text). Links and buttons use `accent`. Check contrast for any new token pair, in light and dark.
- Reuse the primitives in `src/components/ui.tsx` (`buttonClass`, `fieldClass`, `labelClass`, `cardClass`, `Badge`, `SectionHeading`) instead of restating their classes.
- Headings use `font-display` (Fraunces); body text inherits `font-sans` (Nunito Sans).
- Design mobile-first: base classes for phones, then `sm:`/`md:`/`lg:`. Tap targets are at least 44 px. Check at 375, 768 and 1280 px.
- Server components by default. Client components only for real interaction (e.g. `mobile-menu.tsx`, `filter-panel.tsx`, `theme-toggle.tsx`); keep them small and accessible (`aria-expanded`, `aria-controls`, Escape to close).
- Pages and forms keep working through URLs and plain GET forms. Don't move browsing state into client state.
- Themes: any new token needs a light value in `:root` and a dark value in BOTH dark blocks (the media query and `[data-theme="dark"]`). Test with the switch set to Light, Dark and Auto.
