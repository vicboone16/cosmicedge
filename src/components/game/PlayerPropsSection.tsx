import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

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

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return price > 0 ? `+${price}` : `${price}`;
}

export function PlayerPropsSection({ gameId }: PlayerPropsProps) {
  const { data: props, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["player-props", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_props")
        .select("*")
        .eq("game_id", gameId)
        .order("player_name", { ascending: true })
        .order("market_key", { ascending: true });
      if (error) throw error;
      return (data || []) as PropRow[];
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
  const grouped = new Map<string, Map<string, PropRow>>();
  for (const prop of props || []) {
    if (!grouped.has(prop.player_name)) {
      grouped.set(prop.player_name, new Map());
    }
    const markets = grouped.get(prop.player_name)!;
    // Keep first (best) entry per market
    if (!markets.has(prop.market_key)) {
      markets.set(prop.market_key, prop);
    }
  }

  // Get unique market keys for column headers
  const allMarkets = new Set<string>();
  for (const markets of grouped.values()) {
    for (const key of markets.keys()) allMarkets.add(key);
  }
  const marketKeys = Array.from(allMarkets).sort();

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
    <section>
      <div className="flex items-center justify-between mb-3">
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

      {grouped.size === 0 ? (
        <div className="cosmic-card rounded-xl p-4 text-center space-y-2">
          <p className="text-xs text-muted-foreground">No player props available yet.</p>
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="text-xs text-primary hover:underline"
          >
            {isFetching ? "Fetching..." : "Fetch props from The Odds API"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from(grouped.entries()).map(([playerName, markets]) => (
            <div key={playerName} className="cosmic-card rounded-xl p-3">
              <p className="text-xs font-semibold text-foreground mb-2">{playerName}</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(markets.entries()).map(([marketKey, prop]) => (
                  <div
                    key={marketKey}
                    className="bg-secondary/50 rounded-lg px-2.5 py-1.5 text-center min-w-[60px]"
                  >
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                      {MARKET_SHORT[marketKey] || marketKey}
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
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
