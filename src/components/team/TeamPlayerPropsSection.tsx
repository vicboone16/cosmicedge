import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, User, ChevronDown, ChevronUp, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface TeamPlayerPropsSectionProps {
  abbr: string;
  league: string;
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
  game_id: string | null;
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

export function TeamPlayerPropsSection({ abbr, league }: TeamPlayerPropsSectionProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  // Get next upcoming game for this team
  const { data: nextGame } = useQuery({
    queryKey: ["team-props-next-game", abbr, league],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time, status")
        .eq("league", league)
        .or(`home_abbr.eq.${abbr},away_abbr.eq.${abbr}`)
        .in("status", ["scheduled", "live", "in_progress"])
        .gte("start_time", new Date(Date.now() - 4 * 3600000).toISOString()) // include games started up to 4h ago
        .order("start_time", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!abbr,
  });

  // Fetch player props for this game
  const { data: props } = useQuery({
    queryKey: ["team-player-props", nextGame?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("player_props")
        .select("*")
        .eq("game_id", nextGame!.id)
        .order("player_name")
        .order("market_key");
      return (data || []) as PropRow[];
    },
    enabled: !!nextGame?.id,
  });

  // Group by player, then by market (deduped)
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, PropRow>>();
    for (const prop of props || []) {
      if (!map.has(prop.player_name)) map.set(prop.player_name, new Map());
      const markets = map.get(prop.player_name)!;
      if (!markets.has(prop.market_key)) markets.set(prop.market_key, prop);
    }
    return map;
  }, [props]);

  const playerNames = Array.from(grouped.keys());

  if (!nextGame || playerNames.length === 0) return null;

  const isHome = nextGame.home_abbr === abbr;
  const opponent = isHome ? nextGame.away_abbr : nextGame.home_abbr;
  const dateStr = new Date(nextGame.start_time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <section>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-2 group"
      >
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5" />
          Player Props · {isHome ? "vs" : "@"} {opponent}
        </h3>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2 mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-[10px] text-muted-foreground mb-2">{dateStr} · {playerNames.length} players</p>

          {playerNames.map(playerName => {
            const markets = grouped.get(playerName)!;
            const isExp = selectedPlayer === playerName;

            return (
              <div key={playerName} className="cosmic-card rounded-xl overflow-hidden">
                <button
                  onClick={() => setSelectedPlayer(isExp ? null : playerName)}
                  className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-foreground">{playerName}</span>
                    <span className="text-[10px] text-muted-foreground">{markets.size} markets</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{isExp ? "▲" : "▼"}</span>
                </button>

                {/* Stat chips (collapsed view) */}
                {!isExp && (
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
                {isExp && (
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
                            <span className="text-[10px] tabular-nums text-cosmic-green">↑{formatPrice(prop.over_price)}</span>
                          )}
                          {prop.under_price != null && (
                            <span className="text-[10px] tabular-nums text-cosmic-red">↓{formatPrice(prop.under_price)}</span>
                          )}
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
