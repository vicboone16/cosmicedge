import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GameWithOdds } from "@/hooks/use-games";

function formatOdds(odds: number): string {
  if (!odds) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

const GameDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: game, isLoading } = useQuery({
    queryKey: ["game", id],
    queryFn: async (): Promise<GameWithOdds | null> => {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .eq("id", id!)
        .maybeSingle();

      if (error || !data) return null;

      const { data: odds } = await supabase
        .from("odds_snapshots")
        .select("*")
        .eq("game_id", data.id)
        .order("captured_at", { ascending: false });

      const ml = odds?.find((o) => o.market_type === "moneyline");
      const spread = odds?.find((o) => o.market_type === "spread");
      const total = odds?.find((o) => o.market_type === "total");

      return {
        ...data,
        odds: {
          moneyline: { home: ml?.home_price || 0, away: ml?.away_price || 0 },
          spread: { home: spread?.home_price || -110, away: spread?.away_price || -110, line: spread?.line || 0 },
          total: { over: total?.home_price || -110, under: total?.away_price || -110, line: total?.line || 0 },
        },
      };
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading game...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Game not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4 bg-background/70 backdrop-blur-xl border-b border-border/50">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back</span>
        </button>

        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">{game.league}</span>
          <span className="text-xs text-muted-foreground">
            {format(new Date(game.start_time), "h:mm a")}
          </span>
        </div>

        <div className="flex items-center justify-between py-4">
          <div className="text-center flex-1">
            <p className="text-2xl font-bold font-display">{game.away_abbr}</p>
            <p className="text-xs text-muted-foreground mt-1">{game.away_team}</p>
            {game.away_score !== null && (
              <p className="text-3xl font-bold font-display mt-2 tabular-nums">{game.away_score}</p>
            )}
          </div>
          <div className="px-4">
            <span className="text-xs font-bold text-muted-foreground">VS</span>
          </div>
          <div className="text-center flex-1">
            <p className="text-2xl font-bold font-display">{game.home_abbr}</p>
            <p className="text-xs text-muted-foreground mt-1">{game.home_team}</p>
            {game.home_score !== null && (
              <p className="text-3xl font-bold font-display mt-2 tabular-nums">{game.home_score}</p>
            )}
          </div>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Markets</h3>

        <div className="grid grid-cols-3 gap-3">
          <div className="cosmic-card rounded-xl p-3 text-center">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Moneyline</span>
            <div className="mt-2 space-y-1">
              <p className="text-sm font-semibold tabular-nums">{formatOdds(game.odds.moneyline.away)}</p>
              <p className="text-sm font-semibold tabular-nums">{formatOdds(game.odds.moneyline.home)}</p>
            </div>
          </div>

          <div className="cosmic-card rounded-xl p-3 text-center">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Spread</span>
            <div className="mt-2 space-y-1">
              <p className="text-sm font-semibold tabular-nums">{game.odds.spread.line ? `${game.odds.spread.line > 0 ? "+" : ""}${-game.odds.spread.line}` : "—"}</p>
              <p className="text-sm font-semibold tabular-nums">{game.odds.spread.line ? `${game.odds.spread.line > 0 ? "" : "+"}${game.odds.spread.line}` : "—"}</p>
            </div>
          </div>

          <div className="cosmic-card rounded-xl p-3 text-center">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</span>
            <div className="mt-2 space-y-1">
              <p className="text-sm font-semibold tabular-nums">{game.odds.total.line ? `O ${game.odds.total.line}` : "—"}</p>
              <p className="text-sm font-semibold tabular-nums">{game.odds.total.line ? `U ${game.odds.total.line}` : "—"}</p>
            </div>
          </div>
        </div>

        <div className="cosmic-card rounded-xl p-6 text-center mt-6">
          <Star className="h-8 w-8 text-primary/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">Cosmic Analysis</p>
          <p className="text-xs text-muted-foreground mt-1">
            Horary charts, scoring models, and player props coming in Phase 3+
          </p>
        </div>
      </div>
    </div>
  );
};

export default GameDetail;
