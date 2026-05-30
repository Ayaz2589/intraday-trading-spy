import { useRef } from "react";

interface SegmentedControlOption<V extends string = string> {
  value: V;
  label: string;
}

interface SegmentedControlProps<V extends string = string> {
  options: readonly SegmentedControlOption<V>[];
  value: V;
  onChange: (next: V) => void;
  ariaLabel: string;
}

// SegmentedControl — ARIA radiogroup pattern per design handoff .seg styling.
// Spec ref: specs/004-design-system-adoption/contracts/components.md (SegmentedControl).
// Keyboard: ArrowLeft / ArrowRight move selection; Home / End jump to ends.
export function SegmentedControl<V extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<V>) {
  const containerRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    let nextIdx = idx;
    if (e.key === "ArrowLeft") nextIdx = Math.max(0, idx - 1);
    else if (e.key === "ArrowRight")
      nextIdx = Math.min(options.length - 1, idx + 1);
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = options.length - 1;
    const next = options[nextIdx];
    if (next && next.value !== value) {
      onChange(next.value);
      // Move focus to the next radio so keyboard nav feels continuous.
      const buttons = containerRef.current?.querySelectorAll(
        "button[role='radio']",
      );
      const target = buttons?.[nextIdx] as HTMLButtonElement | undefined;
      target?.focus();
    }
  };

  return (
    <div
      className="seg"
      role="radiogroup"
      aria-label={ariaLabel}
      ref={containerRef}
    >
      {options.map((opt, idx) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            className={isActive ? "seg-on" : ""}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
