# Contract — Entry-Window Knobs (020)

## Strategy contract

`VwapPullbackLong.evaluate(bar, snap, minutes_since_open) -> Signal | WindowSkip | None`

- `None` — no valid setup on this bar (unchanged semantics).
- `Signal` — valid setup inside the window (unchanged shape).
- `WindowSkip` — a setup that satisfies EVERY detection rule but falls
  outside `[start_minutes_after_open, end_minutes_after_open)`; carries the
  window values and a human reason. The strategy never journals or orders.

Engine obligation: a `WindowSkip` becomes exactly one `SKIPPED_WINDOW`
journal row (full indicator context) and nothing else — no risk call, no
position, no state change.

Invariants (tested):
- Defaults (0, 360) ⇒ `evaluate` never returns `WindowSkip` during the
  regular session ⇒ byte-identical runs (SC-001).
- The window can only narrow: OR-completion and `no_new_trades_after`
  still bind regardless of window values (scenarios 4–5).
- start ≥ end is unrepresentable: config validation rejects it (FR-004).

## Registry contract

Both knobs behave indistinguishably from the existing eight through:
`sanitize_changes` (off-bounds → dropped), `registry_prompt_section`
(rendered from the registry), CLI `study-sens` (path or unique leaf),
recommendation candidates, draft-config creation, campaign families
(`family` = the knob path), and the tightened bar.

## UI contract

- Config editor: two Signal-group fields, default hints "default 0 /
  default 360", off-default dot + accent border, `entry_window` tooltip.
- Config rows: off-default window values appear as accent diff chips and
  count toward "N off default".
- Sensitivity launcher: two new pills with the default grids.
- Docs glossary: renders the new concept automatically from HELP_CONTENT.
