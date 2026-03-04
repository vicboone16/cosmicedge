import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, RefreshCw, Search, Plus, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { TrackPropButton } from "@/components/tracking/TrackedProps";
import { cn } from "@/lib/utils";
import { assertGameKeyUUID } from "@/lib/game-key-guard";

interface PlayerPropsProps {
  gameId: string;
}

interface PropRow {
  id: string;
  player_name: string;
  market_key: string;
  market_label: string | null;
  bookmaker: string;
  line: number | null;
  over_price: number | null;
  under_price: number | null;
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
  player_points_rebounds: "PTS+REB",
  player_points_assists: "PTS+AST",
  player_rebounds_assists: "REB+AST",
  player_blocks_steals: "BLK+STL",
};

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return price > 0 ? `+${price}` : `${price}`;
}

export function PlayerPropsSection({ gameId }: PlayerPropsProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const { data: props, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["player-props", gameId],
    queryFn: async () => {
      assertGameKeyUUID(gameId, "PlayerPropsSection");
      // Tier 1: BDL nba_player_props_live (primary for NBA)
      const { data: bdlProps } = await (supabase as any)
        .from("nba_player_props_live")
        .select("*")
        .eq("game_key", gameId)
        .eq("market_type", "over_under")
        .order("player_name", { ascending: true });

      if (bdlProps && bdlProps.length > 0) {
        return (bdlProps as any[]).map((p: any) => ({
          id: `bdl-${p.id}`,
          player_name: p.player_name || "Unknown",
          market_key: p.prop_type,
          market_label: null,
          bookmaker: p.vendor,
          line: p.line_value,
          over_price: p.over_odds,
          under_price: p.under_odds,
        })) as PropRow[];
      }

      // Tier 2: Legacy player_props (SGO dual-write)
      const { data, error } = await supabase
        .from("player_props")
        .select("*")
        .eq("game_id", gameId)
        .order("player_name", { ascending: true })
        .order("market_key", { ascending: true });
      if (error) throw error;

      if (data && data.length > 0) return data as PropRow[];

      // Tier 3: Auto-trigger fetch if empty
      fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-player-props?game_id=${gameId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      ).catch(() => {});

      return [] as PropRow[];
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      return (!d || d.length === 0) ? 60_000 : false;
    },
  });

  const handleRefresh = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-player-props?game_id=${gameId}&league=NBA`,
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

  // Group props by player, then by market
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, PropRow>>();
    for (const prop of props || []) {
      if (!map.has(prop.player_name)) map.set(prop.player_name, new Map());
      const markets = map.get(prop.player_name)!;
      if (!markets.has(prop.market_key)) markets.set(prop.market_key, prop);
    }
    return map;
  }, [props]);

  const playerNames = useMemo(() => {
    const names = Array.from(grouped.keys());
    if (search) {
      const q = search.toLowerCase();
      return names.filter(n => n.toLowerCase().includes(q));
    }
    return names;
  }, [grouped, search]);

  const handleAddToSkySpread = (playerName: string, marketKey: string, line: number | null, odds: number | null) => {
    navigate(`/skyspread?prefill=true&player=${encodeURIComponent(playerName)}&market=${encodeURIComponent(marketKey)}&line=${line ?? ""}&odds=${odds ?? ""}&game_id=${gameId}`);
  };

  if (isLoading) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" />
          Player Props
        </h3>
        <div className="cosmic-card rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Loading props...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" />
          Player Props
        </h3>
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players..." className="pl-8 h-8 text-xs" />
      </div>

      {playerNames.length === 0 ? (
        <div className="cosmic-card rounded-xl p-6 text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            {(props || []).length === 0
              ? "No player props available yet. Props typically appear closer to game time."
              : "No matching players."}
          </p>
          {(props || []).length === 0 && (
            <button onClick={handleRefresh} disabled={isFetching} className="text-xs text-primary hover:underline">
              {isFetching ? "Fetching..." : "Fetch latest props"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {playerNames.map(playerName => {
            const markets = grouped.get(playerName)!;
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
                    <span className="text-[10px] text-muted-foreground">{markets.size} markets</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
                </button>

                {/* Stat chips (always visible) */}
                {!isExpanded && (
                  <div className="px-3 pb-2.5 flex flex-wrap gap-1.5">
                    {Array.from(markets.entries()).map(([marketKey, prop]) => (
                      <div key={marketKey} className="bg-secondary/50 rounded-lg px-2.5 py-1.5 text-center min-w-[60px]">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                          {MARKET_SHORT[marketKey] || marketKey.replace(/^player_/, "").replace(/_/g, " ").toUpperCase()}
                        </p>
                        <p className="text-sm font-bold tabular-nums text-foreground">
                          {prop.line != null ? prop.line : "—"}
                        </p>
                        <div className="flex items-center justify-center gap-1 mt-0.5">
                          {prop.over_price != null && (
                            <span className="text-[9px] tabular-nums text-cosmic-green flex items-center gap-0.5">
                              <TrendingUp className="h-2 w-2" />
                              {formatPrice(prop.over_price)}
                            </span>
                          )}
                          {prop.under_price != null && (
                            <span className="text-[9px] tabular-nums text-cosmic-red flex items-center gap-0.5">
                              <TrendingDown className="h-2 w-2" />
                              {formatPrice(prop.under_price)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Expanded detail view */}
                {isExpanded && (
                  <div className="border-t border-border/30 divide-y divide-border/20">
                    {Array.from(markets.entries()).map(([marketKey, prop]) => (
                      <div key={marketKey} className="px-3 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-foreground uppercase">
                            {MARKET_SHORT[marketKey] || marketKey.replace(/^player_/, "").replace(/_/g, " ").toUpperCase()}
                          </span>
                          <span className="text-sm font-bold tabular-nums">{prop.line ?? "—"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {prop.over_price != null && (
                            <span className="text-[10px] tabular-nums text-cosmic-green">
                              ↑{formatPrice(prop.over_price)}
                            </span>
                          )}
                          {prop.under_price != null && (
                            <span className="text-[10px] tabular-nums text-cosmic-red">
                              ↓{formatPrice(prop.under_price)}
                            </span>
                          )}
                          <TrackPropButton
                            gameId={gameId}
                            playerName={playerName}
                            marketType={marketKey}
                            line={prop.line ?? 0}
                            overPrice={prop.over_price}
                            underPrice={prop.under_price}
                          />
                          <button
                            onClick={() => handleAddToSkySpread(playerName, marketKey, prop.line, prop.over_price)}
                            className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                            title="Add to SkySpread"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
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
