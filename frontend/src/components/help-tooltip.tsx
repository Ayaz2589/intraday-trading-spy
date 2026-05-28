import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { HELP_CONTENT, type HelpContentKey } from "./help-content";

export function HelpTooltip({ helpKey }: { helpKey: HelpContentKey }) {
  const content = HELP_CONTENT[helpKey];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 ml-1 inline-flex"
          data-help-key={helpKey}
          aria-label={`Help: ${content.title}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <h4 className="font-semibold mb-2">{content.title}</h4>
        <p className="text-sm text-gray-600">{content.description}</p>
      </PopoverContent>
    </Popover>
  );
}
