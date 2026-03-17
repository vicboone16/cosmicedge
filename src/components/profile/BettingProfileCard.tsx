import { useBettingProfile, ARCHETYPE_META, computeFitScore } from "@/hooks/use-betting-profile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function BettingProfileCard() {
  const { profile, isLoading, generateProfile, isGenerating, hasProfile } = useBettingProfile();

  if (isLoading) {
    return (
      <div className="cosmic-card rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-2" />
        <div className="h-3 bg-muted rounded w-2/3" />
      </div>
    );
  }

  if (!hasProfile) {
    return (
      <div className="cosmic-card rounded-xl p-4 space-y-3 text-center">
        <p className="text-xs font-semibold text-foreground">Personal Betting Profile</p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Generate your betting profile to get personalized recommendations, fit scores, and coaching insights from Astra.
        </p>
        <Button
          size="sm"
          onClick={() => generateProfile()}
          disabled={isGenerating}
          className="text-xs"
        >
          {isGenerating ? "Analyzing…" : "Generate My Profile"}
        </Button>
      </div>
    );
  }

  const meta = ARCHETYPE_META[profile!.betting_archetype] || ARCHETYPE_META.selective_hunter;

  return (
    <div className="cosmic-card rounded-xl p-4 space-y-3">
      {/* Archetype header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta.emoji}</span>
          <div>
            <p className="text-xs font-bold text-foreground">{meta.label}</p>
            <p className="text-[9px] text-muted-foreground">{meta.description}</p>
          </div>
        </div>
        <Badge variant="secondary" className="text-[8px]">
          {profile!.risk_tolerance}
        </Badge>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-sm font-bold tabular-nums text-foreground">{profile!.bets_analyzed}</p>
          <p className="text-[8px] text-muted-foreground">Bets Analyzed</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold tabular-nums text-foreground">{profile!.games_analyzed}</p>
          <p className="text-[8px] text-muted-foreground">Games</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold tabular-nums text-foreground">
            {profile!.over_under_bias > 0.1 ? "Over" : profile!.over_under_bias < -0.1 ? "Under" : "Balanced"}
          </p>
          <p className="text-[8px] text-muted-foreground">Lean</p>
        </div>
      </div>

      {/* Best/worst markets */}
      {(profile!.best_performing_markets.length > 0 || profile!.worst_performing_markets.length > 0) && (
        <div className="space-y-1.5">
          {profile!.best_performing_markets.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[8px] text-cosmic-green font-bold">Best:</span>
              {profile!.best_performing_markets.map(m => (
                <Badge key={m} variant="outline" className="text-[7px] px-1 py-0 h-4 border-cosmic-green/30 text-cosmic-green">
                  {m}
                </Badge>
              ))}
            </div>
          )}
          {profile!.worst_performing_markets.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[8px] text-destructive font-bold">Leak:</span>
              {profile!.worst_performing_markets.map(m => (
                <Badge key={m} variant="outline" className="text-[7px] px-1 py-0 h-4 border-destructive/30 text-destructive">
                  {m}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Strongest stat types */}
      {profile!.strongest_stat_types.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[8px] text-primary font-bold">Strongest:</span>
          {profile!.strongest_stat_types.map(s => (
            <Badge key={s} variant="outline" className="text-[7px] px-1 py-0 h-4 border-primary/30 text-primary">
              {s}
            </Badge>
          ))}
        </div>
      )}

      {/* Regenerate */}
      <div className="flex items-center justify-between pt-1 border-t border-border/30">
        <p className="text-[8px] text-muted-foreground">
          Generated {profile!.profile_generated_at ? new Date(profile!.profile_generated_at).toLocaleDateString() : "—"}
        </p>
        <button
          onClick={() => generateProfile()}
          disabled={isGenerating}
          className="text-[9px] text-primary hover:underline"
        >
          {isGenerating ? "Updating…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}

/** Compact fit score badge for prop/recommendation cards */
export function FitScoreBadge({
  marketType,
  statType,
  odds,
  isLive,
}: {
  marketType: string;
  statType?: string;
  odds?: number;
  isLive?: boolean;
}) {
  const { profile } = useBettingProfile();
  const fit = computeFitScore(profile ?? null, marketType, statType, odds, isLive);

  if (!profile || fit.score === 50) return null;

  return (
    <span
      className={cn(
        "text-[7px] font-bold px-1.5 py-0.5 rounded-full border",
        fit.score >= 75
          ? "bg-cosmic-green/10 text-cosmic-green border-cosmic-green/20"
          : fit.score >= 55
          ? "bg-primary/10 text-primary border-primary/20"
          : fit.score < 40
          ? "bg-destructive/10 text-destructive border-destructive/20"
          : "bg-muted text-muted-foreground border-border"
      )}
      title={fit.note}
    >
      {fit.label}
    </span>
  );
}
