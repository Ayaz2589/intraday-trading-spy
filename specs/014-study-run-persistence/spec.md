# Feature Specification: Study Child-Run Persistence + Drill-Down

**Feature Branch**: `014-study-run-persistence`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Persist each validation study's per-window / per-grid-point evaluation as a real, drillable run, closing the run/study seam; redesign the study detail page with drill-down. Approved brainstorm design: docs/superpowers/specs/2026-06-04-study-child-run-persistence-design.md; original seed: docs/research-tooling-uplift.md §5."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Drill into a study's evaluations (Priority: P1)

An operator runs a walk-forward (or sensitivity, or lockbox) study. Every
per-window / per-grid-point evaluation the study performs is saved as a real,
first-class run — the same kind of run a standalone backtest produces, with its
trades, signals, journal, chart, and config snapshot. From the study's results,
the operator opens any window's run to inspect *why* that window performed the
way it did, and can run a significance test on it from the run's detail page.

**Why this priority**: This is the core seam-closing capability — without
persisted children, study results are unexplainable aggregates: no trades to
inspect, no journal to read, and significance testing 404s on placeholder run
ids. Everything else in this feature builds on these persisted runs existing.

**Independent Test**: Run a small walk-forward study; verify each window's
in-sample and out-of-sample evaluation exists as a stored run tagged with the
study, segment, and window index; open one and see its trades/journal; run a
significance test on it.

**Acceptance Scenarios**:

1. **Given** a configured walk-forward study, **When** it finishes, **Then**
   every window's in-sample and out-of-sample evaluation is stored as a run
   tagged with that study, its segment, and its window index, and the study's
   result references each child's real run id.
2. **Given** a sensitivity study over a parameter grid, **When** it finishes,
   **Then** every grid-point evaluation is stored as a run tagged with the
   study, and the surface's points reference their real run ids.
3. **Given** a lockbox one-shot evaluation, **When** it completes, **Then** its
   run is stored (segment "lockbox") and the lockbox ledger references it.
4. **Given** an evaluation identical to an already-stored finished run (same
   strategy, parameters, symbol, and date range), **When** the study evaluates
   it, **Then** the existing run is referenced instead of storing a duplicate.
5. **Given** a child-run save fails mid-study, **When** the study continues,
   **Then** the study still finishes with aggregate results identical to what
   they would have been without persistence, and only that evaluation is marked
   not-drillable.
6. **Given** a stored child run, **When** the operator opens its run detail
   page, **Then** a badge shows which study/segment/window it belongs to and
   links back to the study.

---

### User Story 2 - Redesigned study detail page with drill-down (Priority: P2)

The operator opens a study's detail page and sees it in the same card design
language as the rest of the validation surface: a header (study kind + config
name, status, re-run action), a row of stat cards summarizing the study, and —
for walk-forward — expandable window rows: collapsed rows show each window's
out-of-sample verdict; expanding a row reveals the in-sample / out-of-sample
detail pair, each with a "View run →" link to that evaluation's run page. For
sensitivity, the surface plot is joined by a points table whose rows link to
their runs.

**Why this priority**: The persistence (US1) is only useful if the operator can
navigate it; this page is the navigation surface. It also completes the
validation-surface redesign (this page was the deferred piece).

**Independent Test**: Open a finished post-014 walk-forward study's detail
page; verify stat cards, expandable rows, and working "View run →" links;
verify an old (pre-014) study renders the same page with links hidden.

**Acceptance Scenarios**:

1. **Given** a finished post-014 walk-forward study, **When** the operator opens
   its detail page, **Then** they see header + stat cards (mean OOS expectancy,
   IS→OOS gap, window count, OOS trades) and one expandable row per window.
2. **Given** an expanded window row, **When** the operator clicks "View run →"
   on the in-sample or out-of-sample side, **Then** they land on that
   evaluation's run detail page.
3. **Given** a finished sensitivity study, **When** the operator opens its
   detail page, **Then** they see the surface plot plus a points table (metric,
   coordinates, trade count) where each drillable point links to its run.
