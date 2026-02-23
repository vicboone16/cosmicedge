import { cn } from "@/lib/utils";
import type { SelectedModel } from "@/hooks/use-nebula-overlay";

interface Props {
  selected: SelectedModel;
  onChange: (m: SelectedModel) => void;
}

export function ModelSelectorBar({ selected, onChange }: Props) {
  const options: { value: SelectedModel; label: string }[] = [
    { value: "nebula_v1", label: "NebulaProp v1" },
    { value: "nebula_v1_transitlift", label: "NebulaProp v1 + TransitLift" },
  ];

  return (
    <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5 w-full">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors text-center",
            selected === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
