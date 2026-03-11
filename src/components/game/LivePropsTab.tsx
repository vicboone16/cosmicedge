import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Zap, TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPropLabel, getEdgeTier, type TopProp } from "@/hooks/use-top-props";

interface Props {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  isLive?: boolean;
}

interface RawLiveProp {
  id: string;
  player_name: string;
  player_id: string;
  prop_type: string;
  line_value: number;
  over_odds: number | null;
  under_odds: number | null;
  vendor: string;
}

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function LivePropsTab({ gameId, homeAbbr, awayAbbr, isLive }: Props) {
  // Primary: overlay with model predictions
  const { data: overlays, isLoading: overlayLoading } = useQuery({
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

  // Fallback: raw live props when no model predictions exist
  const needsFallback = !overlayLoading && (!overlays || overlays.length === 0);
  const { data: rawProps, isLoading: rawLoading } = useQuery({
    queryKey: ["live-props-raw", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nba_player_props_live" as any)
        .select("id,player_name,player_id,prop_type,line_value,over_odds,under_odds,vendor")
        .eq("game_key", gameId)
        .eq("market_type", "over_under")
        .order("prop_type", { ascending: true });

      const rows = (data || []) as unknown as RawLiveProp[];

      // Resolve "Player XXXX" names from bdl_player_cache
      const needsResolve = rows.filter(r => r.player_name?.startsWith("Player "));
      if (needsResolve.length > 0) {
        const bdlIds = [...new Set(needsResolve.map(r => r.player_id))];
        const { data: cached } = await supabase
          .from("bdl_player_cache" as any)
          .select("bdl_id,full_name")
          .in("bdl_id", bdlIds);
        const nameMap = new Map((cached || []).map((c: any) => [c.bdl_id, c.full_name?.trim()]));
        for (const r of rows) {
          if (r.player_name?.startsWith("Player ") && nameMap.has(r.player_id)) {
            r.player_name = nameMap.get(r.player_id)!;
          }
        }
      }

      // Deduplicate: keep best odds per player+prop_type (lowest line or first seen)
      const seen = new Map<string, RawLiveProp>();
      for (const r of rows) {
        const key = `${r.player_id}|${r.prop_type}|${r.line_value}`;
        if (!seen.has(key)) seen.set(key, r);
      }
      return [...seen.values()];
    },
    enabled: needsFallback,
    staleTime: 30_000,
    refetchInterval: isLive ? 30_000 : false,
  });

  const isLoading = overlayLoading || (needsFallback && rawLoading);

  // Group raw props by player for display
  const groupedRawProps = useMemo(() => {
    if (!rawProps) return new Map<string, RawLiveProp[]>();
    const map = new Map<string, RawLiveProp[]>();
    for (const p of rawProps) {
      const name = p.player_name || `Player ${p.player_id}`;
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(p);
    }
    return map;
  }, [rawProps]);

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

  // If we have overlay data, show the model-based view
  if (overlays && overlays.length > 0) {
    return (
      <div className="space-y-6">
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

  // Fallback: show raw live props from nba_player_props_live
  if (groupedRawProps.size > 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {isLive && (
            <span className="flex items-center gap-1 text-cosmic-green font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse-glow" />
              Live
            </span>
          )}
          <span>Live market lines from sportsbooks</span>
          <span className="ml-auto tabular-nums">{rawProps?.length ?? 0} props</span>
        </div>

        {[...groupedRawProps.entries()].map(([playerName, props]) => (
          <section key={playerName}>
            <h3 className="text-xs font-semibold text-foreground mb-2 truncate">{playerName}</h3>
            <div className="space-y-1.5">
              {props.map(p => {
                const propLabel = getPropLabel(p.prop_type);
                return (
                  <div key={p.id} className="cosmic-card rounded-lg px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">{propLabel}</span>
                      <span className="text-sm font-bold tabular-nums">{p.line_value}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] tabular-nums shrink-0">
                      <span className="flex items-center gap-0.5 text-cosmic-green font-semibold">
                        <TrendingUp className="h-3 w-3" />
                        O {formatOdds(p.over_odds)}
                      </span>
                      <span className="flex items-center gap-0.5 text-cosmic-red font-semibold">
                        <TrendingDown className="h-3 w-3" />
                        U {formatOdds(p.under_odds)}
                      </span>
                      <span className="text-[8px] text-muted-foreground">{p.vendor}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  }

  // No data at all
  return (
    <div className="text-center py-12 space-y-2">
      <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto" />
      <p className="text-sm font-semibold text-foreground">No strong live edges yet</p>
      <p className="text-xs text-muted-foreground">Check back when the game is active for real-time prop intelligence</p>
    </div>
  );
}

function LivePropCard({ prop }: { prop: TopProp }) {
  const edgeScore = prop.edge_score_v11 ?? prop.edge_score;
  const tier = getEdgeTier(edgeScore);
  const isOver = prop.side === "over" || prop.side == null;
  const propLabel = getPropLabel(prop.prop_type);

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