4. **Given** a pre-014 study (children never persisted) or a window whose save
   failed, **When** its detail page renders, **Then** no "View run →" link is
   shown for the affected windows/points.
5. **Given** any new concept on the page (child run, IS/OOS drill-down,
   re-run), **When** the operator hovers its `?` tooltip, **Then** the tooltip
   explains what it is, why it matters, and how the app uses it.

---

### User Story 3 - Re-run an old study (Priority: P3)

The operator has studies that predate child-run persistence (their evaluations
were never saved). A "Re-run study" action — on the studies list rows and the
study detail page — clones the old study's kind and parameters into a fresh
study, which executes with full child persistence. The old study is untouched.

**Why this priority**: It is the (deliberate) path to drillability for existing
studies without a one-off backfill, and a generally useful affordance; but it
depends on US1 and is valuable only after it.

**Independent Test**: Re-run a pre-014 study; verify a new study is created
with identical parameters and every window of the new study is drillable.

**Acceptance Scenarios**:

1. **Given** any existing study, **When** the operator clicks "Re-run study",
   **Then** a new study starts with the same kind, parameters, and config
   selection, and appears in the studies list; the original is unchanged.
2. **Given** a study whose named config has since been deleted, **When** the
   operator re-runs it, **Then** the existing "config not found" error is shown
   and no new study is created.
3. **Given** a re-run request for a study id that does not exist, **Then** the
   request fails with a not-found error.

---

### User Story 4 - Runs list stays clean (Priority: P3)

A single study can produce tens to hundreds of child runs. The main runs
list/sidebar shows only standalone runs; study children are reached through
their study, never listed alongside normal backtests.

**Why this priority**: Without it the runs list floods immediately, but it is a
small filter relative to US1.

**Independent Test**: Run a study, then open the runs list; verify no child
runs appear while standalone runs still do.

**Acceptance Scenarios**:

1. **Given** a finished study with stored children, **When** the operator opens
   the main runs list, **Then** no study children appear in it.
2. **Given** a standalone run that a study linked to via dedup (it was never
   created by a study), **When** the runs list renders, **Then** that run is
   still listed (it is not a child).

---

### Edge Cases

- A child-run save fails mid-study → the study continues and finishes; the
  failed evaluation is marked not-drillable; aggregate results are unaffected.
- An evaluation duplicates an already-stored finished run → the existing run is
  referenced (no duplicate row); it counts as drillable.
- A study is deleted → its child runs are removed with it (existing cascade);
  dedup-linked runs that the study merely referenced are not deleted.
- An old (pre-014) study's stored result lacks drillability information → all
  its windows/points render without links.
- Re-running a study whose config was deleted → config-not-found error; no new
  study row.
- The lockbox ledger entry predating 014 has no linked run → the lockbox card
  simply shows no run link for that entry.
- A sensitivity study with hundreds of grid points → children are saved one per
  evaluation as the study progresses; progress reporting behaves exactly as
  today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The study orchestrator MUST store every walk-forward window
  evaluation (both in-sample and out-of-sample) as a first-class run tagged
  with its study id, segment, and window index, saved as each evaluation
  completes (not batched at study end).
- **FR-002**: The study orchestrator MUST store every sensitivity grid-point
  evaluation as a first-class run tagged with its study id, with the evaluated
  parameter overrides captured in the run's config snapshot.
- **FR-003**: The lockbox one-shot evaluation MUST be stored as a run with
  segment "lockbox", and the lockbox ledger MUST reference that run.
- **FR-004**: Every stored child run MUST carry the exact effective
  configuration used for that evaluation (config snapshot) and a content-based
  data fingerprint, exactly as standalone runs do.
- **FR-005**: When an evaluation is identical to an already-stored finished run
  (same strategy, effective parameters, symbol, and date range), the system
  MUST reference the existing run instead of storing a duplicate.
- **FR-006**: A child-run storage failure MUST NOT fail or alter the study: the
  study completes, its aggregate results are identical to a run without
  persistence, and only the affected evaluation is marked not-drillable.
