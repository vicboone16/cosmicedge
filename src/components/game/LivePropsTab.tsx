import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Zap, TrendingUp, TrendingDown, Bookmark, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPropLabel, getEdgeTier, type TopProp } from "@/hooks/use-top-props";

interface Props {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  isLive?: boolean;
}

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function LivePropsTab({ gameId, homeAbbr, awayAbbr, isLive }: Props) {
  const { data: overlays, isLoading } = useQuery({
    queryKey: ["live-props-tab", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("np_v_prop_overlay" as any)
        .select("*")
        .eq("game_id", gameId)
        .order("edge_score_v11", { ascending: false, nullsFirst: false } as any)
        .order("edge_score", { ascending: false })
        .limit(50);
      return (data || []) as unknown as TopProp[];
    },
    staleTime: 30_000,
    refetchInterval: isLive ? 30_000 : false,
  });

  const { hotEdges, trendAlerts, newEdges } = useMemo(() => {
    if (!overlays) return { hotEdges: [], trendAlerts: [], newEdges: [] };
    const sorted = [...overlays];
    return {
      hotEdges: sorted.slice(0, 6),
      trendAlerts: sorted.filter(o => o.streak != null && (o.streak ?? 0) >= 3).slice(0, 5),
      newEdges: sorted.filter(o => (o.edge_score_v11 ?? o.edge_score) >= 60).slice(0, 5),
    };
  }, [overlays]);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <Zap className="h-6 w-6 text-primary mx-auto mb-2 animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading live prop intelligence...</p>
      </div>
    );
  }

  if (!overlays || overlays.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm font-semibold text-foreground">No strong live edges yet</p>
        <p className="text-xs text-muted-foreground">Check back when the game is active for real-time prop intelligence</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {isLive && (
          <span className="flex items-center gap-1 text-cosmic-green font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse-glow" />
            Live
          </span>
        )}
        <span>Real-time projections and live prop edges</span>
        <span className="ml-auto tabular-nums">{overlays.length} props tracked</span>
      </div>

      {/* Hot Live Edges */}
      {hotEdges.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-cosmic-gold" />
            Hot Live Edges
          </h3>
          <div className="space-y-2">
            {hotEdges.map(prop => (
              <LivePropCard key={prop.id} prop={prop} />
            ))}
          </div>
        </section>
      )}

      {/* Live Trend Alerts */}
      {trendAlerts.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Live Trend Alerts
          </h3>
          <div className="space-y-1.5">
            {trendAlerts.map(prop => {
              const propLabel = getPropLabel(prop.prop_type);
              return (
                <div key={prop.id} className="cosmic-card rounded-lg px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-semibold text-foreground truncate">{prop.player_name}</span>
                    <span className="text-[9px] text-muted-foreground uppercase">{propLabel}</span>
                  </div>
                  <span className="text-[10px] text-cosmic-green font-semibold shrink-0">
                    {prop.streak}× streak
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* New Edges Detected */}
      {newEdges.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Edge Detected
          </h3>
          <div className="space-y-1.5">
            {newEdges.map(prop => {
              const propLabel = getPropLabel(prop.prop_type);
              const diff = prop.mu - (prop.line ?? 0);
              const sign = diff >= 0 ? "+" : "";
              return (
                <div key={prop.id} className="cosmic-card rounded-lg px-3 py-2 flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-foreground">
                      {prop.player_name?.split(" ").pop()} {propLabel} line {prop.line}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-1">
                      model {prop.mu?.toFixed(1)} ({sign}{diff.toFixed(1)})
                    </span>
                  </div>
                  <Badge variant="outline" className={cn("text-[8px] px-1.5 py-0 h-3.5 font-bold", getEdgeTier(prop.edge_score_v11 ?? prop.edge_score).className)}>
                    {(prop.edge_score_v11 ?? prop.edge_score).toFixed(0)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function LivePropCard({ prop }: { prop: TopProp }) {
  const edgeScore = prop.edge_score_v11 ?? prop.edge_score;
  const tier = getEdgeTier(edgeScore);
  const isOver = prop.side === "over" || prop.side == null;
  const propLabel = getPropLabel(prop.prop_type);
  const diff = prop.mu - (prop.line ?? 0);

  return (
    <div className={cn(
      "cosmic-card rounded-xl p-3 space-y-2",
      edgeScore >= 70 && "border-cosmic-green/30 shadow-[0_0_12px_-4px] shadow-cosmic-green/20"
    )}>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-foreground truncate block">{prop.player_name}</span>
          <span className="text-[10px] text-muted-foreground">{prop.player_team}</span>
        </div>
        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 font-bold", tier.className)}>
          {edgeScore.toFixed(0)} {tier.label}
        </Badge>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">{propLabel}</span>
          <span className="text-sm font-bold tabular-nums">{prop.line != null ? Number(prop.line) : "—"}</span>
          <span className="text-[10px] text-muted-foreground">→</span>
          <span className="text-sm font-bold tabular-nums text-foreground">{prop.mu?.toFixed(1)}</span>
        </div>
        <span className={cn(
          "text-xs font-semibold flex items-center gap-0.5",
          isOver ? "text-cosmic-green" : "text-cosmic-red"
        )}>
          {isOver ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {isOver ? "Over" : "Under"}
          <span className="text-muted-foreground ml-1 tabular-nums">{formatOdds(prop.odds)}</span>
        </span>
      </div>

      {/* Mini edge visualization */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", tier.className.includes("green") ? "bg-cosmic-green" : tier.className.includes("primary") ? "bg-primary" : "bg-muted-foreground")}
            style={{ width: `${Math.min(100, edgeScore)}%` }}
          />
        </div>
        <span className="text-[9px] text-muted-foreground tabular-nums">{edgeScore.toFixed(0)}/100</span>
      </div>

      {prop.one_liner && (
        <p className="text-[10px] text-muted-foreground italic">{prop.one_liner}</p>
      )}

      {/* Signal stack */}
      <div className="flex gap-1 flex-wrap">
        {prop.streak != null && prop.streak >= 3 && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold bg-cosmic-green/10 text-cosmic-green">Over Heater</span>
        )}
        {prop.hit_l10 != null && prop.hit_l10 >= 0.7 && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold bg-primary/10 text-primary">Momentum</span>
        )}
        {edgeScore >= 65 && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold bg-blue-400/10 text-blue-400">Strong Signal</span>
        )}
      </div>
    </div>
  );
}
