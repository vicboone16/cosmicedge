import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { NormalizedPbpEvent } from "@/lib/pbp-event-parser";

interface RecentEventsListProps {
  events: NormalizedPbpEvent[];
  homeAbbr: string;
  awayAbbr: string;
}

export function RecentEventsList({ events, homeAbbr, awayAbbr }: RecentEventsListProps) {
  // Show last 8 events in reverse (newest first)
  const recent = events.slice(-8).reverse();

  if (recent.length === 0) return null;

  return (
    <div className="space-y-0">
      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 px-1">
        Recent Plays
      </span>
      <div className="max-h-48 overflow-y-auto space-y-0 rounded-lg border border-border/20 bg-card/30">
        <AnimatePresence mode="popLayout" initial={false}>
          {recent.map((ev, i) => {
            const isHome = ev.teamId === homeAbbr;
            const isAway = ev.teamId === awayAbbr;

            return (
              <motion.div
                key={ev.sourceEventId}
                layout
                initial={{ opacity: 0, y: -12, backgroundColor: "hsla(var(--primary), 0.14)" }}
                animate={{ opacity: 1, y: 0, backgroundColor: "transparent" }}
                exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" }}
                transition={{
                  layout: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.25 },
                  y: { type: "spring", stiffness: 280, damping: 26 },
                  backgroundColor: { duration: 0.8, ease: "easeOut" },
                }}
                className={cn(
                  "flex items-start gap-2 px-2.5 py-1.5 border-b border-border/10 last:border-0",
                  i === 0 && "bg-primary/5"
                )}
              >
                {/* Team badge */}
                <span className={cn(
                  "text-[8px] font-bold w-7 shrink-0 pt-0.5",
                  isHome ? "text-primary" : isAway ? "text-muted-foreground" : "text-muted-foreground/40"
                )}>
                  {ev.teamId || ""}
                </span>

                {/* Description */}
                <span className="text-[10px] text-muted-foreground flex-1 min-w-0 truncate">
                  {ev.rawDescription || ev.eventType}
                </span>

                {/* Clock */}
                <span className="text-[9px] tabular-nums text-muted-foreground/50 shrink-0">
                  {ev.clockDisplay}
                </span>

                {/* Score indicator for scoring plays */}
                {ev.isScoringPlay && (
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
                    className="text-[8px] font-bold text-cosmic-green shrink-0"
                  >
                    +{ev.pointsScored}
                  </motion.span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
