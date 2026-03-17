import { cn } from "@/lib/utils";
import { useGameMomentum, getMomentumColor, getMomentumIcon, type GameMomentumState } from "@/hooks/use-game-momentum";
import { Flame, Zap, Wind, Snowflake, AlertTriangle } from "lucide-react";

interface GameMomentumBannerProps {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  isLive?: boolean;
}

function formatDrought(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function GameMomentumBanner({ gameId, homeAbbr, awayAbbr, isLive = false }: GameMomentumBannerProps) {
  const momentum = useGameMomentum(gameId, isLive);

  if (!momentum) return null;

  const icon = getMomentumIcon(momentum.momentumLabel);
  const colorClass = getMomentumColor(momentum.momentumLabel);
  const favoredTeam = momentum.momentumSide === "home" ? homeAbbr : momentum.momentumSide === "away" ? awayAbbr : null;

  return (
    <div className="cosmic-card rounded-xl p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <div>
            <p className={cn("text-xs font-bold", colorClass)}>
              {momentum.momentumLabel}
            </p>
            <p className="text-[9px] text-muted-foreground">
              {favoredTeam ? `${favoredTeam} momentum` : "Even flow"}
              {momentum.tempoLabel !== "Neutral" && ` · ${momentum.tempoLabel} pace`}
            </p>
          </div>
        </div>

        {/* Momentum score bar */}
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] text-muted-foreground font-bold">{awayAbbr}</span>
          <div className="w-20 h-1.5 bg-border rounded-full relative overflow-hidden">
            <div
              className="absolute top-0 h-full rounded-full transition-all duration-500 bg-primary"
              style={{
                left: momentum.momentumScore >= 0 ? "50%" : `${50 + momentum.momentumScore / 2}%`,
                width: `${Math.abs(momentum.momentumScore) / 2}%`,
              }}
            />
            <div className="absolute top-0 left-1/2 w-px h-full bg-muted-foreground/40" />
          </div>
          <span className="text-[8px] text-muted-foreground font-bold">{homeAbbr}</span>
        </div>
      </div>

      {/* Detail chips */}
      <div className="flex flex-wrap gap-1">
        {/* Recent runs */}
        {momentum.recentRunHome > 0 && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            {homeAbbr} {momentum.recentRunHome}–{momentum.recentRunAway} run
          </span>
        )}
        {momentum.recentRunAway > momentum.recentRunHome && momentum.recentRunAway > 0 && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-cosmic-cyan/10 text-cosmic-cyan border border-cosmic-cyan/20">
            {awayAbbr} {momentum.recentRunAway}–{momentum.recentRunHome} run
          </span>
        )}

        {/* Droughts */}
        {momentum.droughtHomeSec >= 120 && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
            {homeAbbr} drought {formatDrought(momentum.droughtHomeSec)}
          </span>
        )}
        {momentum.droughtAwaySec >= 120 && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
            {awayAbbr} drought {formatDrought(momentum.droughtAwaySec)}
          </span>
        )}

        {/* Pressure indicators */}
        {momentum.inBonusHome && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-cosmic-gold/10 text-cosmic-gold border border-cosmic-gold/20">
            {homeAbbr} Bonus
          </span>
        )}
        {momentum.inBonusAway && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-cosmic-gold/10 text-cosmic-gold border border-cosmic-gold/20">
            {awayAbbr} Bonus
          </span>
        )}
        {momentum.orebPressureTeam && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
            {momentum.orebPressureTeam} OREB Pressure
          </span>
        )}

        {/* Pace chip */}
        {momentum.paceEstimate != null && (
          <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
            Pace {momentum.paceEstimate.toFixed(0)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Compact momentum indicator for prop cards */
export function MomentumChip({ gameId, isLive }: { gameId: string; isLive?: boolean }) {
  const momentum = useGameMomentum(gameId, isLive);
  if (!momentum || momentum.momentumLabel === "Neutral") return null;

  const icon = getMomentumIcon(momentum.momentumLabel);
  const colorClass = getMomentumColor(momentum.momentumLabel);

  return (
    <span className={cn("text-[8px] font-bold inline-flex items-center gap-0.5", colorClass)}>
      {icon} {momentum.momentumLabel}
    </span>
  );
}
