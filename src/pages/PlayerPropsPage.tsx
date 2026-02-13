import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, RefreshCw, ArrowUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
}

const MARKET_SHORT: Record<string, string> = {
  player_points: "PTS",
  player_rebounds: "REB",
  player_assists: "AST",
  player_threes: "3PM",
  player_blocks: "BLK",
  player_steals: "STL",
  player_points_rebounds_assists: "PRA",
  player_turnovers: "TO",
  player_double_double: "DD",
};

type SortKey = "player" | "market" | "line" | "over" | "under";

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return price > 0 ? `+${price}` : `${price}`;
}

export default function PlayerPropsPage() {
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("player");
  const [sortAsc, setSortAsc] = useState(true);

  // Fetch today's games
  const { data: games } = useQuery({
    queryKey: ["today-games-for-props"],
    queryFn: async () => {
      const today = new Date();
      const start = new Date(today);
      start.setHours(0, 0, 0, 0);
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time")
        .eq("league", "NBA")
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

  // Fetch all props for today's games
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
  });

  const handleRefreshAll = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-player-props?league=NBA`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (!response.ok) console.warn("Props refresh failed:", response.status);
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

  // Get unique markets
  const uniqueMarkets = useMemo(() => {
    const s = new Set<string>();
    for (const p of deduped) s.add(p.market_key);
    return Array.from(s).sort();
  }, [deduped]);

  // Filter & sort
  const filtered = useMemo(() => {
    let rows = deduped;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.player_name.toLowerCase().includes(q));
    }
    if (marketFilter !== "all") {
      rows = rows.filter((r) => r.market_key === marketFilter);
    }
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "player":
          cmp = a.player_name.localeCompare(b.player_name);
          break;
        case "market":
          cmp = a.market_key.localeCompare(b.market_key);
          break;
        case "line":
          cmp = (a.line ?? 0) - (b.line ?? 0);
          break;
        case "over":
          cmp = (a.over_price ?? 0) - (b.over_price ?? 0);
          break;
        case "under":
          cmp = (a.under_price ?? 0) - (b.under_price ?? 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [deduped, search, marketFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
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
        <div className="flex items-center justify-between mb-3">
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
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue placeholder="Market" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {uniqueMarkets.map((m) => (
                <SelectItem key={m} value={m}>
                  {MARKET_SHORT[m] || m}
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
            <p className="text-sm font-medium text-foreground">No player props available</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Props will appear here once fetched from The Odds API. Make sure your API key includes the "Additional Markets" tier.
            </p>
            <button
              onClick={handleRefreshAll}
              disabled={isFetching}
              className="text-xs text-primary hover:underline"
            >
              {isFetching ? "Fetching..." : "Fetch props now"}
            </button>
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
                  return (
                    <TableRow key={prop.id} className="text-xs">
                      <TableCell className="px-3 py-2 font-medium">{prop.player_name}</TableCell>
                      <TableCell className="px-2 py-2 text-muted-foreground">
                        {game ? `${game.away_abbr}@${game.home_abbr}` : "—"}
                      </TableCell>
                      <TableCell className="px-2 py-2">
                        <span className="astro-badge px-1.5 py-0.5 rounded text-[10px] font-semibold">
                          {MARKET_SHORT[prop.market_key] || prop.market_key}
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
