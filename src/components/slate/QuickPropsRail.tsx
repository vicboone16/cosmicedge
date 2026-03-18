import { useTopPropsForGame } from "@/hooks/use-top-props";
import { PropChip, type LivePropContext } from "./PropChip";
import { Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  gameId: string;
  isLive?: boolean;
}

export function QuickPropsRail({ gameId, isLive }: Props) {
  const { data: props } = useTopPropsForGame(gameId, 5, isLive);

  // Fetch live_prop_state for this game when live
  const playerIds = (props || []).map(p => p.player_id).filter(Boolean);
  const { data: liveStates } = useQuery({
    queryKey: ["quick-props-live-state", gameId, playerIds.join(",")],
    queryFn: async () => {
      if (!playerIds.length) return {};
      const { data } = await supabase
        .from("live_prop_state")
        .select("*")
        .eq("game_id", gameId)
        .in("player_id", playerIds);
      const map: Record<string, Record<string, any>> = {};
      for (const r of data || []) {
        const key = `${r.player_id}:${r.prop_type}`;
        map[key] = r;
      }
      return map;
    },
    enabled: !!isLive && playerIds.length > 0,
    staleTime: 15_000,
    refetchInterval: isLive ? 30_000 : false,
  });

  if (!props || props.length === 0) return null;

  const getLiveContext = (p: { player_id: string; prop_type: string }): LivePropContext | null => {
    if (!liveStates) return null;
    return (liveStates[`${p.player_id}:${p.prop_type}`] as LivePropContext) ?? null;
  };

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
      <div
        className="flex gap-2 overflow-x-auto no-scrollbar pb-1"
        style={{ touchAction: "pan-x", WebkitOverflowScrolling: "touch" }}
      >
        {props.map(p => (
          <PropChip key={p.id} prop={p} size="compact" liveContext={getLiveContext(p)} />
        ))}
      </div>
    </div>
  );
}
