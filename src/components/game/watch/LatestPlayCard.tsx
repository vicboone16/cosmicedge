import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { NormalizedPbpEvent } from "@/lib/pbp-event-parser";

interface LatestPlayCardProps {
  event: NormalizedPbpEvent | null;
  homeAbbr: string;
  awayAbbr: string;
}

const EVENT_CONFIG: Record<string, { label: string; icon: string; bg: string; text: string; border: string }> = {
  made_shot:         { label: "Made Shot",       icon: "🏀", bg: "bg-green-500/15",  text: "text-green-400",  border: "border-green-500/30" },
  missed_shot:       { label: "Missed Shot",     icon: "✕",  bg: "bg-red-500/15",   text: "text-red-400",    border: "border-red-500/30" },
  free_throw_made:   { label: "FT Made",         icon: "●",  bg: "bg-green-500/15", text: "text-green-400",  border: "border-green-500/30" },
  free_throw_missed: { label: "FT Missed",       icon: "○",  bg: "bg-red-500/15",   text: "text-red-400",    border: "border-red-500/30" },
  rebound_offensive: { label: "Off. Rebound",    icon: "↗",  bg: "bg-amber-500/15", text: "text-amber-400",  border: "border-amber-500/30" },
  rebound_defensive: { label: "Def. Rebound",    icon: "↙",  bg: "bg-sky-500/15",   text: "text-sky-400",    border: "border-sky-500/30" },
  turnover:          { label: "Turnover",        icon: "⇄",  bg: "bg-orange-500/15",text: "text-orange-400", border: "border-orange-500/30" },
  steal:             { label: "Steal",           icon: "⚡",  bg: "bg-sky-500/15",   text: "text-sky-400",    border: "border-sky-500/30" },
  block:             { label: "Block",           icon: "🛡",  bg: "bg-violet-500/15",text: "text-violet-400", border: "border-violet-500/30" },
  foul_personal:     { label: "Personal Foul",   icon: "🚨", bg: "bg-yellow-500/15",text: "text-yellow-400", border: "border-yellow-500/30" },
  foul_shooting:     { label: "Shooting Foul",   icon: "🚨", bg: "bg-yellow-500/15",text: "text-yellow-400", border: "border-yellow-500/30" },
  foul_offensive:    { label: "Offensive Foul",  icon: "🚨", bg: "bg-orange-500/15",text: "text-orange-400", border: "border-orange-500/30" },
  foul_technical:    { label: "Technical Foul",  icon: "⚠",  bg: "bg-red-500/15",   text: "text-red-400",    border: "border-red-500/30" },
  timeout:           { label: "Timeout",         icon: "⏸",  bg: "bg-muted/40",     text: "text-muted-foreground", border: "border-border/50" },
  substitution:      { label: "Substitution",    icon: "↔",  bg: "bg-muted/30",     text: "text-muted-foreground", border: "border-border/40" },
  jump_ball:         { label: "Jump Ball",       icon: "▲",  bg: "bg-sky-500/10",   text: "text-sky-400",    border: "border-sky-500/20" },
  unknown:           { label: "Play",            icon: "·",  bg: "bg-muted/30",     text: "text-muted-foreground", border: "border-border/40" },
};

export function LatestPlayCard({ event, homeAbbr, awayAbbr }: LatestPlayCardProps) {
  if (!event) {
    return (
      <div className="flex items-center justify-center py-5 rounded-xl border border-border/25 bg-card/40">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" />
          <p className="text-xs text-muted-foreground">Waiting for live play-by-play…</p>
        </div>
      </div>
    );
  }

  const cfg = EVENT_CONFIG[event.eventType] || EVENT_CONFIG.unknown;
  const periodLabel = event.period <= 4 ? `Q${event.period}` : `OT${event.period - 4}`;
  const isScoring = event.isScoringPlay && event.pointsScored;

  return (
    // Key on sourceEventId forces a re-mount animation every time the play changes
    <AnimatePresence mode="wait">
      <motion.div
        key={event.sourceEventId}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className={cn(
          "relative rounded-xl border p-3 overflow-hidden",
          cfg.bg, cfg.border,
        )}
      >
        {/* Left accent bar */}
        <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-xl", cfg.text.replace("text-", "bg-"))} />

        <div className="pl-2 space-y-2">
          {/* Top row: badge + team + period/clock */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Event type badge */}
              <span className={cn(
                "inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                cfg.bg, cfg.text, cfg.border,
              )}>
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
              </span>

              {/* Team */}
              {event.teamId && (
                <span className={cn(
                  "text-[10px] font-black tracking-wide",
                  event.teamId === homeAbbr ? "text-primary" : "text-sky-400"
                )}>
                  {event.teamId}
                </span>
              )}

              {/* Points badge */}
              {isScoring && (
                <motion.span
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-[11px] font-black text-green-400 tabular-nums"
                >
                  +{event.pointsScored}
                </motion.span>
              )}
            </div>

            {/* Period + clock */}
            <span className="text-[9px] tabular-nums text-muted-foreground/60 shrink-0 font-mono">
              {periodLabel} · {event.clockDisplay || "—"}
            </span>
          </div>

          {/* Play description */}
          <p className="text-sm text-foreground font-medium leading-snug">
            {event.rawDescription || "—"}
          </p>

          {/* Score after play */}
          {event.scoreAwayAfter != null && event.scoreHomeAfter != null && (
            <div className="flex items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground/70">
              <span className="font-bold">{awayAbbr}</span>
              <span className="font-black text-foreground/80">
                {event.scoreAwayAfter} – {event.scoreHomeAfter}
              </span>
              <span className="font-bold">{homeAbbr}</span>
            </div>
          )}

          {/* Player name */}
          {event.primaryPlayerId && (
            <p className="text-[10px] font-semibold text-primary/70 mt-0.5">
              {event.primaryPlayerId}
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
