// Theme preference shared by the inline <head> script (layout.tsx) and the switch (theme-toggle.tsx).
// "system" means no choice stored: the CSS follows prefers-color-scheme.

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "toynest-theme";
export const THEME_CHANGE_EVENT = "toynest-theme-change";

// Runs before first paint so a stored choice never flashes the other theme. Kept tiny and
// dependency-free; storage access can throw (private mode, blocked site data), so it is guarded.
export const themeBootScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;
