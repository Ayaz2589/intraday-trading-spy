import { useCallback, useEffect, useState } from "react";

export type SidebarMode = "expanded" | "collapsed";

const STORAGE_KEY = "isb-sidebar";
const DEFAULT_MODE: SidebarMode = "expanded";

function getStoredMode(): SidebarMode | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "expanded" || v === "collapsed" ? v : null;
}

export function useSidebarMode() {
  const [mode, setModeState] = useState<SidebarMode>(
    () => getStoredMode() ?? DEFAULT_MODE,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((next: SidebarMode) => {
    setModeState(next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((current) =>
      current === "expanded" ? "collapsed" : "expanded",
    );
  }, []);

  return { mode, setMode, toggle };
}
