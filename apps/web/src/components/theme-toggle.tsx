"use client";

import { useSyncExternalStore } from "react";
import { THEME_CHANGE_EVENT, THEME_STORAGE_KEY, type ThemeChoice } from "@/lib/theme";

// The <html data-theme> attribute is the source of truth (the boot script set it before paint),
// so reading it never touches storage. The server snapshot is "system": the server can't know
// the choice, and useSyncExternalStore re-renders with the real value after hydration.
function readChoice(): ThemeChoice {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : "system";
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

function subscribe(onChange: () => void) {
  // Another tab changed the choice: apply it here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    apply(event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system");
    onChange();
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function choose(choice: ThemeChoice) {
  apply(choice);
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

const iconProps = {
  viewBox: "0 0 24 24",
  className: "h-4 w-4",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const options: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg {...iconProps}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
    ),
  },
  {
    value: "system",
    label: "Auto",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
];

// A group of toggle buttons (aria-pressed). "Auto" follows the device's light/dark setting.
export function ThemeToggle({ showLabels = false }: { showLabels?: boolean }) {
  const current = useSyncExternalStore(subscribe, readChoice, () => "system" as const);

  return (
    <div role="group" aria-label="Colour theme" className="inline-flex rounded-full border border-border bg-surface p-0.5">
      {options.map((option) => {
        const pressed = current === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            aria-label={showLabels ? undefined : `${option.label} theme`}
            title={option.value === "system" ? "Auto: follow this device" : `${option.label} theme`}
            onClick={() => choose(option.value)}
            className={`flex items-center gap-1.5 rounded-full text-xs font-semibold transition-colors ${
              showLabels ? "px-3 py-2" : "h-8 w-8 justify-center"
            } ${pressed ? "bg-surface-raised text-accent shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            {option.icon}
            {showLabels && option.label}
          </button>
        );
      })}
    </div>
  );
}
