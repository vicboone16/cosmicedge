import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, RefreshCw, ArrowUpDown, Search, ChevronLeft, ChevronRight, ToggleLeft, ToggleRight, Flame, Users, User, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { format, addDays, isToday } from "date-fns";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getMarketShort } from "@/lib/market-catalog";
import { cn } from "@/lib/utils";

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
type PropsView = "odds" | "trends";

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return price > 0 ? `+${price}` : `${price}`;
}

function classifyMarket(key: string): MarketCategory {
  if (key.includes("_alternate")) return "alternate";
  if (/^(h2h_|spreads_|totals_|team_totals_|alternate_spreads_|alternate_totals_|alternate_team_totals_)/.test(key)) return "period";
  return "standard";
}

// Search dropdown component for players & teams
function EntitySearch({ navigate }: { navigate: (path: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: players } = useQuery({
    queryKey: ["search-players", query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const { data } = await supabase
        .from("players")
        .select("id, name, team, position, league, headshot_url")
        .ilike("name", `%${query}%`)
        .order("name")
        .limit(10);
      return data || [];
    },
    enabled: query.length >= 2,
  });

  const { data: teams } = useQuery({
    queryKey: ["search-teams", query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const { data } = await supabase
        .from("standings")
        .select("team_abbr, team_name, league, wins, losses")
        .ilike("team_name", `%${query}%`)
        .order("season", { ascending: false })
        .limit(8);
      // dedupe by team_abbr
      const seen = new Set<string>();
      return (data || []).filter(t => {
        if (seen.has(t.team_abbr)) return false;
        seen.add(t.team_abbr);
        return true;
      });
    },
    enabled: query.length >= 2,
  });

  const hasResults = (players && players.length > 0) || (teams && teams.length > 0);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Search players or teams..."
          className="pl-8 pr-8 h-8 text-xs"
        />
        {query && (
          <button onClick={() => { setQuery(""); setOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {open && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto">
          {!hasResults && (
            <p className="text-xs text-muted-foreground p-3 text-center">No results for "{query}"</p>
          )}
          {players && players.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1 flex items-center gap-1">
                <User className="h-3 w-3" /> Players
              </p>
              {players.map(p => (
                <button
                  key={p.id}
                  onClick={() => { navigate(`/player/${p.id}`); setOpen(false); setQuery(""); }}
                  className="w-full text-left px-3 py-2 hover:bg-secondary/60 transition-colors flex items-center gap-2"
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    {p.headshot_url && <AvatarImage src={p.headshot_url} alt={p.name} />}
                    <AvatarFallback className="text-[9px] bg-secondary">{p.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.position || "—"} · {p.team || "—"}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{p.league || ""}</span>
                </button>
              ))}
            </div>
          )}
          {teams && teams.length > 0 && (
            <div className={players && players.length > 0 ? "border-t border-border" : ""}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1 flex items-center gap-1">
                <Users className="h-3 w-3" /> Teams
              </p>
              {teams.map(t => (
                <button
                  key={t.team_abbr}
                  onClick={() => { navigate(`/team/${t.team_abbr}`); setOpen(false); setQuery(""); }}
                  className="w-full text-left px-3 py-2 hover:bg-secondary/60 transition-colors flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs font-semibold text-foreground">{t.team_name}</p>
                    <p className="text-[10px] text-muted-foreground">{t.team_abbr} · {t.wins}-{t.losses}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{t.league}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlayerPropsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<MarketCategory>("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("player");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [includeAlternates, setIncludeAlternates] = useState(false);
  const [view, setView] = useState<PropsView>("odds");

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
    refetchInterval: 30_000,
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

  const uniqueMarkets = useMemo(() => {
    const s = new Set<string>();
    for (const p of deduped) s.add(p.market_key);
    return Array.from(s).sort();
  }, [deduped]);

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
      <header className="sticky top-0 z-40 px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold font-display flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Props
          </h1>
          <button
            onClick={handleRefreshAll}
            disabled={isFetching}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Fetching..." : "Refresh"}
          </button>
        </div>

        {/* View toggle: Odds / Trends */}
        <div className="flex bg-secondary rounded-full p-0.5 mb-3">
          <button
            onClick={() => setView("odds")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold transition-colors",
              view === "odds" ? "bg-foreground text-background" : "text-muted-foreground"
            )}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Odds
          </button>
          <button
            onClick={() => setView("trends")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold transition-colors",
              view === "trends" ? "bg-foreground text-background" : "text-muted-foreground"
            )}
          >
            <Flame className="h-3.5 w-3.5" />
            Trends
          </button>
        </div>

        {/* Global player/team search */}
        <div className="mb-3">
          <EntitySearch navigate={navigate} />
        </div>

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
        <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
          {["ALL", "NBA", "NHL", "MLB", "NFL"].map((lg) => (
            <button
              key={lg}
              onClick={() => setLeagueFilter(lg)}
              className={cn(
                "px-3 py-1 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap",
                leagueFilter === lg
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {lg}
            </button>
          ))}
        </div>

        {view === "odds" && (
          <>
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
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors",
                    categoryFilter === c.val
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Prop-specific search + market filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by player name..."
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
          </>
        )}
      </header>

      <div className="px-4 py-4">
        {view === "odds" ? (
          <>
            {/* Games list */}
            {games && games.length > 0 && (
              <div className="mb-4 overflow-x-auto no-scrollbar">
                <div className="flex gap-2">
                  {games.map(g => (
                    <button
                      key={g.id}
                      onClick={() => navigate(`/game/${g.id}`)}
                      className="cosmic-card rounded-xl px-3 py-2 text-center min-w-[90px] hover:border-primary/30 transition-colors shrink-0"
                    >
                      <p className="text-[10px] font-semibold text-foreground">{g.away_abbr} @ {g.home_abbr}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        {format(new Date(g.start_time), "h:mm a")}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                    : "Props typically populate closer to game time. Tap \"Refresh\" to check, or check back later."}
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
                            {game ? (
                              <button
                                onClick={() => navigate(`/game/${game.id}`)}
                                className="text-primary hover:underline"
                              >
                                {game.away_abbr}@{game.home_abbr}
                              </button>
                            ) : "—"}
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
          </>
        ) : (
          /* Trends view — embedded inline */
          <TrendsEmbed leagueFilter={leagueFilter === "ALL" ? "NBA" : leagueFilter} />
        )}
      </div>
    </div>
  );
}

// Inline Trends embed (reuses TrendsPage content as a component)
function TrendsEmbed({ leagueFilter }: { leagueFilter: string }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Insight cards based on hit rates vs. current prop lines</p>
        <button
          onClick={() => navigate("/trends")}
          className="text-[10px] text-primary hover:underline font-semibold"
        >
          Full Trends →
        </button>
      </div>

      {/* Import & render TrendsPage content */}
      <TrendsInlineContent league={leagueFilter} />
    </div>
  );
}

// Lightweight inline trends content
import { TrendCard, type TrendInsight } from "@/components/trends/TrendCard";
import { TrendsFilterModal, type TrendFilters } from "@/components/trends/TrendsFilterModal";
import { SlidersHorizontal } from "lucide-react";

function TrendsInlineContent({ league }: { league: string }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "hitRate">("hitRate");
  const [filters, setFilters] = useState<TrendFilters>({
    scope: "all", leagues: [], direction: "all", hitRateMin: 0, sampleWindow: 5, oddsMin: null, oddsMax: null, propositions: [],
  });

  const { data: games } = useQuery({
    queryKey: ["trends-inline-games", league],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = addDays(start, 2);
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, home_team, away_team, start_time, league")
        .eq("league", league)
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString())
        .order("start_time", { ascending: true });
      return data || [];
    },
  });

  const gameIds = games?.map(g => g.id) || [];
  const gameMap = useMemo(() => {
    const m = new Map<string, NonNullable<typeof games>[number]>();
    for (const g of games || []) m.set(g.id, g);
    return m;
  }, [games]);

  const { data: propData, isLoading } = useQuery({
    queryKey: ["trends-inline-props", gameIds],
    queryFn: async () => {
      if (gameIds.length === 0) return [];
      const { data } = await supabase.from("player_props").select("*").in("game_id", gameIds).order("player_name");
      return data || [];
    },
    enabled: gameIds.length > 0,
    refetchInterval: 60_000,
  });

  const insights: TrendInsight[] = useMemo(() => {
    if (!propData || propData.length === 0) return [];
    const seen = new Set<string>();
    const results: TrendInsight[] = [];
    for (const prop of propData) {
      const key = `${prop.player_name}::${prop.market_key}::${prop.game_id}`;
      if (seen.has(key) || prop.line == null) continue;
      seen.add(key);
      const game = prop.game_id ? gameMap.get(prop.game_id) : null;
      if (!game) continue;
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
        direction, propLabel,
        line: prop.line,
        odds: direction === "over" ? prop.over_price : prop.under_price,
        hitRate: 50, sampleSize: 0, hitGames: [],
      });
    }
    if (filters.direction !== "all") return results.filter(r => r.direction === filters.direction);
    return results;
  }, [propData, gameMap, filters]);

  if (isLoading) return <p className="text-xs text-muted-foreground text-center py-8">Loading trends...</p>;
  if (insights.length === 0) return <p className="text-xs text-muted-foreground text-center py-8">No trends for {league} yet. Props populate closer to game time.</p>;

  return (
    <>
      {insights.slice(0, 20).map(i => <TrendCard key={i.id} insight={i} />)}

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <button onClick={() => setFiltersOpen(true)} className="p-2 rounded-xl bg-secondary/80 border border-border text-muted-foreground hover:text-foreground transition-colors">
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        {(["date", "hitRate"] as const).map(s => (
          <button key={s} onClick={() => setSortBy(s)} className={cn(
            "px-3 py-2 rounded-xl text-xs font-semibold border border-border transition-colors",
            sortBy === s ? "bg-foreground text-background" : "bg-secondary/80 text-muted-foreground"
          )}>{s === "hitRate" ? "Hit Rate" : "Date"}</button>
        ))}
      </div>

      <TrendsFilterModal open={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} onApply={setFilters} resultCount={insights.length} />
    </>
  );
}
