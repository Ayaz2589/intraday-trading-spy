import type { ReactNode } from "react";

interface AppShellProps {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
}

// AppShell — CSS-grid page chrome per the design handoff.
// Spec ref: specs/004-design-system-adoption/spec.md US1 / FR-001.
// Layout: 252px sidebar | 1fr main, height: 100vh, no page scroll —
// the main-scroll region is the only overflow-y:auto.
//
// Responsive collapse is handled in globals.css:
//  - ≤1180px: stat-row falls back to 2 columns (Rejections spans both)
//  - ≤860px: sidebar hidden, single-column layout
export function AppShell({ sidebar, topbar, children }: AppShellProps) {
  return (
    <div className="app">
      <aside className="sidebar" role="complementary">
        {sidebar}
      </aside>
      <main className="main" role="main">
        {topbar}
        <div className="main-scroll">{children}</div>
      </main>
    </div>
  );
}
