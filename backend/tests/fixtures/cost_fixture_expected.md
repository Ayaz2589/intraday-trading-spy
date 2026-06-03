# Cost fixture — expected values (Feature 010, SC-002)

The cost tests **reuse the existing golden fixture** `tests/fixtures/spy_5m_sample.csv`
rather than a redundant CSV. With the default config that fixture produces a
deterministic, hand-checkable scenario:

- **3 trades**, each sized to **quantity = 44 shares** (see `test_golden_exit_sequence`).
- Exit sequence: 1 target (+2R), 2 stops (−1R, −1R) → net **0R** at zero cost.

## Exact cost arithmetic

With `broker.fees_per_share = 0.0` and `broker.slippage_per_share = 0.01`,
costs are adverse on **both** entry and exit:

| Quantity | Per-trade slippage `= slip × qty × 2` | Per-trade fees `= fee × qty × 2` |
|---|---|---|
| 44 | `0.01 × 44 × 2 = 0.88` | `0.00 × 44 × 2 = 0.00` |

Across the 3 trades:

- **Total slippage cost** = `0.88 × 3 = 2.64`
- **Total fees** = `0.00`
- **Total cost** = `2.64`

## Assertions (relational + exact)

1. `total_fees_dollars == 0.00`
2. `total_slippage_dollars == 2.64` (== `0.01 × 44 × 2 × 3`)
3. `total_net_pnl_dollars == total_gross_pnl − 2.64`
4. **SC-001**: `zero_cost_total_pnl − nonzero_cost_total_pnl == 2.64`
5. **SC-002**: net PnL equals the analytically expected value above (no
   hidden/forgotten deduction).

A zero-cost run is obtained by overriding `broker.slippage_per_share` and
`broker.fees_per_share` to `0.0`.

> If the golden fixture's trade count or sizing ever changes, these numbers
> change with it — update them together with `test_golden_exit_sequence`.
