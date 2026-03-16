import { cn } from "@/lib/utils";
import type { NormalizedPbpEvent } from "@/lib/pbp-event-parser";

interface LatestPlayCardProps {
  event: NormalizedPbpEvent | null;
  homeAbbr: string;
  awayAbbr: string;
}

const EVENT_LABELS: Record<string, string> = {
  made_shot: "Made Shot",
  missed_shot: "Missed Shot",
  free_throw_made: "FT Made",
  free_throw_missed: "FT Missed",
  rebound_offensive: "Off. Rebound",
  rebound_defensive: "Def. Rebound",
  turnover: "Turnover",
  steal: "Steal",
  block: "Block",
  foul_personal: "Personal Foul",
  foul_shooting: "Shooting Foul",
  foul_offensive: "Offensive Foul",
  foul_technical: "Technical Foul",
  foul_loose_ball: "Loose Ball Foul",
  timeout: "Timeout",
  substitution: "Substitution",
  jump_ball: "Jump Ball",
  violation: "Violation",
  review: "Review",
  period_start: "Period Start",
  period_end: "Period End",
  unknown: "Play",
};

const EVENT_COLORS: Record<string, string> = {
  made_shot: "text-cosmic-green border-cosmic-green/30",
  missed_shot: "text-cosmic-red border-cosmic-red/30",
  free_throw_made: "text-cosmic-green border-cosmic-green/30",
  free_throw_missed: "text-cosmic-red border-cosmic-red/30",
  rebound_offensive: "text-cosmic-gold border-cosmic-gold/30",
  rebound_defensive: "text-cosmic-cyan border-cosmic-cyan/30",
  turnover: "text-cosmic-red border-cosmic-red/30",
  steal: "text-cosmic-cyan border-cosmic-cyan/30",
  foul_personal: "text-cosmic-gold border-cosmic-gold/30",
  foul_shooting: "text-cosmic-gold border-cosmic-gold/30",
  timeout: "text-muted-foreground border-border",
};

export function LatestPlayCard({ event, homeAbbr, awayAbbr }: LatestPlayCardProps) {
  if (!event) {
    return (
      <div className="p-4 rounded-lg border border-border/30 bg-card/50">
        <p className="text-xs text-muted-foreground text-center">Waiting for live play-by-play…</p>
      </div>
    );
  }

  const label = EVENT_LABELS[event.eventType] || "Play";
  const colorClass = EVENT_COLORS[event.eventType] || "text-muted-foreground border-border";
  const periodLabel = event.period <= 4 ? `Q${event.period}` : `OT${event.period - 4}`;

  return (
    <div className="p-3 rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm space-y-2">
      {/* Event type badge + score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
            colorClass
          )}>
            {label}
          </span>
          {event.teamId && (
            <span className="text-[10px] font-bold text-primary">{event.teamId}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground">
          <span>{periodLabel}</span>
          <span>·</span>
          <span>{event.clockDisplay || "—"}</span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-foreground leading-relaxed">
        {event.rawDescription || "—"}
      </p>

      {/* Score after */}
      {event.scoreAwayAfter != null && event.scoreHomeAfter != null && (
        <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
          <span className="font-bold">{awayAbbr}</span>
          <span>{event.scoreAwayAfter}</span>
          <span>—</span>
          <span>{event.scoreHomeAfter}</span>
          <span className="font-bold">{homeAbbr}</span>
        </div>
      )}

      {/* Player */}
      {event.primaryPlayerId && (
        <p className="text-[10px] text-primary/70">{event.primaryPlayerId}</p>
      )}
    </div>
  );
}
