import { cn } from "@/lib/utils";
import type { LiveGameVisualState } from "@/lib/pbp-event-parser";

interface WatchHeaderScorebarProps {
  state: LiveGameVisualState;
}

export function WatchHeaderScorebar({ state }: WatchHeaderScorebarProps) {
  const possHome = state.possessionTeamId === state.homeTeamId;
  const possAway = state.possessionTeamId === state.awayTeamId;

  const periodLabel = state.period <= 4 ? `Q${state.period}` : `OT${state.period - 4}`;

  return (
    <div className="relative flex items-center justify-between px-4 py-3 rounded-xl bg-card/80 border border-border/50 backdrop-blur-sm">
      {/* LIVE + Admin badges */}
      <div className="absolute -top-2.5 left-3 flex items-center gap-1.5">
        <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-cosmic-red/20 text-cosmic-red border border-cosmic-red/30 animate-pulse">
          LIVE
        </span>
        <span className="text-[7px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50">
          Admin Preview
        </span>
      </div>

      {/* Away team */}
      <div className="flex items-center gap-2">
        {possAway && (
          <span className="w-1.5 h-1.5 rounded-full bg-cosmic-cyan animate-pulse" />
        )}
        <span className="text-xs font-bold text-muted-foreground tracking-wide">
          {state.awayTeamId}
        </span>
        <span className="text-2xl font-bold tabular-nums text-foreground font-heading">
          {state.awayScore}
        </span>
      </div>

      {/* Center: period + clock */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
          {periodLabel}
        </span>
        <span className="text-lg font-bold tabular-nums text-foreground font-heading">
          {state.clockDisplay || "—"}
        </span>
      </div>

      {/* Home team */}
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold tabular-nums text-foreground font-heading">
          {state.homeScore}
        </span>
        <span className="text-xs font-bold text-muted-foreground tracking-wide">
          {state.homeTeamId}
        </span>
        {possHome && (
          <span className="w-1.5 h-1.5 rounded-full bg-cosmic-cyan animate-pulse" />
        )}
      </div>
    </div>
  );
}
