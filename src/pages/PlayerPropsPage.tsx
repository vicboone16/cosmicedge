import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, RefreshCw, ArrowUpDown, Search, ChevronLeft, ChevronRight, ToggleLeft, ToggleRight } from "lucide-react";
import { format, addDays, isToday } from "date-fns";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getMarketShort } from "@/lib/market-catalog";

interface PropRow {
  id: string;
  player_name: string;
  market_key: string;
  market_label: string | null;
  bookmaker: string;
  line: number | null;
  over_price: number | null;
  under_price: number | null;
  game_id: string | null;
  captured_at: string;
}

interface GameInfo {
  id: string;
  home_abbr: string;
  away_abbr: string;
  start_time: string;
  league: string;
}

type SortKey = "player" | "market" | "line" | "over" | "under";
type MarketCategory = "all" | "standard" | "alternate" | "period";

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return price > 0 ? `+${price}` : `${price}`;
}

function classifyMarket(key: string): MarketCategory {
  if (key.includes("_alternate")) return "alternate";
  if (/^(h2h_|spreads_|totals_|team_totals_|alternate_spreads_|alternate_totals_|alternate_team_totals_)/.test(key)) return "period";
  return "standard";
}

export default function PlayerPropsPage() {
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<MarketCategory>("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("player");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [includeAlternates, setIncludeAlternates] = useState(false);

  const canGoForward = selectedDate < addDays(new Date(), 7);
  const goBack = () => setSelectedDate((d) => addDays(d, -1));
  const goForward = () => canGoForward && setSelectedDate((d) => addDays(d, 1));
  const goToday = () => setSelectedDate(new Date());

  const { data: games } = useQuery({
    queryKey: ["games-for-props", selectedDate.toDateString()],
    queryFn: async () => {
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(selectedDate);
      end.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time, league")
        .in("league", ["NBA", "NHL", "MLB", "NFL"])
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString())
        .order("start_time", { ascending: true });
      return (data || []) as GameInfo[];
    },
  });

  const gameIds = games?.map((g) => g.id) || [];
  const gameMap = useMemo(() => {
    const m = new Map<string, GameInfo>();
    for (const g of games || []) m.set(g.id, g);
    return m;
  }, [games]);

  const { data: props, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["all-player-props", gameIds],
    queryFn: async () => {
      if (gameIds.length === 0) return [];
      const { data, error } = await supabase
        .from("player_props")
        .select("*")
        .in("game_id", gameIds)
        .order("player_name", { ascending: true });
      if (error) throw error;
      return (data || []) as PropRow[];
    },
    enabled: gameIds.length > 0,
    refetchInterval: 60_000,
  });

  const handleRefreshAll = async () => {
    const leagues = ["NBA", "NHL", "MLB"];
    try {
      await Promise.allSettled(
        leagues.map((league) =>
          fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-player-props?league=${league}${includeAlternates ? "&alternates=true" : ""}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
            }
          )
        )
      );
    } catch (e) {
      console.warn("Props refresh error:", e);
    }
    refetch();
  };

  // Deduplicate: keep first per player+market
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const result: PropRow[] = [];
    for (const p of props || []) {
      const key = `${p.player_name}::${p.market_key}::${p.game_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(p);
      }
    }
    return result;
  }, [props]);

  // Get unique markets for dropdown
  const uniqueMarkets = useMemo(() => {
    const s = new Set<string>();
    for (const p of deduped) s.add(p.market_key);
    return Array.from(s).sort();
  }, [deduped]);

  // Filter & sort
  const filtered = useMemo(() => {
    let rows = deduped;
    if (leagueFilter !== "ALL") {
      const leagueGameIds = new Set(
        (games || []).filter((g) => g.league === leagueFilter).map((g) => g.id)
      );
      rows = rows.filter((r) => r.game_id && leagueGameIds.has(r.game_id));
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.player_name.toLowerCase().includes(q));
    }
    if (categoryFilter !== "all") {
      rows = rows.filter((r) => classifyMarket(r.market_key) === categoryFilter);
    }
    if (marketFilter !== "all") {
      rows = rows.filter((r) => r.market_key === marketFilter);
    }
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "player": cmp = a.player_name.localeCompare(b.player_name); break;
        case "market": cmp = a.market_key.localeCompare(b.market_key); break;
        case "line": cmp = (a.line ?? 0) - (b.line ?? 0); break;
        case "over": cmp = (a.over_price ?? 0) - (b.over_price ?? 0); break;
        case "under": cmp = (a.under_price ?? 0) - (b.under_price ?? 0); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [deduped, search, marketFilter, categoryFilter, leagueFilter, games, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "text-primary" : "text-muted-foreground/50"}`} />
    </button>
  );

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-bold font-display flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Player Props
          </h1>
          <button
            onClick={handleRefreshAll}
            disabled={isFetching}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Fetching..." : "Refresh All"}
          </button>
        </div>

        {/* Alternates toggle */}
        <button
          onClick={() => setIncludeAlternates(!includeAlternates)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          {includeAlternates ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4" />}
          <span className={includeAlternates ? "text-primary font-medium" : ""}>
            {includeAlternates ? "Alternates ON" : "Include Alternates"}
          </span>
        </button>

        {/* Date nav */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={goBack} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={goToday} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {isToday(selectedDate)
              ? `${format(selectedDate, "EEE, MMM d")} · Today`
              : format(selectedDate, "EEE, MMM d")}
          </button>
          <button onClick={goForward} disabled={!canGoForward} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {!isToday(selectedDate) && (
            <button onClick={goToday} className="text-[10px] text-primary hover:underline ml-1">Today</button>
          )}
        </div>

        {/* League filter chips */}
        <div className="flex gap-1.5 mb-3">
          {["ALL", "NBA", "NHL", "MLB", "NFL"].map((lg) => (
            <button
              key={lg}
              onClick={() => setLeagueFilter(lg)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                leagueFilter === lg
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {lg}
            </button>
          ))}
        </div>

        {/* Category chips */}
        <div className="flex gap-1.5 mb-3">
          {([
            { val: "all" as MarketCategory, label: "All Types" },
            { val: "standard" as MarketCategory, label: "Standard" },
            { val: "alternate" as MarketCategory, label: "Alternate" },
            { val: "period" as MarketCategory, label: "Periods" },
          ]).map((c) => (
            <button
              key={c.val}
              onClick={() => setCategoryFilter(c.val)}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                categoryFilter === c.val
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player..."
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={marketFilter} onValueChange={setMarketFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="Market" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Markets</SelectItem>
              {uniqueMarkets.map((m) => (
                <SelectItem key={m} value={m}>
                  {getMarketShort(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="px-4 py-4">
        {isLoading ? (
          <div className="cosmic-card rounded-xl p-8 text-center">
            <p className="text-xs text-muted-foreground">Loading props...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="cosmic-card rounded-xl p-8 text-center space-y-3">
            <TrendingUp className="h-8 w-8 text-muted-foreground/30 mx-auto" />
            <p className="text-sm font-medium text-foreground">
              {gameIds.length === 0 ? "No games found for this date" : "Player props haven't populated yet"}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              {gameIds.length === 0
                ? "Try selecting a different date or league — games may not be scheduled yet."
                : "Props typically populate closer to game time. Tap \"Refresh All\" to check, or check back later."}
            </p>
            {gameIds.length > 0 && (
              <button
                onClick={handleRefreshAll}
                disabled={isFetching}
                className="text-xs text-primary hover:underline"
              >
                {isFetching ? "Fetching..." : "Fetch props now"}
              </button>
            )}
          </div>
        ) : (
          <div className="cosmic-card rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wider h-9 px-3">
                    <SortHeader label="Player" field="player" />
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider h-9 px-2">Game</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider h-9 px-2">
                    <SortHeader label="Market" field="market" />
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider h-9 px-2 text-right">
                    <SortHeader label="Line" field="line" />
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider h-9 px-2 text-right">
                    <SortHeader label="Over" field="over" />
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider h-9 px-2 text-right">
                    <SortHeader label="Under" field="under" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((prop) => {
                  const game = prop.game_id ? gameMap.get(prop.game_id) : null;
                  const cat = classifyMarket(prop.market_key);
                  return (
                    <TableRow key={prop.id} className="text-xs">
                      <TableCell className="px-3 py-2 font-medium">{prop.player_name}</TableCell>
                      <TableCell className="px-2 py-2 text-muted-foreground">
                        {game ? `${game.away_abbr}@${game.home_abbr}` : "—"}
                      </TableCell>
                      <TableCell className="px-2 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          cat === "alternate" ? "bg-accent/20 text-accent-foreground" :
                          cat === "period" ? "bg-primary/10 text-primary" :
                          "astro-badge"
                        }`}>
                          {getMarketShort(prop.market_key)}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-2 text-right font-bold tabular-nums">
                        {prop.line != null ? prop.line : "—"}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-right tabular-nums">
                        {prop.over_price != null && (
                          <span className="text-cosmic-green flex items-center justify-end gap-0.5">
                            <TrendingUp className="h-2.5 w-2.5" />
                            {formatPrice(prop.over_price)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-right tabular-nums">
                        {prop.under_price != null && (
                          <span className="text-cosmic-red flex items-center justify-end gap-0.5">
                            <TrendingDown className="h-2.5 w-2.5" />
                            {formatPrice(prop.under_price)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
