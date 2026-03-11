import { Flame } from "lucide-react";
import { useTopPropsToday } from "@/hooks/use-top-props";
import { PropChip } from "./PropChip";

export function TrendingPlaysStrip() {
  const { data: props, isLoading } = useTopPropsToday(10);

  if (isLoading || !props || props.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
        <Flame className="h-3.5 w-3.5 text-cosmic-gold" />
        Trending Plays
      </h2>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {props.map(p => (
          <PropChip key={p.id} prop={p} size="compact" />
        ))}
      </div>
    </section>
  );
}
