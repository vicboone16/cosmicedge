import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { NormalizedPbpEvent, ZoneKey, AnimationKey } from "@/lib/pbp-event-parser";

interface LiveCourtCanvasProps {
  lastEvent: NormalizedPbpEvent | null;
  possessionTeamId: string | null;
  homeTeamId: string;
  awayTeamId: string;
}

// Zone positions on a normalized court (0-100 x, 0-100 y)
const ZONE_POSITIONS: Record<ZoneKey, { x: number; y: number }> = {
  restricted_area: { x: 82, y: 50 },
  paint: { x: 76, y: 50 },
  free_throw_line: { x: 70, y: 50 },
  midrange_left: { x: 65, y: 25 },
  midrange_center: { x: 62, y: 50 },
  midrange_right: { x: 65, y: 75 },
  corner_3_left: { x: 73, y: 5 },
  corner_3_right: { x: 73, y: 95 },
  wing_3_left: { x: 52, y: 18 },
  wing_3_right: { x: 52, y: 82 },
  top_3: { x: 48, y: 50 },
  backcourt: { x: 20, y: 50 },
  bench: { x: 10, y: 90 },
  sideline: { x: 50, y: 95 },
  unknown: { x: 50, y: 50 },
};

const ANIMATION_COLORS: Partial<Record<NonNullable<AnimationKey>, string>> = {
  made_2_basic: "bg-cosmic-green",
  made_3_basic: "bg-cosmic-green",
  dunk_finish: "bg-cosmic-green",
  layup_finish: "bg-cosmic-green",
  free_throw_make: "bg-cosmic-green",
  miss_2_basic: "bg-cosmic-red/60",
  miss_3_basic: "bg-cosmic-red/60",
  free_throw_miss: "bg-cosmic-red/60",
  def_rebound_secure: "bg-cosmic-cyan",
  off_rebound_reset: "bg-cosmic-gold",
  turnover_flip: "bg-cosmic-red",
  steal_flip: "bg-cosmic-cyan",
  foul_whistle: "bg-cosmic-gold/80",
  timeout_pause: "bg-muted-foreground/50",
};

export function LiveCourtCanvas({ lastEvent, possessionTeamId, homeTeamId, awayTeamId }: LiveCourtCanvasProps) {
  const eventZone = lastEvent?.zoneKey || "unknown";
  const pos = ZONE_POSITIONS[eventZone];
  const animColor = lastEvent?.animationKey ? ANIMATION_COLORS[lastEvent.animationKey] : null;
  const isScoring = lastEvent?.isScoringPlay;

  // Possession direction: arrow pointing right for home, left for away
  const possDirection = possessionTeamId === homeTeamId ? "→" : possessionTeamId === awayTeamId ? "←" : "";

  return (
    <div className="relative w-full aspect-[2/1] rounded-xl overflow-hidden bg-card border border-border/50">
      {/* Court SVG */}
      <svg viewBox="0 0 940 500" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Court background */}
        <rect x="0" y="0" width="940" height="500" fill="none" />

        {/* Court outline */}
        <rect x="20" y="20" width="900" height="460" rx="4" fill="none"
          stroke="hsl(var(--border))" strokeWidth="2" opacity="0.5" />

        {/* Half court line */}
        <line x1="470" y1="20" x2="470" y2="480" stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.4" />

        {/* Center circle */}
        <circle cx="470" cy="250" r="60" fill="none" stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.3" />
        <circle cx="470" cy="250" r="6" fill="hsl(var(--border))" opacity="0.3" />

        {/* Left 3-point arc */}
        <path d="M 20 60 L 140 60 Q 290 60 290 250 Q 290 440 140 440 L 20 440"
          fill="none" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.2" />

        {/* Right 3-point arc */}
        <path d="M 920 60 L 800 60 Q 650 60 650 250 Q 650 440 800 440 L 920 440"
          fill="none" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.2" />

        {/* Left paint */}
        <rect x="20" y="170" width="190" height="160" fill="hsl(var(--primary))" fillOpacity="0.04"
          stroke="hsl(var(--border))" strokeWidth="1" opacity="0.4" />

        {/* Right paint */}
        <rect x="730" y="170" width="190" height="160" fill="hsl(var(--primary))" fillOpacity="0.04"
          stroke="hsl(var(--border))" strokeWidth="1" opacity="0.4" />

        {/* Left restricted area */}
        <path d="M 20 210 Q 80 210 80 250 Q 80 290 20 290"
          fill="none" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.3" />

        {/* Right restricted area */}
        <path d="M 920 210 Q 860 210 860 250 Q 860 290 920 290"
          fill="none" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.3" />

        {/* Left basket */}
        <circle cx="50" cy="250" r="8" fill="none" stroke="hsl(var(--cosmic-gold))" strokeWidth="2" opacity="0.5" />

        {/* Right basket */}
        <circle cx="890" cy="250" r="8" fill="none" stroke="hsl(var(--cosmic-gold))" strokeWidth="2" opacity="0.5" />

        {/* Left FT line */}
        <line x1="210" y1="170" x2="210" y2="330" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.3" />

        {/* Right FT line */}
        <line x1="730" y1="170" x2="730" y2="330" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.3" />
      </svg>

      {/* Event marker */}
      {lastEvent && animColor && (
        <div
          className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ease-out"
          style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        >
          {/* Pulse ring for scoring plays */}
          {isScoring && (
            <div className={cn(
              "absolute inset-0 rounded-full animate-ping",
              animColor,
            )} style={{ width: 32, height: 32, margin: -8 }} />
          )}
          {/* Main marker */}
          <div className={cn(
            "w-4 h-4 rounded-full border-2 border-background shadow-lg",
            animColor,
            isScoring && "scale-125"
          )} />
        </div>
      )}

      {/* Possession indicator */}
      {possDirection && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-bold text-primary/60">
          {possessionTeamId} {possDirection}
        </div>
      )}

      {/* Timeout / Period overlay */}
      {lastEvent?.animationKey === "timeout_pause" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl">
          <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Timeout</span>
        </div>
      )}
      {lastEvent?.animationKey === "period_end_freeze" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl">
          <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">End of Period</span>
        </div>
      )}
    </div>
  );
}
