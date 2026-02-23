import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SlidersHorizontal, Flame, TrendingUp, RefreshCw, Search } from "lucide-react";
import { format, isToday, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { TrendCard, type TrendInsight } from "@/components/trends/TrendCard";
import { TrendsFilterModal, type TrendFilters } from "@/components/trends/TrendsFilterModal";
import { getMarketShort } from "@/lib/market-catalog";
import { Input } from "@/components/ui/input";

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

export default function TrendsPage() {
  const [leagueFilter, setLeagueFilter] = useState("NBA");
  const [subTab, setSubTab] = useState<"insights" | "popular">("insights");
  const [sortBy, setSortBy] = useState<"date" | "hitRate">("hitRate");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<TrendFilters>(DEFAULT_FILTERS);
  const [selectedDate] = useState(new Date());
  const [search, setSearch] = useState("");

  // Fetch today's games for the selected league
  const { data: games } = useQuery({
    queryKey: ["trends-games", leagueFilter, selectedDate.toDateString()],
    queryFn: async () => {
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      const end = addDays(start, 2);
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, home_team, away_team, start_time, league")
        .eq("league", leagueFilter)
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString())
        .order("start_time", { ascending: true });
      return data || [];
    },
  });

  const gameIds = games?.map(g => g.id) || [];
  const gameMap = useMemo(() => {
    const m = new Map<string, typeof games extends (infer U)[] | undefined ? NonNullable<U> : never>();
    for (const g of games || []) m.set(g.id, g);
    return m;
  }, [games]);

  // Fetch player props for those games
  const { data: props, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["trends-props", gameIds],
    queryFn: async () => {
      if (gameIds.length === 0) return [];
      const { data } = await supabase
        .from("player_props")
        .select("*")
        .in("game_id", gameIds)
        .order("player_name", { ascending: true });
      return data || [];
    },
    enabled: gameIds.length > 0,
    refetchInterval: 60_000,
  });

  // Fetch player stats to compute hit rates
  const playerNames = useMemo(() => [...new Set((props || []).map(p => p.player_name))], [props]);

  const { data: playerStats } = useQuery({
    queryKey: ["trends-player-stats", playerNames.slice(0, 30)],
    queryFn: async () => {
      if (playerNames.length === 0) return [];
      // Get players by name to find IDs
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

    // Deduplicate props
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

      // Find player stats
      const pStats = (playerStats || []).filter(s => s.player_name === prop.player_name);
      const sampleSize = Math.min(pStats.length, filters.sampleWindow);
      if (sampleSize === 0) {
        // Still show the prop without hit-rate data
        const direction: "over" | "under" = (prop.over_price ?? 0) < (prop.under_price ?? 0) ? "over" : "under";
        const propLabel = getMarketShort(prop.market_key);
        const timeStr = isToday(new Date(game.start_time))
          ? `Today ${format(new Date(game.start_time), "HH:mm")}`
          : format(new Date(game.start_time), "EEE HH:mm");

        results.push({
          id: prop.id,
          playerName: prop.player_name,
          teamAbbr: game.away_abbr,
          matchup: `${game.away_abbr} vs ${game.home_abbr}`,
          startTime: timeStr,
          insightText: `${prop.player_name} — ${propLabel} line at ${prop.line}.`,
          direction,
          propLabel,
          line: prop.line,
          odds: direction === "over" ? prop.over_price : prop.under_price,
          hitRate: 50,
          sampleSize: 0,
          hitGames: [],
          gameId: game.id,
          marketKey: prop.market_key,
        });
        continue;
      }

      // Determine which stat maps to this market
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

      // Pick the stronger direction
      const direction: "over" | "under" = overRate >= underRate ? "over" : "under";
      const hitCount = direction === "over" ? overHits : underHits;
      const hitRate = direction === "over" ? overRate : underRate;
      const hitGames = values.map(v => direction === "over" ? (v > prop.line! ? 1 : 0) : (v < prop.line! ? 1 : 0));

      if (hitRate < filters.hitRateMin) continue;

      const propLabel = getMarketShort(prop.market_key);
      const timeStr = isToday(new Date(game.start_time))
        ? `Today ${format(new Date(game.start_time), "HH:mm")}`
        : format(new Date(game.start_time), "EEE HH:mm");

      results.push({
        id: prop.id,
        playerName: prop.player_name,
        teamAbbr: game.away_abbr,
        matchup: `${game.away_abbr} vs ${game.home_abbr}`,
        startTime: timeStr,
        insightText: generateInsightText(prop.player_name, direction, prop.line, propLabel, hitCount, sampleSize, avg),
        direction,
        propLabel,
        line: prop.line,
        odds: direction === "over" ? prop.over_price : prop.under_price,
        hitRate,
        sampleSize,
        hitGames,
        statValues: values,
        gameId: game.id,
        marketKey: prop.market_key,
      });
    }

    // Apply filters
    let filtered = results;
    if (filters.direction !== "all") {
      filtered = filtered.filter(r => r.direction === filters.direction);
    }

    // Apply search filter
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(r => r.playerName.toLowerCase().includes(q));
    }

    // Sort
    if (sortBy === "hitRate") {
      filtered.sort((a, b) => b.hitRate - a.hitRate);
    } else if (sortBy === "date") {
      filtered.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    return filtered;
  }, [props, playerStats, gameMap, filters, sortBy, search]);

  const handleRefresh = async () => {
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-player-props?league=${leagueFilter}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
    } catch (e) {
      console.warn("Refresh error:", e);
    }
    refetch();
  };

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-12 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold font-display">Trends</h1>
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
            {isFetching ? "..." : "Refresh"}
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

        {/* Sub tabs */}
        <div className="flex gap-4 border-b border-border -mx-4 px-4">
          {(["insights", "popular"] as const).map(t => (
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
              {t === "insights" ? "Insights" : "Popular"}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-12">
            <Flame className="h-6 w-6 text-primary mx-auto mb-2 animate-pulse" />
            <p className="text-sm text-muted-foreground">Loading trends...</p>
          </div>
        ) : insights.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No trends found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Props haven't populated yet for {leagueFilter}. Tap Refresh or check back closer to game time.
            </p>
          </div>
        ) : (
          insights.map(insight => (
            <TrendCard key={insight.id} insight={insight} />
          ))
        )}
      </div>

      {/* Bottom sort bar */}
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
              {s === "hitRate" ? "Hit Rate" : "Date"}
            </button>
          ))}
        </div>
      </div>

      <TrendsFilterModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onApply={setFilters}
        resultCount={insights.length}
      />
    </div>
  );
}
