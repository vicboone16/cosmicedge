import { useNavigate } from "react-router-dom";
import { Zap, Sparkles, Trophy, ArrowRight, TrendingUp } from "lucide-react";
import { useParlayPicks, getTierEmoji, getElementEmoji } from "@/hooks/use-cosmic-picks";
import type { GameWithOdds } from "@/hooks/use-games";
import { cn } from "@/lib/utils";

interface Props {
  games: GameWithOdds[] | undefined;
}

const ELEMENT_GLOW: Record<string, string> = {
  Fire: "shadow-[0_0_12px_rgba(255,165,0,0.15)]",
  Earth: "shadow-[0_0_12px_rgba(34,197,94,0.1)]",
  Air: "shadow-[0_0_12px_rgba(168,162,255,0.12)]",
  Water: "shadow-[0_0_12px_rgba(56,189,248,0.12)]",
};

function formatOdds(odds: number): string {
  if (odds === 0) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatProb(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export function CosmicParlayCard({ games }: Props) {
  const navigate = useNavigate();
  const { legs, combinedProb, combinedAmericanOdds, isLoading } = useParlayPicks(games, 4);

  if (isLoading || legs.length < 2) return null;

  const impliedPayout = combinedProb > 0
    ? `${(1 / combinedProb).toFixed(1)}x`
    : "—";

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-primary" />
          Cosmic Parlay of the Day
        </h2>
      </div>

      <div className="cosmic-card rounded-2xl p-4 space-y-3 relative overflow-hidden">
        {/* Decorative cosmic shimmer */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-radial from-cosmic-lavender/10 to-transparent rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-radial from-cosmic-gold/8 to-transparent rounded-full blur-2xl pointer-events-none" />

        {/* Header with odds */}
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-cosmic-gold/20 flex items-center justify-center">
              <Trophy className="h-4 w-4 text-cosmic-gold" />
            </div>
            <div>
              <p className="text-xs font-bold font-display text-foreground">
                {legs.length}-Leg Cosmic Parlay
              </p>
              <p className="text-[10px] text-muted-foreground">
                AI-curated across {new Set(legs.map(l => l.league)).size} sport{new Set(legs.map(l => l.league)).size > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold font-mono text-cosmic-gold">
              {formatOdds(combinedAmericanOdds)}
            </p>
            <p className="text-[9px] text-muted-foreground">
              {impliedPayout} payout
            </p>
          </div>
        </div>

        {/* Legs */}
        <div className="space-y-2">
          {legs.map((leg, i) => (
            <button
              key={leg.gameId}
              onClick={() => navigate(`/game/${leg.gameId}`)}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                "bg-gradient-to-r from-secondary/50 to-secondary/20 border border-border/30",
                "hover:border-primary/30 hover:from-primary/5 hover:to-secondary/30",
                ELEMENT_GLOW[leg.pickElement ?? ""] || "",
              )}
            >
              {/* Leg number */}
              <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-primary">{i + 1}</span>
              </div>

              {/* Pick details */}
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                    {leg.league}
                  </span>
                  <span className="text-xs font-semibold text-foreground truncate">
                    {leg.pickTeam} ML
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    vs {leg.opponentAbbr}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    {getElementEmoji(leg.pickElement)} {leg.pickElement || "—"}
                  </span>
                  <span className="text-[10px] text-cosmic-green flex items-center gap-0.5">
                    <TrendingUp className="h-2.5 w-2.5" />
                    +{Math.abs(leg.edge).toFixed(1)} edge
                  </span>
                </div>
              </div>

              {/* Tier + ML */}
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-mono font-semibold text-foreground">
                  {leg.bookML != null ? formatOdds(leg.bookML) : "—"}
                </p>
                <p className="text-[10px]">
                  {getTierEmoji(leg.tier)} {leg.tier}-tier
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Combined probability + CTA */}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-cosmic-lavender" />
            <span className="text-[10px] text-muted-foreground">
              Combined win prob: <span className="font-semibold text-foreground">{formatProb(combinedProb)}</span>
            </span>
          </div>
          <button
            onClick={() => navigate("/skyspread")}
            className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            Track in SkySpread <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </section>
  );
}
