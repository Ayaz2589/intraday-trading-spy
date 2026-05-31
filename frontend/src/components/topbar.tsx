import { RunActions } from "./run-actions";
import { ConfigureRunMenu } from "./configure-run-menu";
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
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

// Topbar — sticky page chrome per design handoff.
// Spec FR-006 (segmented control + persistence), FR-019 (brand mark).
export function Topbar({
  currentRunId,
  onRunChange,
  onCleared,
  layout,
  onLayoutChange,
  sidebarCollapsed,
  onToggleSidebar,
}: TopbarProps) {
  return (
    <header className="topbar topbar-blur">
      <div className="brand">
        {onToggleSidebar && (
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? "Show runs sidebar" : "Hide runs sidebar"}
            aria-pressed={sidebarCollapsed ? "true" : "false"}
            title={sidebarCollapsed ? "Show runs sidebar" : "Hide runs sidebar"}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
        )}
        <span className="brand-mark" aria-hidden>
          ◑
        </span>
        <span className="brand-name">
          Intraday<span className="brand-dim">Builder</span>
        </span>
        <span className="brand-tick mono">SPY · 5m</span>
      </div>
      <div className="tb-actions">
        <ConfigureRunMenu onNewRun={onRunChange} />
        <span className="tb-div" />
        <RunActions
          currentRunId={currentRunId}
          onCleared={onCleared ?? (() => {})}
        />
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
