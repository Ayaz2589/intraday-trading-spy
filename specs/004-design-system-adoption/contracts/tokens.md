# Design-Token Contract

**Plan**: [../plan.md](../plan.md)  
**Spec FR-010, SC-002**: token values are contractual and auditable against the
handoff.

This document is the authoritative mapping between the design handoff's tokens
(`/Users/ayazuddin/Desktop/design_handoff_intraday_builder/files/tokens.css`)
and what they MUST resolve to in the live app. Any drift between this contract
and the live computed style is a bug.

---

## Theme-stable tokens (identical in both themes)

| Token | Value | Where used |
|---|---|---|
| `--font-sans` | `'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif` | Body, all UI text not numeric |
| `--font-mono` | `'JetBrains Mono', ui-monospace, 'SF Mono', monospace` | All numerics, run-ids, code hashes, timestamps |
| `--accent` | `#2563eb` | Primary buttons, active states, brand mark, info-dot ring on hover, Config card accent rail |
| `--accent-hover` | `#3b82f6` | Hover state of primary buttons |
| `--accent-press` | `#1d4ed8` | Active/press state of primary buttons |
| `--accent-contrast` | `#ffffff` | Text on `--accent` backgrounds |
| `--info` | `#38bdf8` | Summary card accent rail |
| `--ease` | `cubic-bezier(0.22, 1, 0.36, 1)` | All transitions |
| `--speed` | `180ms` | All transitions |

### Theme-stable, theme-tinted tokens (slightly differ dark vs light)

| Token | Dark | Light | Where used |
|---|---|---|---|
| `--accent-soft` | `rgba(37, 99, 235, 0.14)` | `rgba(37, 99, 235, 0.10)` | Tab `is-on` backgrounds, day-tab active, chip-accent bg, preset-icon tile |
| `--profit` | `#14b884` | `#0f9e6e` | Up candles, win-rate green text, Realized R ≥ 0, OR-high line, Force-flat exit border (target) |
| `--profit-soft` | `rgba(20, 184, 132, 0.14)` | `rgba(15, 158, 110, 0.12)` | Profit badge bg, chip-profit bg |
| `--loss` | `#f04f6a` | `#e23b58` | Down candles, loss red text, Realized R < 0, stop loss color, OR-low line, error card accent rail |
| `--loss-soft` | `rgba(240, 79, 106, 0.14)` | `rgba(226, 59, 88, 0.10)` | Loss badge bg, danger-ghost hover bg |
| `--warn` | `#f5a524` | `#d98309` | VWAP polyline, light-mode theme thumb, Rejections card accent rail, rejection bar fill |
| `--warn-soft` | `rgba(245, 165, 36, 0.15)` | `rgba(217, 131, 9, 0.12)` | Warn badge bg |

---

## Dark-theme tokens (`[data-theme="dark"]`)

| Token | Value | Where used |
|---|---|---|
| `--bg-app` | `#0a0d15` | `<body>` background, topbar background (with blur) |
| `--bg-sunken` | `#070a11` | (reserved for deeper backgrounds; not used in v1) |
| `--bg-rail` | `#0c1019` | Sidebar background |
| `--surface` | `#121723` | Card background, popover background, run-on bg |
| `--surface-2` | `#182030` | Trow-open bg, segmented control bg, chip-tick bg, knob-field bg, toast bg |
| `--surface-3` | `#1f293c` | Meter track bg, info-dot soft border, badge-faint bg |
| `--surface-hover` | `rgba(255, 255, 255, 0.04)` | Hover state on icon buttons, run-items |
| `--border` | `rgba(148, 163, 184, 0.12)` | All standard borders, divider lines |
| `--border-strong` | `rgba(148, 163, 184, 0.22)` | Card-internal dividers, dt-row dashes |
| `--border-accent` | `rgba(37, 99, 235, 0.5)` | Focus rings, run-on border, day-tab active border |
| `--text` | `#eef2f8` | Body text, headings |
| `--text-muted` | `#9aa7bd` | Secondary text, knob labels, table cell secondary |
| `--text-faint` | `#66738c` | Overline labels, axis ticks, footer hint, info-dot fg |
| `--text-inverse` | `#0a0d15` | Reserved for use on accent-soft hover states (rare) |
| `--grid` | `rgba(148, 163, 184, 0.08)` | Chart grid lines |
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.4)` | Card resting shadow |
| `--shadow-md` | `0 8px 24px -8px rgba(0, 0, 0, 0.55)` | Hover-lifted cards |
| `--shadow-lg` | `0 24px 60px -16px rgba(0, 0, 0, 0.7)` | Toast |
| `--shadow-pop` | `0 16px 48px -12px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04)` | Popovers |
| `--chart-bg` | `#0c111c` | Chart inner wrap background |

