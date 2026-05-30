import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HELP_CONTENT, type HelpContentKey } from "./help-content";

// HelpTooltip — restyled trigger using the design's .info-dot class.
// Spec ref: specs/004-design-system-adoption/spec.md FR-005 (HelpTooltip
// preservation, Principle VI educational layer). Content is unchanged from
// pre-redesign; only the trigger visual updates.
export function HelpTooltip({ helpKey }: { helpKey: HelpContentKey }) {
  const content = HELP_CONTENT[helpKey];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="info-dot"
          data-help-key={helpKey}
          aria-label={`Help: ${content.title}`}
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-pop)",
          padding: "var(--sp-4) var(--sp-5)",
          width: 320,
          color: "var(--text)",
        }}
      >
        <h4
          style={{
            fontSize: "var(--fs-base)",
            fontWeight: 700,
            margin: 0,
            marginBottom: 6,
          }}
        >
          {content.title}
        </h4>
        <p
          style={{
            fontSize: "var(--fs-sm)",
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          {content.description}
        </p>
      </PopoverContent>
    </Popover>
  );
}
