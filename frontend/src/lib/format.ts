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

// Run IDs are formatted `YYYYMMDD-HHMMSS-<8-hex-hash>`. The hash makes
// the id unique across same-minute runs but is unreadable. We render
// the start time in the user's locale plus the hash separately as a
// disambiguator.
export function runIdHash(runId: string): string {
  const tail = runId.split("-").pop();
  return tail && /^[0-9a-f]+$/i.test(tail) ? tail : runId;
}

// Smart relative formatting against `now` (injectable for testing):
//   today      → "Today 10:07 PM"
//   yesterday  → "Yesterday 10:07 PM"
//   same year  → "May 28 · 10:07 PM"
//   other year → "May 28, 2025 · 10:07 PM"
export function formatRunTitle(
  startedAt: string,
  now: Date = new Date(),
): string {
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return startedAt;
  const time = d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, now)) return `Today ${time}`;
  if (sameDay(d, yesterday)) return `Yesterday ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${datePart} · ${time}`;
}
