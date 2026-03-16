import { useTopPropsForGame } from "@/hooks/use-top-props";
import { PropChip } from "./PropChip";
import { Zap } from "lucide-react";

interface Props {
  gameId: string;
}

export function QuickPropsRail({ gameId }: Props) {
  const { data: props } = useTopPropsForGame(gameId, 5);

  if (!props || props.length === 0) return null;

  return (
    <div
      className="mt-2 pt-2 border-t border-border/30"
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      <h4 className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 flex items-center gap-1">
        <Zap className="h-2.5 w-2.5 text-primary" />
        Quick Props
      </h4>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" style={{ touchAction: "pan-x" }}>
        {props.map(p => (
          <PropChip key={p.id} prop={p} size="compact" />
        ))}
      </div>
    </div>
  );
}
