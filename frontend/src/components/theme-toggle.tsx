import { useTheme } from "@/lib/theme";

// ThemeToggle — pill track + thumb per design handoff's .tt-track + .tt-thumb.
// Spec FR-002 (theme persistence — handled by useTheme).
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Toggle theme (currently ${theme})`}
      title="Toggle theme"
    >
      <span className={`tt-track ${theme}`}>
        <span className="tt-thumb" aria-hidden>
          {theme === "dark" ? "☾" : "☀"}
        </span>
      </span>
    </button>
  );
}
