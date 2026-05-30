import { useCallback, useEffect, useState } from "react";

export type LayoutMode = "overview" | "focus";

const STORAGE_KEY = "isb-layout";
const DEFAULT_LAYOUT: LayoutMode = "overview";

function getStoredLayout(): LayoutMode | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "overview" || v === "focus" ? v : null;
}

export function useLayoutMode() {
  const [layout, setLayoutState] = useState<LayoutMode>(
    () => getStoredLayout() ?? DEFAULT_LAYOUT,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, layout);
  }, [layout]);

  const setLayout = useCallback((next: LayoutMode) => {
    setLayoutState(next);
  }, []);

  const toggle = useCallback(() => {
    setLayoutState((current) =>
      current === "overview" ? "focus" : "overview",
    );
  }, []);

  return { layout, setLayout, toggle };
}
