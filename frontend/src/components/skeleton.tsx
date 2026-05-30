import type { CSSProperties } from "react";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: "xs" | "sm" | "md" | "lg" | "pill" | "none";
  className?: string;
  style?: CSSProperties;
}

const RADII: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  xs: "var(--r-xs)",
  sm: "var(--r-sm)",
  md: "var(--r-md)",
  lg: "var(--r-lg)",
  pill: "var(--r-pill)",
  none: "0",
};

export function Skeleton({
  width = "100%",
  height = 14,
  rounded = "md",
  className,
  style,
}: SkeletonProps) {
  const sizeStyle: CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
    borderRadius: RADII[rounded],
    ...style,
  };
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={className ? `skeleton ${className}` : "skeleton"}
      style={sizeStyle}
    />
  );
}
