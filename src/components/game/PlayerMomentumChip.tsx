import { cn } from "@/lib/utils";
import { PLAYER_MOMENTUM_META, SURGE_META, type PlayerMomentum } from "@/hooks/use-player-momentum";

/** Compact chip for tracked prop cards */
export function PlayerMomentumChip({ momentum }: { momentum: PlayerMomentum | null }) {
  if (!momentum || momentum.momentumState === "neutral") return null;
  const meta = PLAYER_MOMENTUM_META[momentum.momentumState];

  return (
    <span className={cn("text-[8px] font-bold inline-flex items-center gap-0.5", meta.color)}>
      {meta.emoji} {meta.label}
    </span>
  );
}

/** Surge state chip */
export function PlayerSurgeChip({ momentum }: { momentum: PlayerMomentum | null }) {
  if (!momentum || momentum.surgeState === "neutral") return null;
  const meta = SURGE_META[momentum.surgeState];
  if (!meta.label) return null;

  return (
    <span className="text-[8px] font-semibold inline-flex items-center gap-0.5 text-cosmic-cyan">
      {meta.emoji} {meta.label}
    </span>
  );
}

/** Expanded player momentum panel for prop detail */
export function PlayerMomentumDetail({ momentum }: { momentum: PlayerMomentum }) {
  const meta = PLAYER_MOMENTUM_META[momentum.momentumState];

  return (
    <div className="space-y-1.5 rounded-lg border border-border/20 bg-card/30 p-2">
      <div className="flex items-center justify-between">
        <span className={cn("text-[10px] font-bold", meta.color)}>
          {meta.emoji} Player: {meta.label}
        </span>
        <span className="text-[8px] text-muted-foreground">
          ×{momentum.environmentMultiplier.toFixed(2)} env
        </span>
      </div>

      {momentum.surgeState !== "neutral" && (
        <div className="text-[9px] text-cosmic-cyan">
          {SURGE_META[momentum.surgeState].emoji} {SURGE_META[momentum.surgeState].label}
        </div>
      )}

      <div className="grid grid-cols-3 gap-1 text-center">
        <MiniStat label="PTS" value={momentum.pointsSupportScore} />
        <MiniStat label="REB" value={momentum.reboundsSupportScore} />
        <MiniStat label="AST" value={momentum.assistsSupportScore} />
      </div>

      <div className="flex flex-wrap gap-1">
        {momentum.coolingRisk > 40 && (
          <span className="text-[7px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-semibold">
            Cool Risk {momentum.coolingRisk}
          </span>
        )}
        {momentum.deadZoneRisk > 40 && (
          <span className="text-[7px] px-1 py-0.5 rounded bg-destructive/10 text-destructive font-semibold">
            Dead Zone {momentum.deadZoneRisk}
          </span>
        )}
        {momentum.closerActivationScore > 70 && (
          <span className="text-[7px] px-1 py-0.5 rounded bg-cosmic-green/10 text-cosmic-green font-semibold">
            Closer {momentum.closerActivationScore}
          </span>
        )}
        {momentum.roleShiftState && (
          <span className="text-[7px] px-1 py-0.5 rounded bg-cosmic-gold/10 text-cosmic-gold font-semibold">
            {momentum.roleShiftState}
          </span>
        )}
      </div>

      <p className="text-[8px] text-muted-foreground italic">{momentum.momentumNote}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  const color = value >= 60 ? "text-cosmic-green" : value >= 35 ? "text-cosmic-gold" : "text-cosmic-red";
  return (
    <div>
      <p className={cn("text-[10px] font-bold tabular-nums", color)}>{value}</p>
      <p className="text-[7px] text-muted-foreground uppercase">{label}</p>
    </div>
  );
}
