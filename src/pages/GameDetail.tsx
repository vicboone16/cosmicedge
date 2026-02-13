import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import { format } from "date-fns";
import { mockGames } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

const GameDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const game = mockGames.find((g) => g.id === id);

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Game not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="px-4 pt-12 pb-4 bg-background/70 backdrop-blur-xl border-b border-border/50">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back</span>
        </button>

        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">{game.league}</span>
          <span className="text-xs text-muted-foreground">
            {format(new Date(game.startTime), "h:mm a")}
          </span>
        </div>

        {/* Matchup */}
        <div className="flex items-center justify-between py-4">
          <div className="text-center flex-1">
            <p className="text-2xl font-bold font-display">{game.awayAbbr}</p>
            <p className="text-xs text-muted-foreground mt-1">{game.awayTeam}</p>
            {game.awayScore !== undefined && (
              <p className="text-3xl font-bold font-display mt-2 tabular-nums">{game.awayScore}</p>
            )}
          </div>
          <div className="px-4">
            <span className="text-xs font-bold text-muted-foreground">VS</span>
          </div>
          <div className="text-center flex-1">
            <p className="text-2xl font-bold font-display">{game.homeAbbr}</p>
            <p className="text-xs text-muted-foreground mt-1">{game.homeTeam}</p>
            {game.homeScore !== undefined && (
              <p className="text-3xl font-bold font-display mt-2 tabular-nums">{game.homeScore}</p>
            )}
          </div>
        </div>
      </header>

      {/* Odds Grid */}
      <div className="px-4 py-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Markets</h3>
        
        <div className="grid grid-cols-3 gap-3">
          {/* Moneyline */}
          <div className="cosmic-card rounded-xl p-3 text-center">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Moneyline</span>
            <div className="mt-2 space-y-1">
              <p className="text-sm font-semibold tabular-nums">{formatOdds(game.odds.moneyline.away)}</p>
              <p className="text-sm font-semibold tabular-nums">{formatOdds(game.odds.moneyline.home)}</p>
            </div>
          </div>

          {/* Spread */}
          <div className="cosmic-card rounded-xl p-3 text-center">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Spread</span>
            <div className="mt-2 space-y-1">
              <p className="text-sm font-semibold tabular-nums">{game.odds.spread.away > 0 ? "+" : ""}{game.odds.spread.away}</p>
              <p className="text-sm font-semibold tabular-nums">{game.odds.spread.home > 0 ? "+" : ""}{game.odds.spread.home}</p>
            </div>
          </div>

          {/* Total */}
          <div className="cosmic-card rounded-xl p-3 text-center">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</span>
            <div className="mt-2 space-y-1">
              <p className="text-sm font-semibold tabular-nums">O {game.odds.total.line}</p>
              <p className="text-sm font-semibold tabular-nums">U {game.odds.total.line}</p>
            </div>
          </div>
        </div>

        {/* Placeholder sections */}
        <div className="cosmic-card rounded-xl p-6 text-center mt-6">
          <Star className="h-8 w-8 text-primary/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">Cosmic Analysis</p>
          <p className="text-xs text-muted-foreground mt-1">
            Horary charts, scoring models, and player props coming in Phase 2
          </p>
        </div>
      </div>
    </div>
  );
};

export default GameDetail;
