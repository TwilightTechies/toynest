// Theme preference shared by the inline <head> script (layout.tsx) and the switch (theme-toggle.tsx).
// Light is the default: the server renders <html data-theme="light">, and nothing is stored for it.
// "dark" is stored and applied as data-theme="dark". "system" is stored explicitly and removes the
// attribute, so the CSS follows prefers-color-scheme.

export type ThemeChoice = "light" | "dark" | "system";

export const DEFAULT_THEME: ThemeChoice = "light";
export const THEME_STORAGE_KEY = "toynest-theme";
export const THEME_CHANGE_EVENT = "toynest-theme-change";

// Runs before first paint so a stored choice never flashes the other theme. Kept tiny and
// dependency-free; storage access can throw (private mode, blocked site data), so it is guarded
// and the server's light default stays.
export const themeBootScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)}),r=document.documentElement;if(t==="dark"){r.dataset.theme="dark";}else if(t==="system"){delete r.dataset.theme;}}catch(e){}})();`;
