import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, RefreshCw, Plus, Search, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SGOPlayerPropsAnalyzerProps {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
}

interface MarketOdd {
  id: string;
  odd_id: string;
  bet_type: string;
  side: string;
  period: string;
  stat_entity_id: string;
  stat_id: string | null;
  player_name: string | null;
  is_player_prop: boolean;
  is_alternate: boolean;
  bookmaker: string;
  odds: number | null;
  line: number | null;
  available: boolean;
}

const STAT_LABELS: Record<string, string> = {
  points: "PTS", rebounds: "REB", assists: "AST", threes: "3PM",
  blocks: "BLK", steals: "STL", turnovers: "TO",
  points_rebounds_assists: "PRA", double_double: "DD",
  passing_yards: "Pass YDs", rushing_yards: "Rush YDs",
  receiving_yards: "Rec YDs", passing_tds: "Pass TDs",
  receptions: "REC", goals: "Goals", saves: "Saves",
  shots_on_goal: "SOG", strikeouts: "Ks", hits: "Hits",
  home_runs: "HRs", total_bases: "TB",
};

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function SGOPlayerPropsAnalyzer({ gameId, homeAbbr, awayAbbr }: SGOPlayerPropsAnalyzerProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const { data: props, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["sgo-player-props", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgo_market_odds")
        .select("*")
        .eq("game_id", gameId)
        .eq("is_player_prop", true)
        .order("player_name")
        .order("stat_id")
        .limit(5000);
      if (error) throw error;
      return (data || []) as MarketOdd[];
    },
    refetchInterval: 30_000,
  });

  // Group by player
  const playerMap = useMemo(() => {
    const map = new Map<string, Map<string, { over: MarketOdd[]; under: MarketOdd[] }>>();
    for (const p of props || []) {
      const pName = p.player_name || p.stat_entity_id;
      if (!map.has(pName)) map.set(pName, new Map());
      const statKey = `${p.stat_id || "unknown"}::${p.period}`;
      if (!map.get(pName)!.has(statKey)) map.get(pName)!.set(statKey, { over: [], under: [] });
      const bucket = map.get(pName)!.get(statKey)!;
      if (p.side === "over") bucket.over.push(p);
      else if (p.side === "under") bucket.under.push(p);
    }
    return map;
  }, [props]);

  const playerNames = useMemo(() => {
    const names = Array.from(playerMap.keys());
    if (search) {
      const q = search.toLowerCase();
      return names.filter(n => n.toLowerCase().includes(q));
    }
    return names;
  }, [playerMap, search]);

  const handleAddToSkySpread = (playerName: string, statId: string, line: number | null, odds: number | null) => {
    navigate(`/skyspread?prefill=true&player=${encodeURIComponent(playerName)}&market=${encodeURIComponent(statId)}&line=${line ?? ""}&odds=${odds ?? ""}&game_id=${gameId}`);
  };

  if (isLoading) {
    return <div className="cosmic-card rounded-xl p-4 text-center"><p className="text-xs text-muted-foreground">Loading player props...</p></div>;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" />
          Player Props Analyzer
        </h3>
        <button onClick={() => refetch()} disabled={isFetching} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players..." className="pl-8 h-8 text-xs" />
      </div>

      {playerNames.length === 0 ? (
        <div className="cosmic-card rounded-xl p-6 text-center">
          <p className="text-xs text-muted-foreground">
            {(props || []).length === 0 ? "No player props from SGO yet. Props typically appear closer to game time." : "No matching players."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {playerNames.map(playerName => {
            const stats = playerMap.get(playerName)!;
            const isExpanded = selectedPlayer === playerName;

            return (
              <div key={playerName} className="cosmic-card rounded-xl overflow-hidden">
                <button
                  onClick={() => setSelectedPlayer(isExpanded ? null : playerName)}
                  className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-foreground">{playerName}</span>
                    <span className="text-[10px] text-muted-foreground">{stats.size} markets</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
                </button>

                {isExpanded && (
                  <div className="border-t border-border/30 divide-y divide-border/20">
                    {Array.from(stats.entries()).map(([statKey, { over, under }]) => {
                      const [statId, period] = statKey.split("::");
                      const consensusOver = over.find(o => o.bookmaker === "consensus");
                      const consensusUnder = under.find(o => o.bookmaker === "consensus");
                      const bkOvers = over.filter(o => o.bookmaker !== "consensus");
                      const bkUnders = under.filter(o => o.bookmaker !== "consensus");

                      // Calculate consensus line from all bookmakers
                      const allLines = [...over, ...under].filter(o => o.line != null).map(o => o.line!);
                      const avgLine = allLines.length > 0 ? (allLines.reduce((a, b) => a + b, 0) / allLines.length) : null;
                      const minLine = allLines.length > 0 ? Math.min(...allLines) : null;
                      const maxLine = allLines.length > 0 ? Math.max(...allLines) : null;

                      // Find outliers (books with line > 1 away from avg)
                      const outliers = [...bkOvers, ...bkUnders].filter(o => {
                        if (o.line == null || avgLine == null) return false;
                        return Math.abs(o.line - avgLine) >= 1;
                      });

                      return (
                        <div key={statKey} className="px-3 py-2.5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-foreground uppercase">
                                {STAT_LABELS[statId] || statId?.replace(/_/g, " ")}
                              </span>
                              {period !== "full" && period !== "game" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{period}</span>
                              )}
                            </div>
                            <button onClick={() => handleAddToSkySpread(playerName, statId, consensusOver?.line ?? avgLine, consensusOver?.odds ?? null)}
                              className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Consensus summary */}
                          {avgLine != null && (
                            <div className="flex items-center gap-3 mb-2">
                              <div className="flex-1">
                                <p className="text-[9px] text-muted-foreground">Consensus Line</p>
                                <p className="text-sm font-bold tabular-nums">{avgLine.toFixed(1)}</p>
                              </div>
                              {minLine != null && maxLine != null && minLine !== maxLine && (
                                <div className="flex-1">
                                  <p className="text-[9px] text-muted-foreground">Range</p>
                                  <p className="text-xs tabular-nums">{minLine} — {maxLine}</p>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                {(consensusOver || bkOvers[0]) && (
                                  <span className="text-[10px] tabular-nums text-cosmic-green flex items-center gap-0.5">
                                    <TrendingUp className="h-2.5 w-2.5" />
                                    {formatOdds((consensusOver || bkOvers[0])?.odds ?? null)}
                                  </span>
                                )}
                                {(consensusUnder || bkUnders[0]) && (
                                  <span className="text-[10px] tabular-nums text-cosmic-red flex items-center gap-0.5">
                                    <TrendingDown className="h-2.5 w-2.5" />
                                    {formatOdds((consensusUnder || bkUnders[0])?.odds ?? null)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Bookmaker comparison */}
                          {bkOvers.length > 0 && (
                            <div className="space-y-0.5 mb-1">
                              <p className="text-[8px] text-muted-foreground uppercase tracking-wider">By Book</p>
                              {bkOvers.slice(0, 6).map((bk, i) => {
                                const matchingUnder = bkUnders.find(u => u.bookmaker === bk.bookmaker);
                                const isOutlier = avgLine != null && bk.line != null && Math.abs(bk.line - avgLine) >= 1;
                                return (
                                  <div key={i} className={cn("flex items-center justify-between text-[9px] px-1.5 py-0.5 rounded",
                                    isOutlier ? "bg-accent/10" : "")}>
                                    <span className="text-muted-foreground truncate max-w-[80px]">{bk.bookmaker}</span>
                                    <span className="font-medium tabular-nums">{bk.line ?? "—"}</span>
                                    <span className="text-cosmic-green tabular-nums">{formatOdds(bk.odds)}</span>
                                    <span className="text-cosmic-red tabular-nums">{formatOdds(matchingUnder?.odds ?? null)}</span>
                                    {isOutlier && <span className="text-[7px] text-accent font-bold">OUTLIER</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
