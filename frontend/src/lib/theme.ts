import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "isb-theme";
const DEFAULT_THEME: Theme = "dark";

function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "light" ? v : null;
}

// Apply the theme by setting the `data-theme` attribute on <html> and
// briefly suppressing transitions to avoid the in-flight color flicker
// when token-driven properties swap (see research R2 of feature 004).
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.add("theme-no-anim");
  root.setAttribute("data-theme", theme);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-no-anim");
    });
  });
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => getStoredTheme() ?? DEFAULT_THEME,
  );

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  return { theme, setTheme, toggle };
}
