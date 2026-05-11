import { useNavigate } from "react-router-dom";
import { Sparkles, TrendingUp, ChevronRight } from "lucide-react";
import { useCosmicPicks, getTierEmoji, getElementEmoji, type CosmicPick } from "@/hooks/use-cosmic-picks";
import type { GameWithOdds } from "@/hooks/use-games";
import { cn } from "@/lib/utils";

interface Props {
  games: GameWithOdds[] | undefined;
}

const TIER_COLORS: Record<string, string> = {
  S: "from-cosmic-gold/25 to-cosmic-gold/10 border-cosmic-gold/40 ring-cosmic-gold/20",
  A: "from-cosmic-green/20 to-cosmic-green/8 border-cosmic-green/35 ring-cosmic-green/15",
  B: "from-cosmic-lavender/20 to-cosmic-lavender/8 border-cosmic-lavender/30 ring-cosmic-lavender/15",
  C: "from-secondary/40 to-secondary/20 border-border/40 ring-border/10",
};

const TIER_TEXT: Record<string, string> = {
  S: "text-cosmic-gold",
  A: "text-cosmic-green",
  B: "text-cosmic-lavender",
  C: "text-muted-foreground",
};

const LEAGUE_COLORS: Record<string, string> = {
  NBA: "bg-orange-500/20 text-orange-400",
  MLB: "bg-red-500/20 text-red-400",
  NHL: "bg-blue-500/20 text-blue-400",
  NFL: "bg-green-500/20 text-green-400",
};

function formatML(ml: number | null): string {
  if (ml == null) return "";
  return ml > 0 ? `+${ml}` : `${ml}`;
}

function formatProb(prob: number): string {
  return `${Math.round(prob * 100)}%`;
}

function CosmicPickChip({ pick }: { pick: CosmicPick }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/game/${pick.gameId}`)}
      className={cn(
        "flex-shrink-0 rounded-xl px-3 py-2.5 border bg-gradient-to-br transition-all duration-200",
        "hover:scale-[1.02] active:scale-[0.98] ring-1",
        TIER_COLORS[pick.tier],
      )}
      style={{ minWidth: "140px", maxWidth: "170px" }}
    >
      {/* League + Tier badge */}
      <div className="flex items-center justify-between mb-1.5">
        <span className={cn("text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full", LEAGUE_COLORS[pick.league] || "bg-secondary text-muted-foreground")}>
          {pick.league}
        </span>
        <span className="text-[10px] font-bold">
          {getTierEmoji(pick.tier)} {pick.tier}
        </span>
      </div>

      {/* Pick team + opponent */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn("text-sm font-bold font-display", TIER_TEXT[pick.tier])}>
          {pick.pickTeam}
        </span>
        <span className="text-[10px] text-muted-foreground">vs</span>
        <span className="text-xs text-muted-foreground">{pick.opponentAbbr}</span>
      </div>

      {/* Edge + Win prob row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <TrendingUp className="h-2.5 w-2.5 text-cosmic-green" />
          <span className="text-[10px] font-semibold text-cosmic-green">
            +{Math.abs(pick.edge).toFixed(1)}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatProb(pick.winProb)}
        </span>
      </div>

      {/* ML + Element */}
      <div className="flex items-center justify-between mt-1">
        {pick.bookML != null && (
          <span className="text-[10px] font-mono text-foreground/70">
            {formatML(pick.bookML)}
          </span>
        )}
        <span className="text-[10px]">
          {getElementEmoji(pick.pickElement)}
        </span>
      </div>
    </button>
  );
}

export function TopCosmicPicksStrip({ games }: Props) {
  const { data: picks, isLoading } = useCosmicPicks(games, 8);

  if (isLoading || !picks || picks.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-cosmic-gold" />
          Top Cosmic Picks
        </h2>
        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
          {picks.length} picks <ChevronRight className="h-3 w-3" />
        </span>
      </div>
      <div
        className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1"
        style={{ touchAction: "pan-x", WebkitOverflowScrolling: "touch" }}
      >
        {picks.map((pick) => (
          <CosmicPickChip key={pick.gameId} pick={pick} />
        ))}
      </div>
    </section>
  );
}
