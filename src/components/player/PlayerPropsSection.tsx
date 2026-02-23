import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { DollarSign } from "lucide-react";

interface PlayerPropsSectionProps {
  playerId: string;
  playerName: string;
  teamAbbr: string;
}

interface PropRow {
  id: string;
  game_id: string;
  player_name: string;
  market_key: string;
  market_label: string;
  bookmaker: string;
  line: number | null;
  over_price: number | null;
  under_price: number | null;
}

// Core prop markets we want to display
const DISPLAY_ORDER = [
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_points_rebounds_assists",
  "player_threes",
  "player_steals",
  "player_blocks",
  "player_turnovers",
  "player_points_rebounds",
  "player_points_assists",
  "player_rebounds_assists",
  "player_blocks_steals",
];

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return price > 0 ? `+${price}` : `${price}`;
}

export function PlayerPropsSection({ playerId, playerName, teamAbbr }: PlayerPropsSectionProps) {
  // Find the player's next/current game (include live games started up to 4h ago)
  const { data: nextGame } = useQuery({
    queryKey: ["player-props-next-game", teamAbbr],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 4 * 3600000).toISOString();
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time")
        .or(`home_abbr.eq.${teamAbbr},away_abbr.eq.${teamAbbr}`)
        .in("status", ["scheduled", "live", "in_progress"])
        .gte("start_time", cutoff)
        .order("start_time", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!teamAbbr,
  });

  // Fetch player props for that game
  const { data: props } = useQuery({
    queryKey: ["player-props-data", nextGame?.id, playerName],
    queryFn: async () => {
      if (!nextGame?.id) return [];
      // Search by player name (player_props doesn't have player_id, only player_name)
      const { data } = await supabase
        .from("player_props")
        .select("*")
        .eq("game_id", nextGame.id)
        .ilike("player_name", `%${playerName.split(" ").pop()}%`);

      // Filter to best match
      const filtered = (data || []).filter((p: any) => {
        const pName = p.player_name?.toLowerCase() || "";
        const searchName = playerName.toLowerCase();
        return pName.includes(searchName) || searchName.includes(pName);
      });
      return filtered as PropRow[];
    },
    enabled: !!nextGame?.id && !!playerName,
  });

  // Also get game odds for context
  const { data: gameOdds } = useQuery({
    queryKey: ["player-game-odds", nextGame?.id],
    queryFn: async () => {
      if (!nextGame?.id) return null;
      const { data } = await supabase
        .from("odds_snapshots")
        .select("market_type, line, home_price, away_price, bookmaker")
        .eq("game_id", nextGame.id)
        .order("captured_at", { ascending: false });
      return data || [];
    },
    enabled: !!nextGame?.id,
  });

  // Deduplicate props: keep first bookmaker per market_key
  const dedupedProps = props
    ? DISPLAY_ORDER
        .map((key) => props.find((p) => p.market_key === key))
        .filter(Boolean) as PropRow[]
    : [];

  // Get any additional props not in our display order
  const extraProps = props
    ? props.filter(
        (p) =>
          !DISPLAY_ORDER.includes(p.market_key) &&
          !dedupedProps.find((d) => d.market_key === p.market_key)
      )
      .filter((p, i, arr) => arr.findIndex((x) => x.market_key === p.market_key) === i)
    : [];

  const allProps = [...dedupedProps, ...extraProps];

  if (!nextGame) return null;
  if (allProps.length === 0 && (!gameOdds || gameOdds.length === 0)) return null;

  const isHome = nextGame.home_abbr === teamAbbr;
  const opponent = isHome ? nextGame.away_abbr : nextGame.home_abbr;
  const dateStr = new Date(nextGame.start_time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // Get game-level lines
  const latestML = gameOdds?.find((o) => o.market_type === "moneyline");
  const latestSpread = gameOdds?.find((o) => o.market_type === "spread");
  const latestTotal = gameOdds?.find((o) => o.market_type === "total");

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <DollarSign className="h-3.5 w-3.5" />
        Props & Odds
      </h3>

      {/* Game context */}
      <div className="cosmic-card rounded-xl p-3 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold">
              {isHome ? "vs" : "@"} {opponent}
            </span>
            <span className="text-[10px] text-muted-foreground ml-2">{dateStr}</span>
          </div>
          <div className="flex items-center gap-3">
            {latestSpread && (
              <div className="text-right">
                <p className="text-[8px] text-muted-foreground uppercase">Spread</p>
                <p className="text-[11px] font-semibold tabular-nums">
                  {isHome
                    ? (latestSpread.line != null ? (latestSpread.line > 0 ? "+" : "") + latestSpread.line : "—")
                    : (latestSpread.line != null ? ((-latestSpread.line) > 0 ? "+" : "") + (-latestSpread.line) : "—")}
                </p>
              </div>
            )}
            {latestTotal && (
              <div className="text-right">
                <p className="text-[8px] text-muted-foreground uppercase">Total</p>
                <p className="text-[11px] font-semibold tabular-nums">{latestTotal.line ?? "—"}</p>
              </div>
            )}
            {latestML && (
              <div className="text-right">
                <p className="text-[8px] text-muted-foreground uppercase">ML</p>
                <p className="text-[11px] font-semibold tabular-nums">
                  {formatPrice(isHome ? latestML.home_price : latestML.away_price)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Player Props */}
      {allProps.length > 0 ? (
        <div className="space-y-1.5">
          {allProps.map((prop) => (
            <div
              key={prop.market_key}
              className="cosmic-card rounded-lg p-2.5 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{prop.market_label}</span>
                {prop.line != null && (
                  <span className="text-xs font-bold text-primary tabular-nums">{prop.line}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-center min-w-[40px]">
                  <p className="text-[8px] text-muted-foreground uppercase">Over</p>
                  <p className={cn(
                    "text-[11px] font-semibold tabular-nums",
                    prop.over_price != null && prop.over_price < 0 ? "text-cosmic-green" : ""
                  )}>
                    {formatPrice(prop.over_price)}
                  </p>
                </div>
                <div className="text-center min-w-[40px]">
                  <p className="text-[8px] text-muted-foreground uppercase">Under</p>
                  <p className={cn(
                    "text-[11px] font-semibold tabular-nums",
                    prop.under_price != null && prop.under_price < 0 ? "text-cosmic-green" : ""
                  )}>
                    {formatPrice(prop.under_price)}
                  </p>
                </div>
              </div>
            </div>
          ))}
          <p className="text-[9px] text-muted-foreground text-center mt-2">
            via {allProps[0]?.bookmaker || "—"}
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground text-center py-3">
          No player props available yet — lines will appear closer to game time.
        </p>
      )}
    </section>
  );
}
