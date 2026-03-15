import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Plus, Bookmark, Sparkles } from "lucide-react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { getPropLabel, getEdgeTier } from "@/hooks/use-top-props";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePropDrawer } from "@/hooks/use-prop-drawer";
import type { CarouselProp } from "./PlayerPropCarousel";
import type { TopProp } from "@/hooks/use-top-props";

interface Props {
  prop: CarouselProp | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId?: string;
  onAddToSkySpread?: (prop: CarouselProp) => void;
}

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/** Map carousel prop_type to player_game_stats stat extraction */
function getStatKey(propType: string): string | null {
  // Strip period prefix if present (e.g., "q1:points" → "points")
  const cleaned = propType.replace(/^(q[1-4]|[12]h|ot[12]?|first\d+):/, "");
  const map: Record<string, string> = {
    points: "points", player_points: "points",
    rebounds: "rebounds", player_rebounds: "rebounds",
    assists: "assists", player_assists: "assists",
    steals: "steals", player_steals: "steals",
    blocks: "blocks", player_blocks: "blocks",
    threes: "three_made", player_threes: "three_made",
    turnovers: "turnovers", player_turnovers: "turnovers",
  };
  return map[cleaned] || null;
}

/** Detect period scope from prop_type (e.g., "q1:points" → "Q1", "1h:rebounds" → "1H") */
function detectPropPeriod(propType: string): string {
  const m = propType.match(/^(q[1-4]|[12]h|ot[12]?):/i);
  if (!m) return "full";
  const prefix = m[1].toLowerCase();
  const periodMap: Record<string, string> = {
    q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4",
    "1h": "1H", "2h": "2H", ot: "OT", ot1: "OT", ot2: "OT2",
  };
  return periodMap[prefix] || "full";
}

