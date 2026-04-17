import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  parseMlbEvent,
  deriveMLBGameState,
  MLB_EVENT_LABELS,
  MLB_EVENT_COLORS,
  type MlbParsedEvent,
} from "@/lib/mlb-parser";
import { LiveDiamondCanvas } from "./watch/LiveDiamondCanvas";

interface MlbWatchViewProps {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
}

// ─── Latest play card ──────────────────────────────────────────────────────

function MlbLatestPlayCard({ event }: { event: MlbParsedEvent | null }) {
  if (!event) {
    return (
      <div className="p-4 rounded-lg border border-border/30 bg-card/50">
        <p className="text-xs text-muted-foreground text-center">Waiting for live play-by-play…</p>
      </div>
    );
  }

  const label = MLB_EVENT_LABELS[event.eventType] ?? "Play";
  const colorClass = MLB_EVENT_COLORS[event.eventType] ?? "text-muted-foreground border-border";
  const inningLabel = `${event.topBottom === "top" ? "▲" : "▼"} ${event.inning}`;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={event.sourceEventId}
        initial={{ opacity: 0, x: -10, backgroundColor: "hsla(var(--primary), 0.10)" }}
        animate={{ opacity: 1, x: 0, backgroundColor: "transparent" }}
        exit={{ opacity: 0, x: 10 }}
        transition={{
          opacity: { duration: 0.2 },
          x: { type: "spring", stiffness: 300, damping: 28 },
          backgroundColor: { duration: 1.0, ease: "easeOut" },
        }}
        className="relative p-3 rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm space-y-2"
      >
        {/* badge + inning */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
              colorClass
            )}>
              {label}
            </span>
            {event.primaryPlayer && (
              <span className="text-[10px] font-bold text-primary truncate max-w-[110px]">
                {event.primaryPlayer}
              </span>
            )}
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">{inningLabel}</span>
        </div>

        {/* description */}
        <p className="text-sm text-foreground leading-relaxed">{event.rawDescription || "—"}</p>

        {/* score after */}
        {event.awayScoreAfter != null && event.homeScoreAfter != null && (
          <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
            <span className="font-bold">Away</span>
            <span>{event.awayScoreAfter}</span>
            <span>—</span>
            <span>{event.homeScoreAfter}</span>
            <span className="font-bold">Home</span>
          </div>
        )}

        {/* runs scored flash */}
        {event.isScoringPlay && event.runsScored > 0 && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 400, damping: 18 }}
            className="absolute top-2 right-2 text-[11px] font-black"
            style={{ color: "hsl(var(--cosmic-green))", textShadow: "0 1px 6px rgba(0,0,0,0.3)" }}
          >
            +{event.runsScored}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Recent events list ────────────────────────────────────────────────────

function MlbRecentEventsList({ events }: { events: MlbParsedEvent[] }) {
  const recent = events.slice(-12).reverse();

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Recent Plays
      </p>
      <AnimatePresence mode="popLayout" initial={false}>
        {recent.map((ev) => {
          const label = MLB_EVENT_LABELS[ev.eventType] ?? "Play";
          const colorClass = MLB_EVENT_COLORS[ev.eventType] ?? "text-muted-foreground border-border";
          const inning = `${ev.topBottom === "top" ? "▲" : "▼"}${ev.inning}`;
          return (
            <motion.div
              key={ev.sourceEventId}
              layout
              initial={{ opacity: 0, y: -10, backgroundColor: "hsla(var(--primary), 0.12)" }}
              animate={{ opacity: 1, y: 0, backgroundColor: "transparent" }}
              exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" }}
              transition={{
                layout: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.22 },
                y: { type: "spring", stiffness: 280, damping: 26 },
                backgroundColor: { duration: 0.8, ease: "easeOut" },
              }}
              className="flex items-start gap-2 py-1.5 px-2 rounded-md border border-border/20 bg-card/30"
            >
              <span className="text-[9px] text-muted-foreground tabular-nums shrink-0 mt-0.5 w-8">
                {inning}
              </span>
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-wide shrink-0 mt-0.5",
                colorClass.split(" ")[0]
              )}>
                {label}
              </span>
              <span className="text-[10px] text-foreground/80 leading-tight line-clamp-2 min-w-0">
                {ev.rawDescription}
              </span>
              {ev.isScoringPlay && ev.runsScored > 0 && (
                <span className="text-[9px] font-black shrink-0 mt-0.5" style={{ color: "hsl(var(--cosmic-green))" }}>
                  +{ev.runsScored}
                </span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {recent.length === 0 && (
        <p className="text-[11px] text-muted-foreground text-center py-4">No plays yet…</p>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function MlbWatchView({ gameId, homeAbbr, awayAbbr }: MlbWatchViewProps) {
  // Pull MLB PBP events — try pbp_events table first (cosmic pipeline), fallback later
  const { data: rawEvents } = useQuery({
    queryKey: ["mlb-watch-pbp", gameId],
    queryFn: async () => {
      // Try game_key lookup
      const { data: gameRow } = await supabase
        .from("games")
        .select("start_time, home_abbr, away_abbr, external_id")
        .eq("id", gameId)
        .maybeSingle();

      if (!gameRow) return [];

      const dateStr = gameRow.start_time?.split(/[T ]/)[0];

      // Try cosmic pbp_events
      const { data: cosmicEvents } = await supabase
        .from("pbp_events")
        .select("*")
        .or(`game_key.eq.${gameRow.external_id},game_id.eq.${gameId}`)
        .order("created_at", { ascending: true })
        .limit(800);

      if (cosmicEvents && cosmicEvents.length > 0) return cosmicEvents;

      // Fallback: mlb_pbp_events if that table exists
      const { data: mlbEvents } = await supabase
        .from("mlb_pbp_events" as any)
        .select("*")
        .eq("game_id", gameId)
        .order("at_bat_index", { ascending: true })
        .order("play_index", { ascending: true })
        .limit(800)
        .catch(() => ({ data: null }));

      return (mlbEvents as any[]) || [];
    },
    refetchInterval: 8_000,
  });

  // Normalize raw rows into MlbParsedEvent[]
  const parsedEvents = useMemo<MlbParsedEvent[]>(() => {
    if (!rawEvents || rawEvents.length === 0) return [];
    return rawEvents.map((ev: any, i: number) => {
      const desc =
        ev.description ||
        ev.result?.description ||
        ev.raw?.description ||
        ev.event_type ||
        "";
      const inning =
        ev.inning ?? ev.period ?? ev.at_bat_index ?? 1;
      const topBottom: "top" | "bottom" =
        ev.half_inning === "bottom" || ev.top_bottom === "bottom" ? "bottom" : "top";

      return parseMlbEvent(
        desc,
        ev.id ?? ev.provider_event_id ?? String(i),
        typeof inning === "number" ? inning : 1,
        topBottom,
        ev.home_score ?? null,
        ev.away_score ?? null,
      );
    });
  }, [rawEvents]);

  const gameState = useMemo(() => deriveMLBGameState(parsedEvents), [parsedEvents]);
  const latestEvent = parsedEvents.length > 0 ? parsedEvents[parsedEvents.length - 1] : null;

  return (
    <div className="space-y-4">
      {/* Field */}
      <LiveDiamondCanvas
        gameState={gameState}
        latestEvent={latestEvent}
        homeAbbr={homeAbbr}
        awayAbbr={awayAbbr}
      />

      {/* Latest play */}
      <MlbLatestPlayCard event={latestEvent} />

      {/* Recent plays */}
      <MlbRecentEventsList events={parsedEvents} />
    </div>
  );
}
