# HelpTooltip Contract

Constitution principle VI (Educational UI) demands that every concept
the UI exposes has a `?` HelpTooltip with a plain-English explanation
answering: *what is this?*, *why does it matter?*, *how is the app
using it?*

This contract enumerates the concepts and the component API.

---

## Component API

```tsx
import { HelpTooltip } from "@/components/help-tooltip";

<HelpTooltip helpKey="vwap" />
// renders a small ? icon; popover shows
//   title:       "VWAP"
//   description: "Volume-weighted average price ..."
```

Props:

```typescript
type HelpTooltipProps = {
  helpKey: HelpContentKey;
  // The component looks up title + description from HELP_CONTENT.
  // No inline strings allowed — keeps the contract centralized.
};
```

Behavior:

- Renders a `?` icon (~14px) inline with adjacent text.
- Opens a popover on hover OR click (Radix UI primitive).
- The popover shows the `title` as a heading and `description` as a
  paragraph.
- Keyboard-accessible: Tab to focus, Enter/Space to open, Escape to
  close.
- Closes on outside click or focus loss.

---

## Concept contract list

Every key in this list MUST appear in `HELP_CONTENT` (from
`data-model.md`) and MUST be paired with at least one rendered
HelpTooltip somewhere on the Backtest Viewer page (`/runs/{run_id}`).

| Key | Where it appears in the UI |
|---|---|
| `vwap` | `SummaryMetricsCard` (when summary references VWAP-related metrics), `PriceChart` legend |
| `opening_range` | `PriceChart` legend (next to the OR band) |
| `r_multiple` | `SummaryMetricsCard` next to "Average R" and "Total R" |
| `profit_factor` | `SummaryMetricsCard` next to "Profit Factor" |
| `max_drawdown` | `SummaryMetricsCard` next to "Max Drawdown" |
| `win_rate` | `SummaryMetricsCard` next to "Win Rate" |
| `rejected_signal` | `RejectionBreakdownCard` heading |
| `position_cap` | `RejectionBreakdownCard` (when `position_value_exceeds_cap` appears in the breakdown) |
| `cooldown` | `RejectionBreakdownCard` (when `cooldown_active` appears) |
| `lockout` | `JournalTable` (rendered next to "LOCKOUT" status badges) |
| `force_flat_exit` | `JournalTable` (next to "FORCE_FLAT" status badges) |
| `take_profit` | `JournalTable` (next to "Take Profit" column header) |
| `stop_loss` | `JournalTable` (next to "Stop Loss" column header) |
| `risk_per_trade` | `JournalTable` (next to "Risk $" column header), `SummaryMetricsCard` |
| `daily_drawdown` | `SummaryMetricsCard` next to "Max Drawdown" (paired with `max_drawdown`) |

---

## Contract enforcement (test)

A Vitest test in `frontend/src/routes/run-viewer.test.tsx` MUST:

1. Render the full `run-viewer` route with a fixture run containing
   all relevant status types (executed, exited, rejected with various
   checks, force_flat, lockout) — so every conditional tooltip is
   rendered.
2. Iterate `Object.keys(HELP_CONTENT)` as the contract list.
3. For each key, assert at least one DOM element with attribute
   `data-help-key="{key}"` exists.

Implementation pattern: `HelpTooltip` renders the `?` icon with
`data-help-key={helpKey}`. The contract test queries for these
attributes.

---

## "Documentation pending" fallback

If a contributor adds a `HelpContentKey` to the union BUT forgets to
add it to `HELP_CONTENT`, TypeScript will refuse to compile (the
`Record<HelpContentKey, HelpContent>` type forces exhaustiveness).
This is the primary safeguard — there's no runtime "Documentation
pending" path in practice.

For belt-and-suspenders: the `HelpTooltip` component MAY render
"Documentation pending" if a runtime lookup fails. The contract test
will fail if this fallback ever renders, because the test asserts on
the *title* matching `HELP_CONTENT[key].title`, not just on the
attribute.

---

## Adding a new concept

1. Add the key to `HelpContentKey` (TypeScript will demand it in
   `HELP_CONTENT`).
2. Add the title + three-part description to `HELP_CONTENT`.
3. Add a row to the table above documenting where the tooltip is
   placed.
4. Render `<HelpTooltip helpKey="..." />` next to the relevant label
   in the appropriate component.
5. Run the test suite; the contract test should pass.