export function MiniPropDetail({ prop, open, onOpenChange, gameId, onAddToSkySpread }: Props) {
  const { openProp } = usePropDrawer();

  // Fetch last 10 game logs for stat
  const statKey = prop ? getStatKey(prop.prop_type) : null;

  const { data: gameLogs } = useQuery({
    queryKey: ["mini-prop-logs", prop?.player_id, statKey, prop?.prop_type],
    queryFn: async () => {
      if (!prop?.player_id || !statKey) return [];
      const period = detectPropPeriod(prop.prop_type);
      // Try to find the player UUID from players table
      const { data: playerRows } = await supabase.rpc("search_players_unaccent", {
        search_query: prop.player_name,
        max_results: 1,
      });
      const playerId = playerRows?.[0]?.player_id;
      if (!playerId) return [];

      // For halves, also include constituent quarters for aggregation
      let periods: string[];
      if (period === "1H") {
        periods = ["1H", "Q1", "Q2"];
      } else if (period === "2H") {
        periods = ["2H", "Q3", "Q4"];
      } else {
        periods = [period];
      }

      const { data } = await supabase
        .from("player_game_stats")
        .select("points, rebounds, assists, steals, blocks, three_made, turnovers, period, game_id, games!player_game_stats_game_id_fkey(start_time, home_abbr, away_abbr)")
        .eq("player_id", playerId)
        .in("period", periods)
        .not(statKey, "is", null)
        .order("created_at", { ascending: false })
        .limit(period === "full" ? 10 : 200);

      const rows = (data || []) as any[];

      // For half periods, aggregate quarters per game if no direct half row exists
      if (period === "1H" || period === "2H") {
        const halfQuarters = period === "1H" ? ["Q1", "Q2"] : ["Q3", "Q4"];
        const directHalf = rows.filter((r: any) => r.period === period);
        if (directHalf.length > 0) {
          return directHalf.sort((a: any, b: any) => (b.games?.start_time || "").localeCompare(a.games?.start_time || "")).slice(0, 10);
        }
        // Sum quarters per game
        const byGame = new Map<string, any>();
        for (const r of rows) {
          if (!halfQuarters.includes(r.period)) continue;
          const gid = r.game_id;
          if (!byGame.has(gid)) {
            byGame.set(gid, { ...r, [statKey]: r[statKey] || 0, _count: 1 });
          } else {
            const existing = byGame.get(gid)!;
            existing[statKey] = (existing[statKey] || 0) + (r[statKey] || 0);
            existing._count++;
          }
        }
        return Array.from(byGame.values())
          .filter(g => g._count >= 2)
          .sort((a: any, b: any) => (b.games?.start_time || "").localeCompare(a.games?.start_time || ""))
          .slice(0, 10);
      }

      return rows.sort((a: any, b: any) => (b.games?.start_time || "").localeCompare(a.games?.start_time || "")).slice(0, 10);
    },
    enabled: open && !!prop?.player_id && !!statKey,
    staleTime: 60_000,
  });

  if (!prop) return null;

  const propLabel = getPropLabel(prop.prop_type);
  const propPeriod = detectPropPeriod(prop.prop_type);
  const periodBadge = propPeriod !== "full" ? propPeriod : null;
  const edgeScore = prop.edge_score_v11 ?? prop.edge_score ?? 0;
  const tier = edgeScore > 0 ? getEdgeTier(edgeScore) : null;
  const isOver = prop.side === "over" || prop.side == null;
  const hasModel = prop.mu != null && prop.mu > 0;

  // Compute stats from logs
  const values = gameLogs?.map((g: any) => g[statKey!] as number).filter(v => v != null) || [];
  const last5 = values.slice(0, 5);
  const last10 = values.slice(0, 10);
  const avg5 = last5.length > 0 ? (last5.reduce((a, b) => a + b, 0) / last5.length) : null;
  const avg10 = last10.length > 0 ? (last10.reduce((a, b) => a + b, 0) / last10.length) : null;
  const hitsOver = prop.line != null ? last5.filter(v => v > prop.line!).length : null;

  // Convert to TopProp for full drawer
  const asTopProp: TopProp = {
    id: prop.id,
    game_id: prop.game_id || gameId || "",
    player_id: prop.player_id,
    player_name: prop.player_name,
    player_team: prop.player_team || "",
    headshot_url: prop.headshot_url || null,
    prop_type: prop.prop_type,
    line: prop.line,
    mu: prop.mu || (avg10 ?? 0),
    sigma: prop.sigma || 3,
    edge_score: prop.edge_score || 0,
    edge_score_v11: prop.edge_score_v11 ?? null,
    confidence_tier: prop.confidence_tier || null,
    side: prop.side || null,
    odds: prop.over_odds,
    one_liner: prop.one_liner || null,
    hit_l10: prop.hit_l10 ?? null,
    streak: prop.streak ?? null,
    home_abbr: prop.home_abbr,
    away_abbr: prop.away_abbr,
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[60vh] bg-background border-t border-border">
        <div className="px-4 pt-3 pb-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">
                {prop.player_name}
                {periodBadge && (
                  <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    {periodBadge}
                  </span>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {propLabel} · Line {prop.line ?? "—"} · {prop.vendor || "—"}
              </p>
            </div>
            {tier && edgeScore >= 55 && (
              <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", tier.className)}>
                {edgeScore.toFixed(0)} {tier.label}
              </span>
            )}
          </div>

          {/* Odds row */}
          <div className="flex gap-2">
            <div className="flex-1 cosmic-card rounded-lg p-2 text-center">
              <p className="text-[8px] text-muted-foreground uppercase">Over</p>
              <p className="text-xs font-bold tabular-nums text-cosmic-green">{formatOdds(prop.over_odds)}</p>
            </div>
            <div className="flex-1 cosmic-card rounded-lg p-2 text-center">
              <p className="text-[8px] text-muted-foreground uppercase">Under</p>
              <p className="text-xs font-bold tabular-nums text-cosmic-red">{formatOdds(prop.under_odds)}</p>
            </div>
            {hasModel && (
              <div className="flex-1 cosmic-card rounded-lg p-2 text-center">
                <p className="text-[8px] text-muted-foreground uppercase">Proj</p>
                <p className={cn("text-xs font-bold tabular-nums", isOver ? "text-cosmic-green" : "text-cosmic-red")}>
                  {prop.mu!.toFixed(1)}
                </p>
              </div>
            )}
          </div>

          {/* Stats section */}
          {statKey && (
            <div className="space-y-2">
              {/* Last 5 values */}
              {last5.length > 0 && (
                <div className="cosmic-card rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Last 5</span>
                    {hitsOver != null && prop.line != null && (
                      <span className={cn(
                        "text-[10px] font-bold",
                        hitsOver >= 3 ? "text-cosmic-green" : "text-cosmic-red"
                      )}>
                        {hitsOver}/5 over {prop.line}
                      </span>
                    )}
                  </div>
                  <div className="flex items-end gap-1 h-8">
                    {last5.map((v, i) => {
                      const max = Math.max(...last5, prop.line || 0, 1);
                      const pct = Math.max((v / max) * 100, 10);
                      const overLine = prop.line != null && v > prop.line;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                          <span className="text-[8px] tabular-nums text-muted-foreground">{v}</span>
                          <div
                            className={cn("w-full rounded-sm", overLine ? "bg-cosmic-green" : "bg-cosmic-red/50")}
                            style={{ height: `${pct}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Averages row */}
              <div className="grid grid-cols-2 gap-2">
                {avg5 != null && (
                  <div className="cosmic-card rounded-lg p-2 text-center">
                    <p className="text-[8px] text-muted-foreground uppercase">L5 Avg</p>
                    <p className="text-xs font-bold tabular-nums">{avg5.toFixed(1)}</p>
                  </div>
                )}
                {avg10 != null && (
                  <div className="cosmic-card rounded-lg p-2 text-center">
                    <p className="text-[8px] text-muted-foreground uppercase">L10 Avg</p>
                    <p className="text-xs font-bold tabular-nums">{avg10.toFixed(1)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Signal tags */}
          {(prop.streak != null && prop.streak >= 3 || prop.hit_l10 != null && prop.hit_l10 >= 0.7) && (
            <div className="flex gap-1 flex-wrap">
              {prop.streak != null && prop.streak >= 3 && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold bg-cosmic-green/10 text-cosmic-green">
                  🔥 {prop.streak} Streak
                </span>
              )}
              {prop.hit_l10 != null && prop.hit_l10 >= 0.7 && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold bg-primary/10 text-primary">
                  Momentum {(prop.hit_l10 * 100).toFixed(0)}%
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {onAddToSkySpread && (
              <Button
                size="sm"
                className="flex-1"
                onClick={() => { onAddToSkySpread(prop); onOpenChange(false); }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                SkySpread
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => { onOpenChange(false); openProp(asTopProp); }}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Full Intel
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
