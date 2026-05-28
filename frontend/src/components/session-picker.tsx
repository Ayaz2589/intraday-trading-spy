import { Button } from "@/components/ui/button";

export function SessionPicker({
  sessions,
  selected,
  onChange,
}: {
  sessions: string[];
  selected: string;
  onChange: (session: string) => void;
}) {
  if (sessions.length <= 1) return null;
  return (
    <div className="flex gap-1 flex-wrap">
      {sessions.map((s) => (
        <Button
          key={s}
          size="sm"
          variant={s === selected ? "default" : "outline"}
          onClick={() => onChange(s)}
        >
          {s}
        </Button>
      ))}
    </div>
  );
}
