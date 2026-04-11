import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { NormalizedPbpEvent } from "@/lib/pbp-event-parser";

interface RecentEventsListProps {
  events: NormalizedPbpEvent[];
  homeAbbr: string;
  awayAbbr: string;
}

const EVENT_ICON: Record<string, string> = {
  made_shot: "🏀",
  missed_shot: "✕",
  free_throw_made: "●",
  free_throw_missed: "○",
  rebound_offensive: "↗",
  rebound_defensive: "↙",
  turnover: "⇄",
  steal: "⚡",
  block: "🛡",
  foul_personal: "🚨",
  foul_shooting: "🚨",
  timeout: "⏸",
  substitution: "↔",
  jump_ball: "▲",
};

const EVENT_COLOR: Record<string, string> = {
  made_shot:        "text-green-400",
  free_throw_made:  "text-green-400",
  missed_shot:      "text-red-400",
  free_throw_missed:"text-red-400",
  rebound_offensive:"text-amber-400",
  rebound_defensive:"text-sky-400",
  turnover:         "text-orange-400",
  steal:            "text-sky-400",
  block:            "text-violet-400",
  foul_personal:    "text-yellow-400",
  foul_shooting:    "text-yellow-400",
  timeout:          "text-muted-foreground",
};

export function RecentEventsList({ events, homeAbbr, awayAbbr }: RecentEventsListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(events.length);

  // Scroll to top whenever a new event is added
  useEffect(() => {
    if (events.length !== prevCountRef.current) {
      prevCountRef.current = events.length;
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [events.length]);

  // Show last 12 events in reverse (newest first)
  const recent = events.slice(-12).reverse();

  if (recent.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Play-by-Play
        </span>
        <span className="text-[9px] text-muted-foreground/40 tabular-nums">
          {events.length} plays
        </span>
      </div>

      <div
        ref={listRef}
        className="max-h-52 overflow-y-auto rounded-xl border border-border/25 bg-card/40 backdrop-blur-sm divide-y divide-border/10 scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        <AnimatePresence initial={false}>
          {recent.map((ev, i) => {
            const isNewest = i === 0;
            const isHome = ev.teamId === homeAbbr;
            const isAway = ev.teamId === awayAbbr;
            const icon = EVENT_ICON[ev.eventType] || "·";
            const color = EVENT_COLOR[ev.eventType] || "text-muted-foreground/50";
            const periodLabel = ev.period <= 4 ? `Q${ev.period}` : `OT${ev.period - 4}`;

            return (
              <motion.div
                key={ev.sourceEventId}
                layout
                initial={{ opacity: 0, y: -8, backgroundColor: "rgba(99,102,241,0.15)" }}
                animate={{
                  opacity: 1,
                  y: 0,
                  backgroundColor: isNewest ? "rgba(99,102,241,0.06)" : "rgba(0,0,0,0)",
                }}
                transition={{ duration: 0.30, ease: "easeOut" }}
                className="flex items-start gap-2.5 px-3 py-2 relative"
              >
                {/* Live indicator on newest */}
                {isNewest && (
                  <span
                    className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl bg-primary/70"
                  />
                )}

                {/* Event icon */}
                <span className={cn("text-[11px] w-4 shrink-0 mt-0.5 text-center leading-none", color)}>
                  {icon}
                </span>

                {/* Team badge */}
                <span className={cn(
                  "text-[8px] font-bold w-6 shrink-0 mt-px leading-none pt-0.5",
                  isHome ? "text-primary" : isAway ? "text-sky-400" : "text-muted-foreground/30"
                )}>
                  {ev.teamId || "—"}
                </span>

                {/* Description */}
                <span className={cn(
                  "text-[11px] flex-1 min-w-0 leading-snug",
                  isNewest ? "text-foreground font-medium" : "text-muted-foreground"
                )}>
                  {ev.rawDescription || ev.eventType}
                </span>

                {/* Right side: score or clock */}
                <div className="flex flex-col items-end shrink-0 gap-0.5">
                  {ev.isScoringPlay && ev.pointsScored ? (
                    <span className="text-[9px] font-black text-green-400 leading-none">
                      +{ev.pointsScored}
                    </span>
                  ) : null}
                  <span className="text-[8px] tabular-nums text-muted-foreground/40 leading-none">
                    {periodLabel} {ev.clockDisplay}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
