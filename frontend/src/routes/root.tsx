import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { fetchRuns } from "@/api/legacy-client";
import { AppShell } from "@/components/app-shell";
import { Topbar } from "@/components/topbar";
import { RunsSidebar } from "@/components/runs-sidebar";
import { useSidebarMode } from "@/lib/sidebar-mode";
import type { RunSummaryView } from "@/api/legacy-types";

export function Root() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummaryView[] | null>(null);
  const { mode: sidebarMode, toggle: toggleSidebar } = useSidebarMode();
  const collapsed = sidebarMode === "collapsed";
  useEffect(() => {
    const ctrl = new AbortController();
    fetchRuns({ signal: ctrl.signal })
      .then(setRuns)
      .catch(() => setRuns([]));
    return () => ctrl.abort();
  }, []);

  if (runs == null) return <div className="main-scroll">Loading…</div>;
  if (runs.length === 0) {
    return (
      <AppShell
        sidebar={<RunsSidebar runs={[]} selectedRunId={null} />}
        sidebarCollapsed={collapsed}
        topbar={
          <Topbar
            currentRunId={null}
            onRunChange={(id) => navigate(`/runs/${id}`)}
            onCleared={() => setRuns([])}
            sidebarCollapsed={collapsed}
            onToggleSidebar={toggleSidebar}
          />
        }
      >
        <div className="content">
          <div>
            <h1
              style={{
                fontSize: "var(--fs-xl)",
                fontWeight: 700,
                letterSpacing: "-0.01em",
                margin: 0,
                marginBottom: "var(--sp-3)",
              }}
            >
              No backtest runs yet
            </h1>
            <p style={{ color: "var(--text-muted)", margin: 0 }}>
              Click <span style={{ fontWeight: 700 }}>New backtest</span> above
              to queue your first run, or use the CLI shortcut shown in the
              sidebar.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }
  return <Navigate to={`/runs/${runs[0].run_id}`} replace />;
}
