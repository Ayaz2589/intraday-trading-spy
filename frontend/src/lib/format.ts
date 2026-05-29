const ACRONYMS = new Set(["vwap", "or", "r", "spy", "etf", "pnl"]);

export function humanize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) =>
      ACRONYMS.has(w.toLowerCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

export function truncate(s: string, max = 40): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