- **FR-007**: The stored study result MUST self-describe, per window/point,
  whether its run is drillable; the UI MUST render "View run →" links only for
  drillable evaluations (uniformly hiding links for pre-014 studies and failed
  saves).
- **FR-008**: The main runs list MUST exclude study children; standalone runs
  (including runs a study merely linked to via dedup) remain listed.
- **FR-009**: The run detail page of a child run MUST show its study
  membership ("Part of study — window N · segment") linking back to that
  study's detail page.
- **FR-010**: Operators MUST be able to re-run any study: a re-run clones the
  original's kind, parameters, and config selection into a brand-new study
  (full child persistence applies); unknown study ids fail with not-found, and
  a deleted config surfaces the existing config-not-found error. The action is
  available on studies list rows and the study detail page.
- **FR-011**: The study detail page MUST be redesigned in the established
  validation card language: header (kind + config name, parameter subtitle,
  status badge, re-run action), stat cards (walk-forward: mean OOS expectancy,
  IS→OOS gap, windows, OOS trades; sensitivity: metric, point count, best
  point), expandable window rows (collapsed: OOS verdict, gap, trade count,
  low-confidence flag; expanded: IS/OOS detail pair each with its run link),
  sensitivity surface plus points table with run links, and lockbox run link.
- **FR-012**: Every new UI concept (child run, IS/OOS drill-down, re-run study)
  MUST ship with a `?` help tooltip answering: what is this, why does it
  matter, how is the app using it (Constitution VI).
- **FR-013**: Child runs MUST be journaled exactly as standalone runs are —
  executions, rejections, skipped setups, force-flat exits — via the same
  storage path (Constitution VII).

### Key Entities

- **Study**: an existing validation study (walk-forward, sensitivity, or
  lockbox context); now the parent of zero or more child runs; its stored
  result references each evaluation's run id and drillability.
- **Child run**: a standard run created by a study evaluation; identical in
  shape to a standalone run plus its study tag (study id, segment, window
  index); hidden from the main runs list; reachable from its study and linking
  back to it.
- **Lockbox ledger entry**: the record of a lockbox attempt; now references the
  run produced by that one-shot evaluation.
- **Re-run**: a new study created from an existing study's kind + parameters;
  no link to the original beyond shared parameter values.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a finished post-014 study's detail page, an operator reaches
  any window's or grid point's full run detail (trades, journal, chart) in at
  most 2 clicks.
- **SC-002**: 100% of a new study's evaluations are stored (or deduplicated to
  an existing run) when storage is healthy; a storage failure never fails the
  study.
- **SC-003**: A study's aggregate results (window metrics, means, gaps,
  surface values) are identical with child persistence enabled vs. disabled.
- **SC-004**: The main runs list contains zero study children after running
  studies that produce 100+ evaluations.
- **SC-005**: Re-running a pre-014 study yields a new study in which every
  window/point is drillable.
- **SC-006**: A significance test is reachable for any drillable window via its
  run's detail page with no dead links (no 404s).
- **SC-007**: An identical evaluation repeated across two studies results in
  exactly one stored run referenced by both.

## Assumptions

- The storage schema already supports child runs (study id / segment / window
  index columns, lockbox ledger run reference, and run spec-hash dedup exist
  from features 009–012); this feature requires **zero schema migrations**.
- Per-evaluation sequential storage is acceptable for study sizes of tens to
  hundreds of evaluations (it matches the existing per-evaluation progress
  update cadence).
- Pre-014 studies are left as-is; "Re-run study" is the deliberate path to a
  drillable version (no automated backfill).
- The approved brainstorm design
  (docs/superpowers/specs/2026-06-04-study-child-run-persistence-design.md)
  governs implementation choices: in-memory payload builder shared with the
  existing file-based path (parity-tested), per-evaluation push, a per-
  evaluation drillability flag in the stored result, and the expandable-row
  detail page treatment.
- Significance testing needs no new UI: child runs make the existing run-detail
  significance panel reachable for study windows.
- Out of scope: cross-run insights/aggregation and retention (Feature 015),
  research/learn UI lanes (016), automated backfill of old studies' children,
  and inline significance UI on the study page.
