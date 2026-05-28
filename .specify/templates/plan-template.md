# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]

**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]

**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]

**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]

**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]

**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]

**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.0.0). For each
principle below, state which parts of this feature touch it and prove
non-violation. If a tension exists, defer the justification to the
**Complexity Tracking** table at the bottom of this plan.

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | [yes / no] | [e.g., config pins `market.symbol: SPY`; bar/signal/order validation rejects others] |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | [yes / no] | [e.g., `Direction` enum exposes only LONG; no ML/HMM modules introduced] |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | [yes / no] | [e.g., broker call site checks `RiskDecision.approved`; stop+target required; limits in config] |
| IV | Test-First for Strategy & Risk (NON-NEGOTIABLE) | [yes / no] | [e.g., failing tests written before code for VWAP / OR / risk rejections; CI gates coverage] |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | [yes / no] | [e.g., mode defaults to backtest/paper; `live_auto_enabled: false`; no live code path enabled] |
| VI | Educational UI: Every Concept Is Explained | [yes / no] | [e.g., every new UI label paired with `HelpTooltip`; rejected signals shown with reason] |
| VII | Journal Everything | [yes / no] | [e.g., executed trades, rejections, force-flat exits all routed through `journal/logger.py`] |

**Engineering standards check:**

- [ ] Timezone is `America/New_York` for any new time logic; `clock.py` is consulted, not reimplemented.
- [ ] Any new limits, thresholds, or session times added live in `backend/config/config.yaml`, not in source.
- [ ] Backend code is Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [ ] Frontend code is React + TypeScript + Vite + Tailwind.

If any principle is violated and not justified in **Complexity Tracking**,
this plan cannot advance to `speckit-tasks`.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
