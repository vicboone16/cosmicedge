import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, RefreshCw, ArrowUpDown, Search, ChevronLeft, ChevronRight, ToggleLeft, ToggleRight, Flame, Users, User, X, Plus, Sparkles, TableProperties } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { format, addDays, isToday } from "date-fns";
import { Input } from "@/components/ui/input";
import { PropsExploreTab } from "@/components/props/PropsExploreTab";
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
type PropsMode = "player" | "team";

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
      const { data } = await supabase.rpc("search_players_unaccent", {
        search_query: query,
        max_results: 10,
      });
      const raw = (data || []).map((p: any) => ({
        id: p.player_id,
        name: p.player_name?.includes(",")
          ? p.player_name.split(",").map((s: string) => s.trim()).reverse().join(" ")
          : p.player_name,
        team: p.player_team,
        position: p.player_position,
        league: p.player_league,
        headshot_url: p.player_headshot_url,
      }));
      // Deduplicate by normalized name + league
      const seen = new Set<string>();
      return raw.filter((p: any) => {
        const key = `${p.name?.toLowerCase()}|${p.league}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    enabled: query.length >= 2,
  });

  const { data: teams } = useQuery({
    queryKey: ["search-teams", query],
    queryFn: async () => {
      if (query.length < 2) return [];
      // Search by team name OR abbreviation
      const { data } = await supabase
        .from("standings")
        .select("team_abbr, team_name, league, wins, losses")
        .or(`team_name.ilike.%${query}%,team_abbr.ilike.%${query}%`)
        .order("season", { ascending: false })
        .limit(8);
      // dedupe by league + team_abbr
      const seen = new Set<string>();
      return (data || []).filter(t => {
        const key = `${t.league}:${t.team_abbr}`;
        if (seen.has(key)) return false;
        seen.add(key);
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
                  key={`${t.league}:${t.team_abbr}`}
                  onClick={() => { navigate(`/team/${t.league}/${t.team_abbr}`); setOpen(false); setQuery(""); }}
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

type PropsTab = "explore" | "markets";

export default function PlayerPropsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<PropsTab>("explore");
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<MarketCategory>("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("player");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [includeAlternates, setIncludeAlternates] = useState(false);
  const [view, setView] = useState<PropsView>("odds");
  const [propsMode, setPropsMode] = useState<PropsMode>("player");
  const [playerIdCache, setPlayerIdCache] = useState<Map<string, string>>(new Map());

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
        .in("league", ["NBA", "NHL", "MLB", "NFL", "NCAAB"])
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
        .not("over_price", "is", null)
        .not("under_price", "is", null)
        .order("player_name", { ascending: true });
      if (error) throw error;
      return (data || []) as PropRow[];
    },
    enabled: gameIds.length > 0,
    refetchInterval: 30_000,
  });

  const [isManualFetching, setIsManualFetching] = useState(false);

  const handleRefreshAll = async () => {
    const leagues = ["NBA", "NHL", "MLB"];
    setIsManualFetching(true);
    try {
      const results = await Promise.allSettled(
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
      const failed = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok));
      if (failed.length === leagues.length) {
        toast.error("Failed to fetch props — check API quota");
      } else {
        toast.success(`Props refresh triggered for ${leagues.join(", ")}`);
      }
    } catch (e) {
      console.warn("Props refresh error:", e);
      toast.error("Props refresh failed");
    }
    setIsManualFetching(false);
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
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold font-display flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Props
          </h1>
          {activeTab === "markets" && (
            <button
              onClick={handleRefreshAll}
              disabled={isFetching || isManualFetching}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary"
            >
              <RefreshCw className={`h-3 w-3 ${(isFetching || isManualFetching) ? "animate-spin" : ""}`} />
              {isManualFetching ? "Fetching..." : isFetching ? "Loading..." : "Refresh"}
            </button>
          )}
        </div>

        {/* Primary Explore / Markets toggle */}
        <div className="flex bg-secondary rounded-full p-0.5 mb-3">
          <button
            onClick={() => setActiveTab("explore")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold transition-colors",
              activeTab === "explore" ? "bg-foreground text-background" : "text-muted-foreground"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Explore
          </button>
          <button
            onClick={() => setActiveTab("markets")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold transition-colors",
              activeTab === "markets" ? "bg-foreground text-background" : "text-muted-foreground"
            )}
          >
            <TableProperties className="h-3.5 w-3.5" />
            Markets
          </button>
        </div>

        {/* Player / Team Props toggle */}
        {view === "odds" && (
          <div className="flex bg-secondary rounded-lg p-0.5 mb-3 w-fit">
            <button
              onClick={() => setPropsMode("player")}
              className={cn(
                "px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1",
                propsMode === "player" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <User className="h-3 w-3" />
              Player Props
            </button>
            <button
              onClick={() => setPropsMode("team")}
              className={cn(
                "px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1",
                propsMode === "team" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="h-3 w-3" />
              Team Props
            </button>
          </div>
        )}

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
          {["ALL", "NBA", "NHL", "MLB", "NFL", "NCAAB"].map((lg) => (
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

            {propsMode === "player" ? (
              /* ── Player Props Table ── */
              <>
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
                      <button onClick={handleRefreshAll} disabled={isFetching} className="text-xs text-primary hover:underline">
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
                          <TableHead className="text-[10px] uppercase tracking-wider h-9 px-1 w-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((prop) => {
                          const game = prop.game_id ? gameMap.get(prop.game_id) : null;
                          const cat = classifyMarket(prop.market_key);
                          const handlePlayerClick = async () => {
                            // Check cache first
                            const cached = playerIdCache.get(prop.player_name);
                            if (cached) { navigate(`/player/${cached}`); return; }
                            // Lookup by name
                            const { data } = await supabase.rpc("search_players_unaccent", {
                              search_query: prop.player_name, max_results: 1,
                            });
                            if (data && data.length > 0) {
                              const pid = (data[0] as any).player_id;
                              setPlayerIdCache(prev => new Map(prev).set(prop.player_name, pid));
                              navigate(`/player/${pid}`);
                            }
                          };
                          const handleAddToSkySpread = () => {
                            navigate(`/skyspread?prefill=true&player=${encodeURIComponent(prop.player_name)}&market=${encodeURIComponent(prop.market_key)}&line=${prop.line ?? ""}&odds=${prop.over_price ?? ""}&game_id=${prop.game_id ?? ""}`);
                          };
                          return (
                            <TableRow key={prop.id} className="text-xs">
                              <TableCell className="px-3 py-2 font-medium">
                                <button onClick={handlePlayerClick} className="text-primary hover:underline text-left">
                                  {prop.player_name}
                                </button>
                              </TableCell>
                              <TableCell className="px-2 py-2 text-muted-foreground">
                                {game ? (
                                  <button onClick={() => navigate(`/game/${game.id}`)} className="text-primary hover:underline">
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
                              <TableCell className="px-1 py-2">
                                <button
                                  onClick={handleAddToSkySpread}
                                  className="p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                  title="Add to SkySpread"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
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
              /* ── Team Props View ── */
              <TeamPropsView gameIds={gameIds} gameMap={gameMap} leagueFilter={leagueFilter} navigate={navigate} />
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

// ── Team Props Component ──
function TeamPropsView({ gameIds, gameMap, leagueFilter, navigate }: {
  gameIds: string[];
  gameMap: Map<string, GameInfo>;
  leagueFilter: string;
  navigate: (path: string) => void;
}) {
  const { data: odds, isLoading } = useQuery({
    queryKey: ["team-odds-snapshots", gameIds],
    queryFn: async () => {
      if (gameIds.length === 0) return [];
      const { data } = await supabase
        .from("odds_snapshots")
        .select("*")
        .in("game_id", gameIds)
        .in("market_type", ["moneyline", "spread", "total"])
        .order("captured_at", { ascending: false });
      // Dedupe: keep latest per game_id + market_type + bookmaker
      const seen = new Set<string>();
      return (data || []).filter(o => {
        const key = `${o.game_id}::${o.market_type}::${o.bookmaker}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    enabled: gameIds.length > 0,
  });

  // Group by game
  const grouped = useMemo(() => {
    const map = new Map<string, typeof odds>();
    for (const o of odds || []) {
      const arr = map.get(o.game_id) || [];
      arr.push(o);
      map.set(o.game_id, arr);
    }
    return map;
  }, [odds]);

  if (isLoading) return <p className="text-xs text-muted-foreground text-center py-8">Loading team odds...</p>;
  if (grouped.size === 0) return <p className="text-xs text-muted-foreground text-center py-8">No team odds available for this date.</p>;

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([gameId, oddsArr]) => {
        const game = gameMap.get(gameId);
        if (!game) return null;
        const ml = oddsArr?.filter(o => o.market_type === "moneyline") || [];
        const sp = oddsArr?.filter(o => o.market_type === "spread") || [];
        const tot = oddsArr?.filter(o => o.market_type === "total") || [];
        const avgPrice = (arr: (number | null)[]) => {
          const valid = arr.filter((v): v is number => v != null);
          return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
        };

        return (
          <div key={gameId} className="cosmic-card rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
              <div className="flex items-center gap-2">
                <button onClick={() => navigate(`/team/${game.league}/${game.away_abbr}`)} className="text-xs font-bold text-primary hover:underline">{game.away_abbr}</button>
                <span className="text-[10px] text-muted-foreground">@</span>
                <button onClick={() => navigate(`/team/${game.league}/${game.home_abbr}`)} className="text-xs font-bold text-primary hover:underline">{game.home_abbr}</button>
              </div>
              <span className="text-[10px] text-muted-foreground">{format(new Date(game.start_time), "h:mm a")}</span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border">
              {/* Moneyline */}
              <div className="p-2.5 text-center">
                <p className="text-[9px] text-muted-foreground uppercase mb-1">ML</p>
                <p className="text-xs font-semibold tabular-nums">{formatPrice(avgPrice(ml.map(o => o.away_price)))}</p>
                <p className="text-xs font-semibold tabular-nums">{formatPrice(avgPrice(ml.map(o => o.home_price)))}</p>
              </div>
              {/* Spread */}
              <div className="p-2.5 text-center">
                <p className="text-[9px] text-muted-foreground uppercase mb-1">Spread</p>
                <p className="text-xs font-semibold tabular-nums">{avgPrice(sp.map(o => o.line)) != null ? `${(avgPrice(sp.map(o => o.line))! * -1) > 0 ? "+" : ""}${(avgPrice(sp.map(o => o.line))! * -1)}` : "—"}</p>
                <p className="text-xs font-semibold tabular-nums">{avgPrice(sp.map(o => o.line)) != null ? `${avgPrice(sp.map(o => o.line))! > 0 ? "+" : ""}${avgPrice(sp.map(o => o.line))}` : "—"}</p>
              </div>
              {/* Total */}
              <div className="p-2.5 text-center">
                <p className="text-[9px] text-muted-foreground uppercase mb-1">Total</p>
                <p className="text-xs font-semibold tabular-nums">O {avgPrice(tot.map(o => o.line)) ?? "—"}</p>
                <p className="text-xs font-semibold tabular-nums">U {avgPrice(tot.map(o => o.line)) ?? "—"}</p>
              </div>
            </div>
          </div>
        );
      })}
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
      const { data } = await supabase.from("player_props").select("*").in("game_id", gameIds).order("player_name").limit(5000);
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
