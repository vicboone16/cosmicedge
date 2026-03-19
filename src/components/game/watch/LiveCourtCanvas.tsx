import { useState, useMemo, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
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

const EVENT_COLORS: Partial<Record<NonNullable<AnimationKey>, { bg: string; glow: string }>> = {
  made_2_basic: { bg: "hsl(var(--cosmic-green))", glow: "hsla(var(--cosmic-green), 0.4)" },
  made_3_basic: { bg: "hsl(var(--cosmic-green))", glow: "hsla(var(--cosmic-green), 0.5)" },
  dunk_finish: { bg: "hsl(var(--cosmic-green))", glow: "hsla(var(--cosmic-green), 0.6)" },
  layup_finish: { bg: "hsl(var(--cosmic-green))", glow: "hsla(var(--cosmic-green), 0.4)" },
  free_throw_make: { bg: "hsl(var(--cosmic-green))", glow: "hsla(var(--cosmic-green), 0.3)" },
  miss_2_basic: { bg: "hsl(var(--cosmic-red))", glow: "hsla(var(--cosmic-red), 0.2)" },
  miss_3_basic: { bg: "hsl(var(--cosmic-red))", glow: "hsla(var(--cosmic-red), 0.2)" },
  free_throw_miss: { bg: "hsl(var(--cosmic-red))", glow: "hsla(var(--cosmic-red), 0.2)" },
  def_rebound_secure: { bg: "hsl(var(--cosmic-cyan))", glow: "hsla(var(--cosmic-cyan), 0.3)" },
  off_rebound_reset: { bg: "hsl(var(--cosmic-gold))", glow: "hsla(var(--cosmic-gold), 0.3)" },
  turnover_flip: { bg: "hsl(var(--cosmic-red))", glow: "hsla(var(--cosmic-red), 0.4)" },
  steal_flip: { bg: "hsl(var(--cosmic-cyan))", glow: "hsla(var(--cosmic-cyan), 0.4)" },
  foul_whistle: { bg: "hsl(var(--cosmic-gold))", glow: "hsla(var(--cosmic-gold), 0.3)" },
  timeout_pause: { bg: "hsl(var(--muted-foreground))", glow: "transparent" },
};

interface CourtDot {
  id: string;
  event: NormalizedPbpEvent;
  pos: { x: number; y: number };
  isLatest: boolean;
  playerName: string | null;
  label: string;
  opacity: number;
  animKey: NonNullable<AnimationKey> | null;
  isHome: boolean;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function LiveCourtCanvas({ lastEvent, recentEvents, possessionTeamId, homeTeamId, awayTeamId }: LiveCourtCanvasProps) {
  const [selectedDotId, setSelectedDotId] = useState<string | null>(null);

  const dots = useMemo<CourtDot[]>(() => {
    const seen = new Map<string, CourtDot>();
    const eventsToShow = recentEvents.slice(-30);

    for (let i = eventsToShow.length - 1; i >= 0; i--) {
      const ev = eventsToShow[i];
      const playerKey = ev.primaryPlayerId || ev.sourceEventId;
      if (seen.has(playerKey) || seen.size >= 10) continue;
      if (ev.eventType === "timeout" || ev.eventType === "period_start" || ev.eventType === "period_end" || ev.eventType === "substitution") continue;

      const zone = ev.zoneKey || "unknown";
      const basePos = ZONE_POSITIONS[zone];
      const jitter = seen.size * 1.5;
      const pos = {
        x: basePos.x + (seen.size % 2 === 0 ? jitter : -jitter) * 0.3,
        y: basePos.y + (seen.size % 3 === 0 ? jitter : -jitter) * 0.4,
      };

      const isLatest = i === eventsToShow.length - 1;
      const age = eventsToShow.length - 1 - i;
      const opacity = Math.max(0.35, 1 - age * 0.07);

      seen.set(playerKey, {
        id: playerKey,
        event: ev,
        pos,
        isLatest,
        playerName: ev.primaryPlayerId || null,
        label: ev.rawDescription?.slice(0, 60) || ev.eventType,
        opacity,
        animKey: ev.animationKey || null,
        isHome: ev.teamId === homeTeamId,
      });
    }

    return Array.from(seen.values());
  }, [recentEvents, homeTeamId]);

  const possDirection = possessionTeamId === homeTeamId ? "→" : possessionTeamId === awayTeamId ? "←" : "";
  const selectedDot = dots.find(d => d.id === selectedDotId);

  return (
    <div className="relative w-full aspect-[2/1] rounded-xl overflow-hidden select-none"
      style={{
        background: "linear-gradient(135deg, hsl(25 40% 22%), hsl(25 35% 18%), hsl(25 30% 15%))",
      }}
    >
      {/* Court floor texture overlay */}
      <div className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(255,255,255,0.03) 8px, rgba(255,255,255,0.03) 9px)",
        }}
      />

      {/* Court SVG with premium lines */}
      <svg viewBox="0 0 940 500" className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Court boundary */}
        <rect x="20" y="20" width="900" height="460" rx="3"
          fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2.5" />

        {/* Half-court line */}
        <line x1="470" y1="20" x2="470" y2="480"
          stroke="rgba(255,255,255,0.15)" strokeWidth="2" />

        {/* Center circle */}
        <circle cx="470" cy="250" r="60"
          fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
        <circle cx="470" cy="250" r="5"
          fill="rgba(255,255,255,0.15)" />

        {/* Left 3-point arc */}
        <path d="M 20 60 L 140 60 Q 290 60 290 250 Q 290 440 140 440 L 20 440"
          fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />

        {/* Right 3-point arc */}
        <path d="M 920 60 L 800 60 Q 650 60 650 250 Q 650 440 800 440 L 920 440"
          fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />

        {/* Left paint */}
        <rect x="20" y="170" width="190" height="160" rx="1"
          fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />

        {/* Right paint */}
        <rect x="730" y="170" width="190" height="160" rx="1"
          fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />

        {/* Left restricted area */}
        <path d="M 20 210 Q 80 210 80 250 Q 80 290 20 290"
          fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />

        {/* Right restricted area */}
        <path d="M 920 210 Q 860 210 860 250 Q 860 290 920 290"
          fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />

        {/* Baskets */}
        <circle cx="42" cy="250" r="9"
          fill="none" stroke="hsl(var(--cosmic-gold))" strokeWidth="2" opacity="0.6" />
        <line x1="20" y1="250" x2="33" y2="250"
          stroke="rgba(255,255,255,0.15)" strokeWidth="2" />

        <circle cx="898" cy="250" r="9"
          fill="none" stroke="hsl(var(--cosmic-gold))" strokeWidth="2" opacity="0.6" />
        <line x1="907" y1="250" x2="920" y2="250"
          stroke="rgba(255,255,255,0.15)" strokeWidth="2" />

        {/* Free throw lines */}
        <line x1="210" y1="170" x2="210" y2="330"
          stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />
        <line x1="730" y1="170" x2="730" y2="330"
          stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />

        {/* FT circles */}
        <circle cx="210" cy="250" r="60"
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="5 5" />
        <circle cx="730" cy="250" r="60"
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="5 5" />
      </svg>

      {/* Possession glow on active side */}
      {possessionTeamId && (
        <div className={cn(
          "absolute top-0 h-full w-1/2 pointer-events-none transition-opacity duration-700",
          possessionTeamId === homeTeamId ? "right-0" : "left-0"
        )}
          style={{
            background: possessionTeamId === homeTeamId
              ? "radial-gradient(ellipse at 80% 50%, hsla(var(--primary), 0.06) 0%, transparent 60%)"
              : "radial-gradient(ellipse at 20% 50%, hsla(var(--cosmic-cyan), 0.06) 0%, transparent 60%)",
          }}
        />
      )}

      {/* Player markers */}
      <AnimatePresence>
        {dots.map((dot) => {
          const colors = dot.animKey ? EVENT_COLORS[dot.animKey] : null;
          const markerBg = colors?.bg || (dot.isHome ? "hsl(var(--primary))" : "hsl(var(--cosmic-cyan))");
          const markerGlow = colors?.glow || "transparent";
          const size = dot.isLatest ? 28 : 22;

          return (
            <motion.button
              key={dot.id}
              layout
              initial={{ left: `${dot.pos.x}%`, top: `${dot.pos.y}%`, scale: 0, opacity: 0 }}
              animate={{
                left: `${dot.pos.x}%`,
                top: `${dot.pos.y}%`,
                scale: 1,
                opacity: dot.opacity,
              }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{
                left: { type: "spring", stiffness: 80, damping: 20, mass: 1 },
                top: { type: "spring", stiffness: 80, damping: 20, mass: 1 },
                scale: { type: "spring", stiffness: 200, damping: 18 },
                opacity: { duration: 0.4 },
              }}
              className="absolute z-10 focus:outline-none"
              style={{
                transform: "translate(-50%, -50%)",
                width: size,
                height: size,
              }}
              onClick={() => setSelectedDotId(prev => prev === dot.id ? null : dot.id)}
              aria-label={dot.label}
            >
              {/* Scoring pulse ring */}
              {dot.isLatest && dot.event.isScoringPlay && (
                <motion.div
                  className="absolute rounded-full"
                  style={{
                    inset: -6,
                    border: `2px solid ${markerBg}`,
                    opacity: 0.5,
                  }}
                  animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
              )}

              {/* Glow shadow */}
              {dot.isLatest && (
                <div className="absolute rounded-full"
                  style={{
                    inset: -3,
                    background: markerGlow,
                    filter: "blur(6px)",
                  }}
                />
              )}

              {/* Main marker circle */}
              <div
                className="relative w-full h-full rounded-full flex items-center justify-center shadow-lg"
                style={{
                  background: markerBg,
                  border: "2px solid rgba(0,0,0,0.3)",
                  boxShadow: dot.isLatest
                    ? `0 2px 8px ${markerGlow}, 0 0 0 1px rgba(255,255,255,0.15) inset`
                    : "0 1px 3px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1) inset",
                }}
              >
                <span className="text-[7px] font-bold leading-none"
                  style={{ color: "rgba(255,255,255,0.9)" }}>
                  {getInitials(dot.playerName)}
                </span>
              </div>

              {/* Scoring points badge */}
              {dot.isLatest && dot.event.isScoringPlay && dot.event.pointsScored && (
                <motion.div
                  initial={{ y: 0, opacity: 0 }}
                  animate={{ y: -18, opacity: 1 }}
                  className="absolute -top-1 left-1/2 -translate-x-1/2 text-[9px] font-black pointer-events-none"
                  style={{ color: "hsl(var(--cosmic-green))", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}
                >
                  +{dot.event.pointsScored}
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </AnimatePresence>

      {/* Tooltip */}
      <AnimatePresence>
        {selectedDot && (
          <motion.div
            key="tooltip"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.15 }}
            className="absolute z-20 pointer-events-none"
            style={{
              left: `${Math.min(Math.max(selectedDot.pos.x, 15), 85)}%`,
              top: `${selectedDot.pos.y - 10}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="rounded-lg px-3 py-2 shadow-2xl text-xs max-w-[220px] pointer-events-auto"
              style={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                backdropFilter: "blur(8px)",
              }}
            >
              <div className="font-bold text-foreground truncate text-[11px]">
                {selectedDot.event.primaryPlayerId || selectedDot.event.teamId || "Unknown"}
              </div>
              <div className="text-muted-foreground mt-0.5 leading-tight text-[10px]">
                {selectedDot.event.rawDescription?.slice(0, 80) || selectedDot.event.eventType}
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-[9px] text-muted-foreground/70">
                <span className="font-medium">Q{selectedDot.event.period}</span>
                <span className="tabular-nums">{selectedDot.event.clockDisplay}</span>
                {selectedDot.event.isScoringPlay && (
                  <span className="font-bold" style={{ color: "hsl(var(--cosmic-green))" }}>
                    +{selectedDot.event.pointsScored}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Possession indicator */}
      {possDirection && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold tracking-wide"
          style={{
            background: "rgba(0,0,0,0.4)",
            color: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(4px)",
          }}
        >
          {possessionTeamId === homeTeamId ? homeTeamId : awayTeamId} {possDirection}
        </div>
      )}

      {/* Timeout overlay */}
      {lastEvent?.animationKey === "timeout_pause" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center rounded-xl"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        >
          <span className="text-sm font-bold uppercase tracking-[0.2em]"
            style={{ color: "rgba(255,255,255,0.7)" }}>
            Timeout
          </span>
        </motion.div>
      )}

      {/* Period end overlay */}
      {lastEvent?.animationKey === "period_end_freeze" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center rounded-xl"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        >
          <span className="text-sm font-bold uppercase tracking-[0.2em]"
            style={{ color: "rgba(255,255,255,0.7)" }}>
            End of Period
          </span>
        </motion.div>
      )}

      {/* Active dot count */}
      <div className="absolute top-2 right-2 text-[8px] font-mono px-1.5 py-0.5 rounded"
        style={{ background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.4)" }}
      >
        {dots.length} active
      </div>
    </div>
  );
}
