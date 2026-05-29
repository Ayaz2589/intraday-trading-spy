# Backtest config presets

Each YAML in this directory is a complete, self-contained backtest
config — pick one with `make backtest CONFIG=config/presets/<name>.yaml`.

The defaults in `../config.yaml` are the **realistic baseline** —
$25k account, 0.1% risk per trade, 100% position cap, 2:1 R/R. Use
that for honest research.

Presets here are deliberately *off-baseline* — useful for specific
hypothesis tests or demos, **not** for studying live edge. Each
preset's header comment explains its purpose and what it's NOT
suitable for.

## How to add a preset

1. Copy `../config.yaml` to `presets/<name>.yaml`.
2. Edit only the knobs you're changing — keep everything else identical.
3. Add a leading comment block explaining *why* this preset exists
   (what hypothesis it supports, or what it's demonstrating).
4. Document it in this README and the project root [`EXPERIMENTS.md`](../../../EXPERIMENTS.md)
   if you use it for a real experiment.

## Bundled presets

- [`demo.yaml`](./demo.yaml) — permissive cap (1500%). Makes the
  strategy fire trades reliably so you can see the engine end-to-end.
  **Not for research** — the cap is artificially loose.
- [`aggressive.yaml`](./aggressive.yaml) — 1% risk per trade,
  max_consecutive_losses=4, 3:1 R/R. Tests "what if I run a more
  aggressive risk profile?" — the cap will mostly still bind (see
  [EXPERIMENTS.md Experiment 002](../../../EXPERIMENTS.md)), so most
  signals will get rejected.
