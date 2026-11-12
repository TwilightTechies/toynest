// Placeholder product art, drawn per category until products have real photos. A photo field
// belongs with admin product editing (uploads to Supabase Storage), so it is not added to the
// schema yet. Decorative: the product name is always shown next to it, so it is hidden from
// screen readers.

type Art = { tint: string; icon: React.ReactNode };

const stroke = { stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

const arts: Record<string, Art> = {
  // Puzzle piece
  "educational-toys": {
    tint: "bg-surface text-terracotta",
    icon: (
      <path
        {...stroke}
        d="M20 22h10a6 6 0 1 1 12 0h10v10a6 6 0 1 1 0 12v10H42a6 6 0 1 0-12 0H20V44a6 6 0 1 0 0-12Z"
      />
    ),
  },
  // Train engine
  "personalised-toys": {
    tint: "bg-sage-soft text-sage-strong",
    icon: (
      <g {...stroke}>
        <path d="M14 46V30h16V20h14v26Z" />
        <path d="M30 30h14M50 46V34h6v12" />
        <circle cx="22" cy="50" r="5" />
        <circle cx="40" cy="50" r="5" />
        <path d="M18 20h6v10" />
      </g>
    ),
  },
  // Robot head
  "small-toys": {
    tint: "bg-surface text-sage-strong",
    icon: (
      <g {...stroke}>
        <rect x="18" y="22" width="36" height="28" rx="6" />
        <circle cx="29" cy="35" r="3" />
        <circle cx="43" cy="35" r="3" />
        <path d="M30 43h12M36 22v-8M33 14h6M18 34h-4M58 34h-4" />
      </g>
    ),
  },
  // Crayon
  stationery: {
    tint: "bg-sage-soft text-terracotta",
    icon: (
      <g {...stroke}>
        <path d="M18 50 46 22l6 6-28 28h-6Z" />
        <path d="M46 22l4-4a4 4 0 0 1 6 6l-4 4M24 44l6 6" />
      </g>
    ),
  },
};

const fallback: Art = {
  tint: "bg-surface text-muted",
  icon: <path {...stroke} d="M36 16l6 13 14 2-10 10 2 14-12-7-12 7 2-14-10-10 14-2Z" />,
};

export function ProductImage({ categorySlug, size = "card" }: { categorySlug: string | undefined; size?: "card" | "hero" }) {
  const art = (categorySlug && arts[categorySlug]) || fallback;
  const iconSize = size === "hero" ? "h-1/2 w-1/2" : "h-2/5 w-2/5";
  return (
    <div className={`flex aspect-[4/3] items-center justify-center rounded-xl ${art.tint}`} aria-hidden="true">
      <svg viewBox="0 0 72 72" className={iconSize}>
        {art.icon}
      </svg>
    </div>
  );
}
