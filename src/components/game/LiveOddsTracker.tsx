import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, RefreshCw, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface LiveOddsTrackerProps {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  league: string;
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
  last_updated_at: string | null;
  updated_at: string;
}

type PeriodFilter = "all" | "full" | "1Q" | "2Q" | "3Q" | "4Q" | "1H" | "2H" | "1P" | "2P" | "3P" | "OT";
type MarketFilter = "all" | "ml" | "sp" | "ou";

const PERIOD_LABELS: Record<string, string> = {
  full: "Full Game", game: "Full Game",
  "1Q": "1st Quarter", "2Q": "2nd Quarter", "3Q": "3rd Quarter", "4Q": "4th Quarter",
  "1H": "1st Half", "2H": "2nd Half",
  "1P": "1st Period", "2P": "2nd Period", "3P": "3rd Period",
  OT: "Overtime", OT1: "OT1", OT2: "OT2",
};

const BET_TYPE_LABELS: Record<string, string> = {
  ml: "Moneyline", sp: "Spread", ou: "Total",
};

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function LiveOddsTracker({ gameId, homeAbbr, awayAbbr, league }: LiveOddsTrackerProps) {
  const navigate = useNavigate();
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [showAlts, setShowAlts] = useState(false);

  const { data: odds, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["sgo-market-odds", gameId],
    queryFn: async () => {
      // Primary: SGO market odds
      const { data, error } = await supabase
        .from("sgo_market_odds")
        .select("*")
        .eq("game_id", gameId)
        .eq("is_player_prop", false)
        .order("period")
        .order("bet_type")
        .order("side")
        .limit(5000);
      if (error) throw error;

      // Also fetch BDL odds as supplementary
      const { data: bdlOdds } = await (supabase as any)
        .from("nba_game_odds")
        .select("*")
        .eq("game_key", gameId)
        .limit(500);

      // Merge BDL odds into SGO format if SGO is empty
      if ((!data || data.length === 0) && bdlOdds && bdlOdds.length > 0) {
        return (bdlOdds as any[]).flatMap((o: any) => {
          const rows: MarketOdd[] = [];
          const base = {
            id: `bdl-${o.id}`,
            odd_id: `bdl-${o.id}`,
            period: "full",
            stat_entity_id: "",
            stat_id: null,
            player_name: null,
            is_player_prop: false,
            is_alternate: false,
            available: true,
            last_updated_at: o.updated_at,
            updated_at: o.updated_at,
          };
          if (o.market === "moneyline" || o.market === "h2h") {
            rows.push({ ...base, bet_type: "ml", side: "home", bookmaker: o.vendor, odds: o.home_odds, line: null });
            rows.push({ ...base, bet_type: "ml", side: "away", bookmaker: o.vendor, odds: o.away_odds, line: null });
          }
          if (o.market === "spread" || o.market === "spreads") {
            rows.push({ ...base, bet_type: "sp", side: "home", bookmaker: o.vendor, odds: o.home_odds, line: o.home_line });
            rows.push({ ...base, bet_type: "sp", side: "away", bookmaker: o.vendor, odds: o.away_odds, line: o.away_line });
          }
          if (o.market === "total" || o.market === "totals") {
            rows.push({ ...base, bet_type: "ou", side: "over", bookmaker: o.vendor, odds: o.over_odds, line: o.total });
            rows.push({ ...base, bet_type: "ou", side: "under", bookmaker: o.vendor, odds: o.under_odds, line: o.total });
          }
          return rows;
        });
      }

      return (data || []) as MarketOdd[];
    },
    refetchInterval: 30_000,
  });

  const periods = useMemo(() => {
    const set = new Set<string>();
    for (const o of odds || []) set.add(o.period);
    return Array.from(set).sort();
  }, [odds]);

  const filtered = useMemo(() => {
    let rows = odds || [];
    if (periodFilter !== "all") rows = rows.filter(o => o.period === periodFilter || (periodFilter === "full" && (o.period === "full" || o.period === "game")));
    if (marketFilter !== "all") rows = rows.filter(o => o.bet_type === marketFilter);
    if (!showAlts) rows = rows.filter(o => !o.is_alternate);
    return rows;
  }, [odds, periodFilter, marketFilter, showAlts]);

  // Group by period → bet_type → side, showing bookmaker comparison
  const grouped = useMemo(() => {
    const map = new Map<string, MarketOdd[]>();
    for (const o of filtered) {
      const key = `${o.period}::${o.bet_type}::${o.side}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return map;
  }, [filtered]);

  // Build consensus vs bookmaker comparison for each market
  const marketSummaries = useMemo(() => {
    const summaries: {
      period: string;
      betType: string;
      side: string;
      consensus: MarketOdd | null;
      bookmakers: MarketOdd[];
    }[] = [];

    // Group by period+betType (combine sides)
    const pairMap = new Map<string, { home?: MarketOdd[]; away?: MarketOdd[]; over?: MarketOdd[]; under?: MarketOdd[] }>();
    for (const [key, odds] of grouped) {
      const [period, betType, side] = key.split("::");
      const pairKey = `${period}::${betType}`;
      if (!pairMap.has(pairKey)) pairMap.set(pairKey, {});
      const pair = pairMap.get(pairKey)!;
      (pair as any)[side] = odds;
    }

    for (const [pairKey, sides] of pairMap) {
      const [period, betType] = pairKey.split("::");

      for (const [side, odds] of Object.entries(sides) as [string, MarketOdd[]][]) {
        const consensus = odds.find(o => o.bookmaker === "consensus") || null;
        const bookmakers = odds.filter(o => o.bookmaker !== "consensus");
        summaries.push({ period, betType, side, consensus, bookmakers });
      }
    }

    return summaries;
  }, [grouped]);

  const handleAddToSkySpread = (odd: MarketOdd) => {
    const selection = `${odd.side === "home" || odd.side === "over" ? homeAbbr : awayAbbr} ${BET_TYPE_LABELS[odd.bet_type] || odd.bet_type}`;
    navigate(`/skyspread?prefill=true&game_id=${gameId}&market=${odd.bet_type}&side=${odd.side}&line=${odd.line ?? ""}&odds=${odd.odds ?? ""}&period=${odd.period}`);
  };

  if (isLoading) {
    return <div className="cosmic-card rounded-xl p-4 text-center"><p className="text-xs text-muted-foreground">Loading live odds...</p></div>;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" />
          Live Odds Tracker
        </h3>
        <button onClick={() => refetch()} disabled={isFetching} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "full", ...periods.filter(p => p !== "full" && p !== "game")] as PeriodFilter[]).map(p => (
          <button key={p} onClick={() => setPeriodFilter(p)}
            className={cn("px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors",
              periodFilter === p ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
            )}>
            {p === "all" ? "All Periods" : PERIOD_LABELS[p] || p}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        {(["all", "ml", "sp", "ou"] as MarketFilter[]).map(m => (
          <button key={m} onClick={() => setMarketFilter(m)}
            className={cn("px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors",
              marketFilter === m ? "bg-accent text-accent-foreground" : "bg-secondary/40 text-muted-foreground hover:bg-secondary"
            )}>
            {m === "all" ? "All Markets" : BET_TYPE_LABELS[m] || m.toUpperCase()}
          </button>
        ))}
        <button onClick={() => setShowAlts(!showAlts)}
          className={cn("px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors",
            showAlts ? "bg-primary/20 text-primary" : "bg-secondary/40 text-muted-foreground"
          )}>
          {showAlts ? "Alts ON" : "Alts"}
        </button>
      </div>

      {/* Market Cards */}
      {marketSummaries.length === 0 ? (
        <div className="cosmic-card rounded-xl p-6 text-center">
          <p className="text-xs text-muted-foreground">No SGO market odds available for this game yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Group summaries by period for clean display */}
          {Array.from(new Set(marketSummaries.map(s => s.period))).map(period => {
            const periodMarkets = marketSummaries.filter(s => s.period === period);
            // Group by betType within period
            const byBetType = new Map<string, typeof periodMarkets>();
            for (const m of periodMarkets) {
              if (!byBetType.has(m.betType)) byBetType.set(m.betType, []);
              byBetType.get(m.betType)!.push(m);
            }

            return (
              <div key={period} className="cosmic-card rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-border/50 bg-secondary/20">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {PERIOD_LABELS[period] || period}
                  </p>
                </div>

                {Array.from(byBetType.entries()).map(([betType, markets]) => {
                  // For ML: show home/away side by side
                  // For SP/OU: show with lines
                  const side1 = markets.find(m => m.side === "home" || m.side === "over");
                  const side2 = markets.find(m => m.side === "away" || m.side === "under");

                  return (
                    <div key={betType} className="px-3 py-2.5 border-b border-border/30 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold text-foreground">{BET_TYPE_LABELS[betType] || betType}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Side 1 */}
                        <div>
                          <p className="text-[9px] text-muted-foreground mb-1">
                            {side1?.side === "home" ? homeAbbr : side1?.side === "over" ? "Over" : side1?.side || "—"}
                          </p>
                          {side1?.consensus && (
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-bold tabular-nums">{formatOdds(side1.consensus.odds)}</span>
                              {side1.consensus.line != null && (
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {betType === "ou" ? `O ${side1.consensus.line}` : `${side1.consensus.line > 0 ? "+" : ""}${side1.consensus.line}`}
                                </span>
                              )}
                              <button onClick={() => handleAddToSkySpread(side1.consensus!)}
                                className="ml-auto p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          {/* Bookmaker breakdown */}
                          {side1?.bookmakers && side1.bookmakers.length > 0 && (
                            <div className="space-y-0.5">
                              {side1.bookmakers.slice(0, 5).map((bk, i) => (
                                <div key={i} className="flex items-center justify-between text-[9px]">
                                  <span className="text-muted-foreground truncate max-w-[60px]">{bk.bookmaker}</span>
                                  <span className="tabular-nums font-medium">{formatOdds(bk.odds)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Side 2 */}
                        <div>
                          <p className="text-[9px] text-muted-foreground mb-1">
                            {side2?.side === "away" ? awayAbbr : side2?.side === "under" ? "Under" : side2?.side || "—"}
                          </p>
                          {side2?.consensus && (
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-bold tabular-nums">{formatOdds(side2.consensus.odds)}</span>
                              {side2.consensus.line != null && (
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {betType === "ou" ? `U ${side2.consensus.line}` : `${side2.consensus.line > 0 ? "+" : ""}${side2.consensus.line}`}
                                </span>
                              )}
                              <button onClick={() => handleAddToSkySpread(side2.consensus!)}
                                className="ml-auto p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          {side2?.bookmakers && side2.bookmakers.length > 0 && (
                            <div className="space-y-0.5">
                              {side2.bookmakers.slice(0, 5).map((bk, i) => (
                                <div key={i} className="flex items-center justify-between text-[9px]">
                                  <span className="text-muted-foreground truncate max-w-[60px]">{bk.bookmaker}</span>
                                  <span className="tabular-nums font-medium">{formatOdds(bk.odds)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