---

## Light-theme tokens (`[data-theme="light"]`)

| Token | Value | Where used |
|---|---|---|
| `--bg-app` | `#eef1f6` | `<body>` background, topbar background (with blur) |
| `--bg-sunken` | `#e4e9f1` | (reserved) |
| `--bg-rail` | `#f4f6fb` | Sidebar background |
| `--surface` | `#ffffff` | Card background, popover background, run-on bg |
| `--surface-2` | `#f6f8fc` | Trow-open bg, segmented control bg, etc. |
| `--surface-3` | `#eef2f8` | Meter track bg, badge-faint bg |
| `--surface-hover` | `rgba(15, 23, 42, 0.03)` | Hover states |
| `--border` | `rgba(15, 23, 42, 0.09)` | Standard borders |
| `--border-strong` | `rgba(15, 23, 42, 0.16)` | Card-internal dividers |
| `--border-accent` | `rgba(37, 99, 235, 0.4)` | Focus rings, active states |
| `--text` | `#111726` | Body text, headings |
| `--text-muted` | `#56627a` | Secondary text |
| `--text-faint` | `#8a96ab` | Overline labels, axis ticks |
| `--text-inverse` | `#ffffff` | Reserved for accent-soft hover edge cases |
| `--grid` | `rgba(15, 23, 42, 0.06)` | Chart grid lines |
| `--shadow-sm` | `0 1px 2px rgba(15, 23, 42, 0.06)` | Card resting shadow |
| `--shadow-md` | `0 10px 28px -12px rgba(15, 23, 42, 0.18)` | Hover-lifted cards |
| `--shadow-lg` | `0 28px 64px -20px rgba(15, 23, 42, 0.24)` | Toast |
| `--shadow-pop` | `0 18px 50px -14px rgba(15,23,42,0.24), 0 0 0 1px rgba(15,23,42,0.04)` | Popovers |
| `--chart-bg` | `#fbfcfe` | Chart inner wrap background |

---

## Typography scale

| Token | Value | Used for |
|---|---|---|
| `--fs-2xs` | `10.5px` | Tab count badge, sidebar `run-trades` |
| `--fs-xs` | `11.5px` | Overline labels, sidebar `run-id` / `run-time`, brand tick pill, chart legend |
| `--fs-sm` | `13px` | Body text, table cells, button labels, popover body |
| `--fs-base` | `14px` | Default body, popover titles |
| `--fs-md` | `15px` | Card titles, brand-name |
| `--fs-lg` | `18px` | Summary stat-big values |
| `--fs-xl` | `22px` | Run header title |
| `--fs-2xl` | `28px` | (reserved; not used in v1) |
| `--fs-3xl` | `36px` | (reserved) |
| `--fs-4xl` | `48px` | (reserved) |

### Tracking

- `--tracking-tight` `-0.02em` — Brand name, large titles.
- `--tracking-wide` `0.04em` — Body emphasis (not heavily used).
- `--tracking-caps` `0.08em` — Overline labels (uppercase).

---

## Spacing (4px base)

| Token | Value |
|---|---|
| `--sp-1` | 4px |
| `--sp-2` | 8px |
| `--sp-3` | 12px |
| `--sp-4` | 16px |
| `--sp-5` | 20px |
| `--sp-6` | 24px |
| `--sp-8` | 32px |
| `--sp-10` | 40px |
| `--sp-12` | 48px |
| `--sp-16` | 64px |

---

## Radii

| Token | Value | Used for |
|---|---|---|
| `--r-xs` | 6px | Icon-buttons, small inner radii |
| `--r-sm` | 8px | Buttons-sm, knob fields |
| `--r-md` | 12px | Cards, buttons, run-item, day-tab |
| `--r-lg` | 16px | Card (overview), popover |
| `--r-xl` | 20px | (reserved) |
| `--r-2xl` | 26px | (reserved) |
| `--r-pill` | 999px | All pills, badges, chips, segmented control, toast |

---

## Verification (SC-002)

A pure-function test in `tokens.test.ts` will:
1. Mount a minimal component that reads `getComputedStyle(document.documentElement).getPropertyValue('--accent')` etc.
2. Compare to a table of expected values from this contract.
3. Repeat for `data-theme="dark"` and `data-theme="light"`.
4. Pass iff every token resolves to the documented value.

Any change to this contract requires a corresponding change to the handoff's
`tokens.css` first; the handoff is the source of truth and this document
mirrors it.
