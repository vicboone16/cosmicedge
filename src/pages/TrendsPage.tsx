import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SlidersHorizontal, Flame, TrendingUp, RefreshCw, Search, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { format, addDays, subDays, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { TrendCard, type TrendInsight } from "@/components/trends/TrendCard";
import { TrendsFilterModal, type TrendFilters } from "@/components/trends/TrendsFilterModal";
import { getMarketShort } from "@/lib/market-catalog";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { GuidanceCard } from "@/components/ui/GuidanceCard";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";

const DEFAULT_FILTERS: TrendFilters = {
  scope: "all",
  leagues: [],
  direction: "all",
  hitRateMin: 0,
  sampleWindow: 5,
  oddsMin: null,
  oddsMax: null,
  propositions: [],
};

function generateInsightText(
  playerName: string,
  direction: "over" | "under",
  line: number,
  propLabel: string,
  hitCount: number,
  sampleSize: number,
  avg: number
): string {
  if (direction === "under") {
    return `${playerName} has failed to exceed ${line} ${propLabel.toLowerCase()} in ${hitCount} ${hitCount === sampleSize ? "straight" : `of last ${sampleSize}`} games (${avg.toFixed(1)} ${propLabel.toLowerCase()}/game average).`;
  }
  return `${playerName} has exceeded ${line} ${propLabel.toLowerCase()} in ${hitCount} of his last ${sampleSize} games (${avg.toFixed(1)} ${propLabel.toLowerCase()}/game average).`;
}

function formatDateLabel(d: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(d);
  if (target.getTime() === today.getTime()) return "Today";
  if (target.getTime() === addDays(today, 1).getTime()) return "Tomorrow";
  if (target.getTime() === subDays(today, 1).getTime()) return "Yesterday";
  return format(d, "EEE, MMM d");
}

export default function TrendsPage() {
  const navigate = useNavigate();
  const [leagueFilter, setLeagueFilter] = useState("NBA");
  const [subTab, setSubTab] = useState<"games" | "insights">("games");
  const [sortBy, setSortBy] = useState<"date" | "hitRate">("hitRate");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<TrendFilters>(DEFAULT_FILTERS);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [search, setSearch] = useState("");

  const dateStart = useMemo(() => {
    const d = startOfDay(selectedDate);
    return d.toISOString();
  }, [selectedDate]);
  const dateEnd = useMemo(() => {
    const d = addDays(startOfDay(selectedDate), 1);
    return d.toISOString();
  }, [selectedDate]);

  // Fetch games for selected date & league (all statuses)
  const { data: games, isLoading: gamesLoading } = useQuery({
    queryKey: ["trends-games", leagueFilter, dateStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, home_team, away_team, start_time, league, status")
        .eq("league", leagueFilter)
        .gte("start_time", dateStart)
        .lt("start_time", dateEnd)
        .order("start_time", { ascending: true });
      return data || [];
    },
  });

  const gameIds = games?.map(g => g.id) || [];
  const gameMap = useMemo(() => {
    const m = new Map<string, (typeof games extends (infer U)[] | undefined ? NonNullable<U> : never)>();
    for (const g of games || []) m.set(g.id, g);
    return m;
  }, [games]);

  // Fetch players for teams in those games
  const teamAbbrs = useMemo(() => {
    const s = new Set<string>();
    for (const g of games || []) { s.add(g.home_abbr); s.add(g.away_abbr); }
    return [...s];
  }, [games]);

  const { data: teamPlayers } = useQuery({
    queryKey: ["trends-team-players", teamAbbrs],
    queryFn: async () => {
      if (teamAbbrs.length === 0) return [];
      const { data } = await supabase
        .from("players")
        .select("id, name, team, position, headshot_url")
        .eq("league", leagueFilter)
        .in("team", teamAbbrs)
        .order("name");
      return data || [];
    },
    enabled: teamAbbrs.length > 0,
  });

  // Fetch player props for those games — uses nba_player_props_live (primary) with player_props fallback
  const { data: props, isLoading: propsLoading, refetch, isFetching } = useQuery({
    queryKey: ["trends-props", gameIds],
    queryFn: async () => {
      if (gameIds.length === 0) return [];

      // Primary: nba_player_props_live (BDL live props)
      const { data: liveProps } = await supabase
        .from("nba_player_props_live")
        .select("id, game_key, player_name, prop_type, line_value, over_odds, under_odds")
        .in("game_key", gameIds)
        .order("player_name", { ascending: true })
        .limit(1000);

      if (liveProps && liveProps.length > 0) {
        // Deduplicate by player + prop_type per game (keep first / best)
        const seen = new Set<string>();
        return liveProps
          .filter(p => {
            const key = `${p.player_name}::${p.prop_type}::${p.game_key}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map(p => ({
            id: p.id,
            game_id: p.game_key,
            player_name: p.player_name,
            market_key: p.prop_type || "",
            line: p.line_value,
            over_price: p.over_odds,
            under_price: p.under_odds,
          }));
      }

      // Fallback: player_props table
      const { data } = await supabase
        .from("player_props")
        .select("*")
        .in("game_id", gameIds)
        .not("over_price", "is", null)
        .not("under_price", "is", null)
        .order("player_name", { ascending: true });
      return data || [];
    },
    enabled: gameIds.length > 0,
    refetchInterval: 60_000,
  });

  // Fetch player stats for hit rate computation
  const playerNames = useMemo(() => [...new Set((props || []).map(p => p.player_name))], [props]);

  const { data: playerStats } = useQuery({
    queryKey: ["trends-player-stats", playerNames.slice(0, 30)],
    queryFn: async () => {
      if (playerNames.length === 0) return [];
      const { data: players } = await supabase
        .from("players")
        .select("id, name")
        .in("name", playerNames.slice(0, 30));
      if (!players || players.length === 0) return [];
      const playerIds = players.map(p => p.id);
      const { data: stats } = await supabase
        .from("player_game_stats")
        .select("player_id, points, rebounds, assists, steals, blocks, three_made")
        .in("player_id", playerIds)
        .eq("period", "full")
        .order("created_at", { ascending: false })
        .limit(playerIds.length * 20);
      return (stats || []).map(s => {
        const player = players.find(p => p.id === s.player_id);
        return { ...s, player_name: player?.name || "" };
      });
    },
    enabled: playerNames.length > 0,
  });

  // Generate trend insights from props + stats
  const insights: TrendInsight[] = useMemo(() => {
    if (!props || props.length === 0) return [];
    const seen = new Set<string>();
    const uniqueProps = props.filter(p => {
      const key = `${p.player_name}::${p.market_key}::${p.game_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const results: TrendInsight[] = [];
    for (const prop of uniqueProps) {
      if (prop.line == null) continue;
      const game = prop.game_id ? gameMap.get(prop.game_id) : null;
      if (!game) continue;
      const pStats = (playerStats || []).filter(s => s.player_name === prop.player_name);
      const sampleSize = Math.min(pStats.length, filters.sampleWindow);
      const propLabel = getMarketShort(prop.market_key);
      const timeStr = format(new Date(game.start_time), "HH:mm");

      if (sampleSize === 0) {
        const direction: "over" | "under" = (prop.over_price ?? 0) < (prop.under_price ?? 0) ? "over" : "under";
        results.push({
           id: String(prop.id), playerName: prop.player_name, teamAbbr: game.away_abbr,
          matchup: `${game.away_abbr} vs ${game.home_abbr}`, startTime: timeStr,
          insightText: `${prop.player_name} — ${propLabel} line at ${prop.line}.`,
          direction, propLabel, line: prop.line,
          odds: direction === "over" ? prop.over_price : prop.under_price,
          hitRate: 50, sampleSize: 0, hitGames: [], gameId: game.id, marketKey: prop.market_key,
        });
        continue;
      }

      const sample = pStats.slice(0, sampleSize);
      const marketKey = prop.market_key;
      let statFn: (s: typeof sample[0]) => number = () => 0;
      if (marketKey.includes("points")) statFn = s => s.points ?? 0;
      else if (marketKey.includes("rebounds")) statFn = s => s.rebounds ?? 0;
      else if (marketKey.includes("assists")) statFn = s => s.assists ?? 0;
      else if (marketKey.includes("steals")) statFn = s => s.steals ?? 0;
      else if (marketKey.includes("blocks")) statFn = s => s.blocks ?? 0;
      else if (marketKey.includes("threes")) statFn = s => s.three_made ?? 0;
      else continue;

      const values = sample.map(statFn);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const overHits = values.filter(v => v > prop.line!).length;
      const underHits = values.filter(v => v < prop.line!).length;
      const overRate = (overHits / sampleSize) * 100;
      const underRate = (underHits / sampleSize) * 100;
      const direction: "over" | "under" = overRate >= underRate ? "over" : "under";
      const hitCount = direction === "over" ? overHits : underHits;
      const hitRate = direction === "over" ? overRate : underRate;
      const hitGames = values.map(v => direction === "over" ? (v > prop.line! ? 1 : 0) : (v < prop.line! ? 1 : 0));

      if (hitRate < filters.hitRateMin) continue;

      results.push({
        id: String(prop.id), playerName: prop.player_name, teamAbbr: game.away_abbr,
        matchup: `${game.away_abbr} vs ${game.home_abbr}`, startTime: timeStr,
        insightText: generateInsightText(prop.player_name, direction, prop.line, propLabel, hitCount, sampleSize, avg),
        direction, propLabel, line: prop.line,
        odds: direction === "over" ? prop.over_price : prop.under_price,
        hitRate, sampleSize, hitGames, statValues: values, gameId: game.id, marketKey: prop.market_key,
      });
    }

    let filtered = results;
    if (filters.direction !== "all") filtered = filtered.filter(r => r.direction === filters.direction);
    if (sortBy === "hitRate") filtered.sort((a, b) => b.hitRate - a.hitRate);
    else if (sortBy === "date") filtered.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return filtered;
  }, [props, playerStats, gameMap, filters, sortBy]);

  // Filter games by search (player name or team abbr)
  const filteredGames = useMemo(() => {
    if (!games) return [];
    if (!search) return games;
    const q = search.toLowerCase();
    // Filter by team abbreviation or team name
    const teamMatch = games.filter(g =>
      g.home_abbr.toLowerCase().includes(q) || g.away_abbr.toLowerCase().includes(q) ||
      g.home_team.toLowerCase().includes(q) || g.away_team.toLowerCase().includes(q)
    );
    if (teamMatch.length > 0) return teamMatch;
    // Filter by player name → find teams
    const matchingTeams = new Set<string>();
    for (const p of teamPlayers || []) {
      if (p.name.toLowerCase().includes(q) && p.team) matchingTeams.add(p.team);
    }
    if (matchingTeams.size > 0) {
      return games.filter(g => matchingTeams.has(g.home_abbr) || matchingTeams.has(g.away_abbr));
    }
    return [];
  }, [games, search, teamPlayers]);

  const filteredInsights = useMemo(() => {
    if (!search) return insights;
    const q = search.toLowerCase();
    return insights.filter(r =>
      r.playerName.toLowerCase().includes(q) ||
      r.teamAbbr.toLowerCase().includes(q) ||
      r.matchup.toLowerCase().includes(q)
    );
  }, [insights, search]);

  const [isManualFetching, setIsManualFetching] = useState(false);

  const handleRefresh = async () => {
    setIsManualFetching(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-player-props?league=${leagueFilter}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (resp.ok) {
        toast.success(`Props refresh triggered for ${leagueFilter}`);
      } else {
        toast.error(`Props refresh failed (${resp.status})`);
      }
    } catch (e) {
      console.warn("Refresh error:", e);
      toast.error("Props refresh failed — network error");
    }
    setIsManualFetching(false);
    refetch();
  };

  // Get players for a specific game
  const getGamePlayers = (homeAbbr: string, awayAbbr: string) => {
    if (!teamPlayers) return { home: [], away: [] };
    return {
      home: teamPlayers.filter(p => p.team === homeAbbr),
      away: teamPlayers.filter(p => p.team === awayAbbr),
    };
  };

  // Get props count per game
  const propsPerGame = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of props || []) {
      m.set(p.game_id, (m.get(p.game_id) || 0) + 1);
    }
    return m;
  }, [props]);

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-12 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold font-display">Trends</h1>
          <button
            onClick={handleRefresh}
            disabled={isFetching || isManualFetching}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <RefreshCw className={cn("h-3 w-3", (isFetching || isManualFetching) && "animate-spin")} />
            {isManualFetching ? "Fetching..." : isFetching ? "..." : "Refresh Props"}
          </button>
        </div>

        {/* League chips */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
          {["NBA", "NHL", "MLB", "NFL"].map(lg => (
            <button
              key={lg}
              onClick={() => setLeagueFilter(lg)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap",
                leagueFilter === lg
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {lg}
            </button>
          ))}
        </div>

        {/* Date navigator */}
        <div className="flex items-center justify-between mb-3 cosmic-card rounded-lg px-3 py-2">
          <button onClick={() => setSelectedDate(d => subDays(d, 1))} className="p-1 rounded hover:bg-secondary">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold">{formatDateLabel(selectedDate)}</span>
            <span className="text-xs text-muted-foreground">{format(selectedDate, "MMM d, yyyy")}</span>
          </div>
          <button onClick={() => setSelectedDate(d => addDays(d, 1))} className="p-1 rounded hover:bg-secondary">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Sub tabs */}
        <div className="flex gap-4 border-b border-border -mx-4 px-4">
          {(["games", "insights"] as const).map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={cn(
                "pb-2 text-sm font-semibold capitalize transition-colors border-b-2",
                subTab === t
                  ? "text-foreground border-foreground"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              {t === "games" ? `Games (${filteredGames.length})` : `Insights (${filteredInsights.length})`}
            </button>
          ))}
        </div>
      </header>

      {/* Search bar */}
      <div className="px-4 pt-3 pb-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players or teams..." className="pl-8 h-8 text-xs" />
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <GuidanceCard title="How Trends Work" dismissKey="trends_intro" variant="tip">
          <p>Trends analyzes player props against recent game logs to find hit-rate streaks and edges. <DataSourceBadge source="provider" compact /> lines come from sportsbook feeds. <DataSourceBadge source="model" compact /> insights are computed from your stat history.</p>
          <p className="mt-1">Use the <strong>Insights</strong> tab to see ranked edges, or <strong>Games</strong> to browse by matchup.</p>
        </GuidanceCard>
        {gamesLoading ? (
          <div className="text-center py-12">
            <Flame className="h-6 w-6 text-primary mx-auto mb-2 animate-pulse" />
            <p className="text-sm text-muted-foreground">Loading games...</p>
          </div>
        ) : subTab === "games" ? (
          filteredGames.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">No {leagueFilter} games on {format(selectedDate, "MMM d")}</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different date or league.</p>
              <p className="text-[10px] text-muted-foreground/70 mt-2 italic">Games are loaded from the provider schedule. If a date looks empty, check a nearby date or refresh.</p>
            </div>
          ) : (
            filteredGames.map(game => {
              const { home, away } = getGamePlayers(game.home_abbr, game.away_abbr);
              const propCount = propsPerGame.get(game.id) || 0;
              const statusLabel = game.status === "final" ? "Final" : game.status === "live" || game.status === "in_progress" ? "Live" : format(new Date(game.start_time), "h:mm a");
              return (
                <div
                  key={game.id}
                  className="cosmic-card rounded-xl p-4 space-y-3 cursor-pointer hover:border-primary/30 transition-colors"
                  onClick={() => navigate(`/game/${game.id}`)}
                >
                  {/* Matchup header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{game.away_abbr}</span>
                      <span className="text-xs text-muted-foreground">@</span>
                      <span className="text-sm font-bold">{game.home_abbr}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {propCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                          {propCount} props
                        </span>
                      )}
                      <span className={cn(
                        "text-xs font-semibold",
                        game.status === "final" ? "text-muted-foreground" :
                        game.status === "live" || game.status === "in_progress" ? "text-cosmic-green" :
                        "text-foreground"
                      )}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>

                  {/* Team full names */}
                  <div className="text-xs text-muted-foreground">
                    {game.away_team} @ {game.home_team}
                  </div>

                  {/* Horizontal prop rail */}
                  {(() => {
                    const gameProps = (props || []).filter(p => p.game_id === game.id);
                    if (gameProps.length === 0) return (
                      <p className="text-[10px] text-muted-foreground italic text-center">No props available yet — tap Refresh Props to fetch</p>
                    );
                    // Group by player, take top 5 players by prop count
                    const byPlayer = new Map<string, typeof gameProps>();
                    for (const p of gameProps) {
                      if (!byPlayer.has(p.player_name)) byPlayer.set(p.player_name, []);
                      byPlayer.get(p.player_name)!.push(p);
                    }
                    const topPlayers = [...byPlayer.entries()]
                      .sort((a, b) => b[1].length - a[1].length)
                      .slice(0, 6);
                    return (
                      <div className="space-y-2">
                        {topPlayers.map(([playerName, pProps]) => (
                          <div key={playerName}>
                            <p className="text-[10px] font-semibold text-primary mb-1 truncate">{playerName}</p>
                            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                              {pProps.slice(0, 6).map(p => {
                                const label = getMarketShort(p.market_key);
                                return (
                                  <div key={String(p.id)} className="shrink-0 px-2 py-1 rounded-lg bg-secondary/60 border border-border/30 text-center min-w-[70px]">
                                    <span className="text-[8px] font-bold text-muted-foreground uppercase block">{label}</span>
                                    <span className="text-xs font-bold tabular-nums text-foreground block">{p.line ?? "—"}</span>
                                    <div className="flex items-center justify-center gap-1 text-[8px] tabular-nums">
                                      <span className="text-cosmic-green font-semibold">O {p.over_price != null ? (p.over_price > 0 ? `+${p.over_price}` : p.over_price) : "—"}</span>
                                      <span className="text-cosmic-red font-semibold">U {p.under_price != null ? (p.under_price > 0 ? `+${p.under_price}` : p.under_price) : "—"}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })
          )
        ) : (
          /* Insights tab */
          propsLoading ? (
            <div className="text-center py-12">
              <Flame className="h-6 w-6 text-primary mx-auto mb-2 animate-pulse" />
              <p className="text-sm text-muted-foreground">Loading insights...</p>
            </div>
          ) : filteredInsights.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">No insights available</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(props || []).length === 0
                  ? `No props loaded for ${leagueFilter} on ${format(selectedDate, "MMM d")}. Tap Refresh Props to fetch.`
                  : "Adjust filters or try a different date."}
              </p>
            </div>
          ) : (
            filteredInsights.map(insight => (
              <TrendCard key={insight.id} insight={insight} />
            ))
          )
        )}
      </div>

      {/* Bottom sort bar (insights tab only) */}
      {subTab === "insights" && (
        <div className="fixed bottom-20 left-0 right-0 z-50 px-4 pb-2 pointer-events-none">
          <div className="max-w-lg mx-auto flex items-center justify-center gap-2 pointer-events-auto">
            <button
              onClick={() => setFiltersOpen(true)}
              className="p-2.5 rounded-xl bg-secondary/80 backdrop-blur border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {(["date", "hitRate"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors backdrop-blur border border-border",
                  sortBy === s
                    ? "bg-foreground text-background"
                    : "bg-secondary/80 text-muted-foreground hover:text-foreground"
                )}
              >
                {s === "hitRate" ? "Hit Rate" : "Time"}
              </button>
            ))}
          </div>
        </div>
      )}

      <TrendsFilterModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onApply={setFilters}
        resultCount={filteredInsights.length}
      />
    </div>
  );
}
