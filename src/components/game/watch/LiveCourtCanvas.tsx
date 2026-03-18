import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { NormalizedPbpEvent, ZoneKey, AnimationKey } from "@/lib/pbp-event-parser";

interface LiveCourtCanvasProps {
  lastEvent: NormalizedPbpEvent | null;
  recentEvents: NormalizedPbpEvent[];
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

const ANIMATION_BORDER_COLORS: Partial<Record<NonNullable<AnimationKey>, string>> = {
  made_2_basic: "border-cosmic-green",
  made_3_basic: "border-cosmic-green",
  dunk_finish: "border-cosmic-green",
  layup_finish: "border-cosmic-green",
  free_throw_make: "border-cosmic-green",
  miss_2_basic: "border-cosmic-red/60",
  miss_3_basic: "border-cosmic-red/60",
  free_throw_miss: "border-cosmic-red/60",
  def_rebound_secure: "border-cosmic-cyan",
  off_rebound_reset: "border-cosmic-gold",
  turnover_flip: "border-cosmic-red",
  steal_flip: "border-cosmic-cyan",
  foul_whistle: "border-cosmic-gold/80",
  timeout_pause: "border-muted-foreground/50",
};

interface CourtDot {
  id: string;
  event: NormalizedPbpEvent;
  pos: { x: number; y: number };
  color: string | null;
  borderColor: string | null;
  isLatest: boolean;
  playerName: string | null;
  label: string;
  opacity: number;
}

export function LiveCourtCanvas({ lastEvent, recentEvents, possessionTeamId, homeTeamId, awayTeamId }: LiveCourtCanvasProps) {
  const [selectedDotId, setSelectedDotId] = useState<string | null>(null);

  // Build unique player dots from recent events (last ~10 unique players)
  const dots = useMemo<CourtDot[]>(() => {
    const seen = new Map<string, CourtDot>();
    const eventsToShow = recentEvents.slice(-30); // look at last 30 events

    for (let i = eventsToShow.length - 1; i >= 0; i--) {
      const ev = eventsToShow[i];
      const playerKey = ev.primaryPlayerId || ev.sourceEventId;
      if (seen.has(playerKey) || seen.size >= 10) continue;
      // Skip non-action events
      if (ev.eventType === "timeout" || ev.eventType === "period_start" || ev.eventType === "period_end" || ev.eventType === "substitution") continue;

      const zone = ev.zoneKey || "unknown";
      // Add small jitter so dots in the same zone don't overlap
      const basePos = ZONE_POSITIONS[zone];
      const jitter = seen.size * 1.5;
      const pos = {
        x: basePos.x + (seen.size % 2 === 0 ? jitter : -jitter) * 0.3,
        y: basePos.y + (seen.size % 3 === 0 ? jitter : -jitter) * 0.4,
      };

      const isLatest = i === eventsToShow.length - 1;
      const age = eventsToShow.length - 1 - i;
      const opacity = Math.max(0.3, 1 - age * 0.08);

      seen.set(playerKey, {
        id: ev.sourceEventId,
        event: ev,
        pos,
        color: ev.animationKey ? ANIMATION_COLORS[ev.animationKey] || "bg-primary" : "bg-primary/40",
        borderColor: ev.animationKey ? ANIMATION_BORDER_COLORS[ev.animationKey] || "border-primary" : "border-primary/40",
        isLatest,
        playerName: ev.primaryPlayerId || null,
        label: ev.rawDescription?.slice(0, 60) || ev.eventType,
        opacity,
      });
    }

    return Array.from(seen.values());
  }, [recentEvents]);

  const possDirection = possessionTeamId === homeTeamId ? "→" : possessionTeamId === awayTeamId ? "←" : "";

  const handleDotClick = (dotId: string) => {
    setSelectedDotId(prev => prev === dotId ? null : dotId);
  };

  const selectedDot = dots.find(d => d.id === selectedDotId);

  return (
    <div className="relative w-full aspect-[2/1] rounded-xl overflow-hidden bg-card border border-border/50">
      {/* Court SVG */}
      <svg viewBox="0 0 940 500" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="940" height="500" fill="none" />
        <rect x="20" y="20" width="900" height="460" rx="4" fill="none"
          stroke="hsl(var(--border))" strokeWidth="2" opacity="0.5" />
        <line x1="470" y1="20" x2="470" y2="480" stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.4" />
        <circle cx="470" cy="250" r="60" fill="none" stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.3" />
        <circle cx="470" cy="250" r="6" fill="hsl(var(--border))" opacity="0.3" />
        <path d="M 20 60 L 140 60 Q 290 60 290 250 Q 290 440 140 440 L 20 440"
          fill="none" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.2" />
        <path d="M 920 60 L 800 60 Q 650 60 650 250 Q 650 440 800 440 L 920 440"
          fill="none" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.2" />
        <rect x="20" y="170" width="190" height="160" fill="hsl(var(--primary))" fillOpacity="0.04"
          stroke="hsl(var(--border))" strokeWidth="1" opacity="0.4" />
        <rect x="730" y="170" width="190" height="160" fill="hsl(var(--primary))" fillOpacity="0.04"
          stroke="hsl(var(--border))" strokeWidth="1" opacity="0.4" />
        <path d="M 20 210 Q 80 210 80 250 Q 80 290 20 290"
          fill="none" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.3" />
        <path d="M 920 210 Q 860 210 860 250 Q 860 290 920 290"
          fill="none" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.3" />
        <circle cx="50" cy="250" r="8" fill="none" stroke="hsl(var(--cosmic-gold))" strokeWidth="2" opacity="0.5" />
        <circle cx="890" cy="250" r="8" fill="none" stroke="hsl(var(--cosmic-gold))" strokeWidth="2" opacity="0.5" />
        <line x1="210" y1="170" x2="210" y2="330" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.3" />
        <line x1="730" y1="170" x2="730" y2="330" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.3" />
      </svg>

      {/* Multiple player dots */}
      {dots.map((dot) => (
        <button
          key={dot.id}
          className={cn(
            "absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ease-out cursor-pointer z-10 group",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          )}
          style={{ left: `${dot.pos.x}%`, top: `${dot.pos.y}%`, opacity: dot.opacity }}
          onClick={() => handleDotClick(dot.id)}
          aria-label={dot.label}
        >
          {/* Pulse ring for latest scoring play */}
          {dot.isLatest && dot.event.isScoringPlay && (
            <div className={cn(
              "absolute inset-0 rounded-full animate-ping",
              dot.color,
            )} style={{ width: 32, height: 32, margin: -8 }} />
          )}
          {/* Main marker */}
          <div className={cn(
            "rounded-full border-2 border-background shadow-lg",
            dot.color,
            dot.isLatest ? "w-5 h-5 scale-110" : "w-3.5 h-3.5",
            dot.event.isScoringPlay && dot.isLatest && "scale-125"
          )} />
          {/* Team indicator ring */}
          {dot.event.teamId && (
            <div className={cn(
              "absolute -bottom-1 -right-1 w-2 h-2 rounded-full border border-background",
              dot.event.teamId === homeTeamId ? "bg-primary" : "bg-cosmic-cyan"
            )} />
          )}
        </button>
      ))}

      {/* Tooltip popup for selected dot */}
      {selectedDot && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: `${Math.min(Math.max(selectedDot.pos.x, 15), 85)}%`,
            top: `${selectedDot.pos.y - 8}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl text-xs max-w-[200px] pointer-events-auto">
            <div className="font-bold text-foreground truncate">
              {selectedDot.event.primaryPlayerId || selectedDot.event.teamId || "Unknown"}
            </div>
            <div className="text-muted-foreground mt-0.5 leading-tight">
              {selectedDot.event.rawDescription?.slice(0, 80) || selectedDot.event.eventType}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/70">
              <span>Q{selectedDot.event.period}</span>
              <span>{selectedDot.event.clockDisplay}</span>
              {selectedDot.event.isScoringPlay && (
                <span className="text-cosmic-green font-bold">+{selectedDot.event.pointsScored}</span>
              )}
            </div>
          </div>
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

      {/* Dot count indicator */}
      <div className="absolute top-2 right-2 text-[9px] text-muted-foreground/50 font-mono">
        {dots.length} active
      </div>
    </div>
  );
}
