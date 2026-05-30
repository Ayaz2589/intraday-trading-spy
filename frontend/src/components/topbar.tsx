import { RunActions } from "./run-actions";
import { PresetPicker } from "./preset-picker";
import { RiskKnobs } from "./risk-knobs";
import { ThemeToggle } from "./theme-toggle";
import { SegmentedControl } from "./segmented-control";
import { HelpTooltip } from "./help-tooltip";
import type { LayoutMode } from "@/lib/layout-mode";

const LAYOUT_OPTIONS = [
  { value: "overview", label: "Overview" },
  { value: "focus", label: "Chart focus" },
] as const;

interface TopbarProps {
  currentRunId: string | null;
  onRunChange: (runId: string) => void;
  onCleared?: () => void;
  layout?: LayoutMode;
  onLayoutChange?: (next: LayoutMode) => void;
}

// Topbar — sticky page chrome per design handoff.
// Spec FR-006 (segmented control + persistence), FR-019 (brand mark).
export function Topbar({
  currentRunId,
  onRunChange,
  onCleared,
  layout,
  onLayoutChange,
}: TopbarProps) {
  return (
    <header className="topbar topbar-blur">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ◑
        </span>
        <span className="brand-name">
          Intraday<span className="brand-dim">Builder</span>
        </span>
        <span className="brand-tick mono">SPY · 5m</span>
      </div>
      <div className="tb-actions">
        <RunActions
          currentRunId={currentRunId}
          onNewRun={onRunChange}
          onCleared={onCleared ?? (() => {})}
        />
        <span className="tb-div" />
        <PresetPicker onNewRun={onRunChange} />
        <RiskKnobs onNewRun={onRunChange} />
        {layout != null && onLayoutChange != null && (
          <>
            <span className="tb-div" />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <SegmentedControl
                options={LAYOUT_OPTIONS}
                value={layout}
                onChange={onLayoutChange}
                ariaLabel="Layout mode"
              />
              <HelpTooltip helpKey="layout_mode" />
            </span>
          </>
        )}
        <span className="tb-div" />
        <ThemeToggle />
      </div>
    </header>
  );
}
