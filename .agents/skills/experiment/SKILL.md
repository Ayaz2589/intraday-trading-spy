---
name: "experiment"
description: "Document a backtest experiment in EXPERIMENTS.md by comparing two runs."
argument-hint: "Optional: <baseline-run-id> <experiment-run-id>. Defaults to the two newest runs."
user-invocable: true
disable-model-invocation: false
---

# Experiment Skill

You are helping the user document a backtest experiment in
`EXPERIMENTS.md`. The point: build a durable record of every "I
changed X, here's what happened" comparison so the user has a
research notebook over time.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Execution Flow

### Step 1 — Identify the two runs to compare

The user may have passed `<baseline-run-id> <experiment-run-id>` as
arguments. If so, use those. Otherwise:

```bash
ls -1d backend/data/backtests/*/ 2>/dev/null | sort -r | head -2
```

The newest run is the **experiment**. The second-newest is the
**baseline**. If only one run exists, ask the user which run to
compare against (or to run a new baseline first).

If the user explicitly named runs that don't exist under
`backend/data/backtests/`, stop and tell them — don't guess.

### Step 2 — Read both runs' manifests + summaries

For each of {baseline, experiment}:
- `backend/data/backtests/<run-id>/run.yaml` — full config snapshot
- `backend/data/backtests/<run-id>/summary.json` — outcome metrics

Use the dedicated Read tool, not `cat`.

### Step 3 — Compute the config diff

Compare the two `config_snapshot` blocks. Surface only the fields that
**differ**. Format as a markdown table:

| Field | Baseline | Experiment |
|---|---|---|
| `risk.max_consecutive_losses` | 2 | 4 |

Use the dotted path notation (`risk.max_consecutive_losses`,
`strategy.vwap_pullback.target.risk_reward`, etc.) so the entry is
unambiguous.

If the configs are byte-identical, the experiment has no config delta
— stop and ask the user what the actual variable was (code change?
data change?). Don't write a no-op entry.

### Step 4 — Compute the outcome diff

From the two `summary.json` files, build a metrics table with at
least these fields:

- Total trades
- W / L
- Win rate
- Total R
- Max drawdown R
- Profit factor
- Total rejections (`rejected_signal_count`)
- Each entry in `rejection_breakdown` (sort by baseline count desc)

Show `Δ` (delta) for numeric fields. For categorical fields ("—" / "0"),
just show both values.

### Step 5 — Ask the user for the hypothesis and lesson

You CANNOT infer these from the data. Ask the user explicitly:

> **Hypothesis:** What did you predict would happen *before* running
> the experiment? Be honest — wrong predictions are the most valuable
> entries.
>
> **Lesson:** What does the outcome tell you? Was the hypothesis
> confirmed, refuted, or only partially? What changed in your
> intuition?

Wait for the user's responses before proceeding.

If the user is fuzzy on either, prompt them to be specific. A
hypothesis like "I'll see what happens" is not useful; push for a
directional prediction ("trades will go up", "win rate will drop",
"position-cap rejections should decrease").

### Step 6 — Determine the next experiment ID

Read the current `EXPERIMENTS.md`. Find all `## Experiment NNN`
headings. Take the max NNN. New ID = max + 1, zero-padded to 3 digits.

### Step 7 — Append the new entry

Append to `EXPERIMENTS.md` in this exact structure (matching the
existing entries):

```markdown
---

## Experiment NNN — YYYY-MM-DD — <short title>

### Hypothesis

<user's hypothesis verbatim, lightly cleaned up>

### Knobs changed

| Field | Baseline | Experiment |
|---|---|---|
| ... | ... | ... |

(Plus a one-line note listing the unchanged knobs so a reader can
confirm at a glance that only the listed knobs differ.)

### Run IDs

- **Baseline**: `<baseline-run-id>`
- **Experiment**: `<experiment-run-id>`

Both ran against `<data csv path>` (fingerprint `<sha256[:8]>`).
If fingerprints differ between the two runs, flag it loudly — the
experiment is comparing apples to oranges.

### Outcome

<full metrics table from Step 4>

### Lesson

<user's lesson, lightly cleaned up>
```

Insert the new entry **before** the trailing HTML comment block at
the bottom of the file. Don't touch any existing entries.

### Step 8 — Report

Tell the user the new entry was appended. Quote the ID (`Experiment
007`) and the title. Offer to git-commit the change (don't commit
without asking).

## Guardrails

- **Never edit historical entries.** If the user wants to revise an
  insight, write a new experiment that references the old one
  ("Updates Experiment 003: …").
- **Never invent numbers.** Every metric in the outcome table must
  come from one of the two `summary.json` files you read in Step 2.
- **Never invent runs.** If the user names a run id, verify the
  directory exists under `backend/data/backtests/` before reading.
- **Refuse to skip the hypothesis question.** The hypothesis is the
  scientific spine of the entry; without it, you're just summarizing
  numbers.
- **Quote `code_version` when it differs.** If the two runs were
  produced by different code versions (different commit shas in
  `run.yaml`), flag it — the comparison may conflate config changes
  with code changes.

## When NOT to use this skill

- The user hasn't run two backtests yet. Run them first.
- The two runs have identical configs AND identical code versions —
  there's nothing to compare (other than the deterministic fact
  that they should be byte-identical, which doesn't need recording).
- The user wants to delete or rewrite a prior experiment. Don't.
  Write a new entry that supersedes it instead.

## Inspiration

The format echoes a lab notebook. The
[`run.yaml`](../../../backend/data/backtests/) per-run snapshot is
the raw lab data; `EXPERIMENTS.md` is the *interpreted* notebook
sitting on top of it. Both are versioned in git so the user's
research history is auditable.
