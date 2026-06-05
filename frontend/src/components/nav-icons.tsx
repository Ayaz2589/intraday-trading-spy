// Side-nav icon set (user-provided SVG sources, 2026-06-04).
// 24×24, stroke=currentColor @1.7, round caps/joins, subtle currentColor
// tints — set `color` on a parent to tint the whole icon.

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

/** Flask — Validation. */
export function ValidationIcon() {
  return (
    <Svg>
      <path
        d="M7.4 14 5.7 17.3A1.7 1.7 0 0 0 7.2 20h9.6a1.7 1.7 0 0 0 1.5-2.7L16.6 14Z"
        fill="currentColor"
        fillOpacity={0.16}
        stroke="none"
      />
      <path d="M9.5 3h5" />
      <path d="M10 3v6.2L5.7 17.3A1.7 1.7 0 0 0 7.2 20h9.6a1.7 1.7 0 0 0 1.5-2.7L14 9.2V3" />
      <path d="M7.4 14h9.2" />
      <circle cx={10.6} cy={16.7} r={0.7} fill="currentColor" stroke="none" />
      <circle cx={13.3} cy={17.7} r={0.55} fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** Database — Data. */
export function DataIcon() {
  return (
    <Svg>
      <ellipse
        cx={12}
        cy={5.8}
        rx={7}
        ry={3}
        fill="currentColor"
        fillOpacity={0.16}
        stroke="none"
      />
      <ellipse cx={12} cy={5.8} rx={7} ry={3} />
      <path d="M5 5.8v12.4c0 1.66 3.13 3 7 3s7-1.34 7-3V5.8" />
      <path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" />
    </Svg>
  )
}

/** Crosshair / target — Strategy. */
export function StrategyIcon() {
  return (
    <Svg>
      <circle cx={12} cy={12} r={4.6} fill="currentColor" fillOpacity={0.14} stroke="none" />
      <circle cx={12} cy={12} r={7.4} />
      <circle cx={12} cy={12} r={4.6} />
      <path d="M12 1.6V4M12 20v2.4M1.6 12H4M20 12h2.4" />
      <circle cx={12} cy={12} r={1.4} fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** Trend line over an axis — Backtests. */
export function BacktestsIcon() {
  return (
    <Svg>
      <path
        d="M7.8 19v-3.4l3.4-3.9 2.8 2.2 4.7-5.6V19Z"
        fill="currentColor"
        fillOpacity={0.13}
        stroke="none"
      />
      <path d="M4.5 4v14a1 1 0 0 0 1 1h14" />
      <path d="M7.8 15.6l3.4-3.9 2.8 2.2 4.7-5.6" />
      <path d="M16.3 8.3h2.4v2.7" />
    </Svg>
  )
}

export function InsightsIcon() {
  return (
    <Svg>
      <path d="M4 19h16" />
      <path d="M6 16l3.5-4 3 2.5L17 9" />
      <circle cx={6} cy={16} r={1} fill="currentColor" stroke="none" />
      <circle cx={9.5} cy={12} r={1} fill="currentColor" stroke="none" />
      <circle cx={12.5} cy={14.5} r={1} fill="currentColor" stroke="none" />
      <circle cx={17} cy={9} r={1} fill="currentColor" stroke="none" />
      <path d="M15.5 4.5l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" fill="currentColor" fillOpacity={0.16} />
    </Svg>
  )
}
