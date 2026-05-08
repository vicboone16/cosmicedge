import { useState, useMemo, useEffect, useRef } from "react";
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

// ─── Court geometry constants (ViewBox: 940×500, court: 20,20 → 920,480) ─────
// Scale: 900px / 94ft ≈ 9.574 px/ft (H), 460px / 50ft = 9.2 px/ft (V)
const C = {
  // Baskets: 5.25ft from baseline → 50px
  LEFT_BASKET_X:  70,
  RIGHT_BASKET_X: 870,
  BASKET_Y:       250,
  // Paint: 16ft wide (147px), 19ft long (182px)
  LEFT_PAINT_R:  202,  // right edge (FT line)
  RIGHT_PAINT_L: 738,
  PAINT_TOP:     176,
  PAINT_BOT:     324,
  // FT circles: 6ft radius → 57px
  FT_RADIUS: 57,
  // 3-point arc: 23.75ft radius → 227px
  // Corner straight at y=48 (3ft from sideline), arc endpoint at x≈174 / x≈766
  THREE_RADIUS:   227,
  THREE_TOP:       48,
  THREE_BOT:      452,
  LEFT_ARC_X:    174,
  RIGHT_ARC_X:   766,
  // Restricted area: 4ft radius → 38px
  RA_RADIUS: 38,
  // Center circle: 6ft radius → 57px
  CENTER_X: 470,
  CENTER_Y: 250,
  CENTER_RADIUS: 57,
  // Backboard
  LEFT_BOARD_X:  52,
  RIGHT_BOARD_X: 888,
  BOARD_TOP:     224,
  BOARD_BOT:     276,
};

// Zone positions on normalized court (0–100 x, 0–100 y)
const ZONE_POSITIONS: Record<ZoneKey, { x: number; y: number }> = {
  restricted_area:   { x: 83, y: 50 },
  paint:             { x: 78, y: 50 },
  free_throw_line:   { x: 72, y: 50 },
  midrange_left:     { x: 66, y: 22 },
  midrange_center:   { x: 64, y: 50 },
  midrange_right:    { x: 66, y: 78 },
  corner_3_left:     { x: 75, y:  6 },
  corner_3_right:    { x: 75, y: 94 },
  wing_3_left:       { x: 55, y: 16 },
  wing_3_right:      { x: 55, y: 84 },
  top_3:             { x: 50, y: 50 },
  backcourt:         { x: 22, y: 50 },
  bench:             { x: 10, y: 90 },
  sideline:          { x: 50, y: 96 },
  unknown:           { x: 50, y: 50 },
};

// ─── Event → dot color mapping ────────────────────────────────────────────────
const EVENT_COLORS: Partial<Record<NonNullable<AnimationKey>, { bg: string; border: string; glow: string }>> = {
  made_2_basic:    { bg: "#22c55e", border: "#16a34a", glow: "rgba(34,197,94,0.55)" },
  made_3_basic:    { bg: "#22c55e", border: "#16a34a", glow: "rgba(34,197,94,0.65)" },
  dunk_finish:     { bg: "#22c55e", border: "#15803d", glow: "rgba(34,197,94,0.70)" },
  layup_finish:    { bg: "#4ade80", border: "#22c55e", glow: "rgba(74,222,128,0.50)" },
  free_throw_make: { bg: "#86efac", border: "#22c55e", glow: "rgba(134,239,172,0.45)" },
  miss_2_basic:    { bg: "#ef4444", border: "#b91c1c", glow: "rgba(239,68,68,0.35)" },
  miss_3_basic:    { bg: "#ef4444", border: "#b91c1c", glow: "rgba(239,68,68,0.35)" },
  free_throw_miss: { bg: "#f87171", border: "#ef4444", glow: "rgba(248,113,113,0.35)" },
  def_rebound_secure: { bg: "#38bdf8", border: "#0284c7", glow: "rgba(56,189,248,0.40)" },
  off_rebound_reset:  { bg: "#fbbf24", border: "#d97706", glow: "rgba(251,191,36,0.45)" },
  turnover_flip:   { bg: "#f97316", border: "#c2410c", glow: "rgba(249,115,22,0.45)" },
  steal_flip:      { bg: "#38bdf8", border: "#0284c7", glow: "rgba(56,189,248,0.50)" },
  foul_whistle:    { bg: "#fbbf24", border: "#d97706", glow: "rgba(251,191,36,0.40)" },
  timeout_pause:   { bg: "#94a3b8", border: "#64748b", glow: "transparent" },
};

// ─── Cream line color for all court markings ──────────────────────────────────
const LINE = "rgba(255, 248, 220, 0.84)";
const LINE_DIM = "rgba(255, 248, 220, 0.60)";
const LINE_FAINT = "rgba(255, 248, 220, 0.35)";
const RIM_COLOR = "#f97316";
const PAINT_FILL = "rgba(0,0,0,0.12)";

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

export function LiveCourtCanvas({
  lastEvent, recentEvents, possessionTeamId, homeTeamId, awayTeamId,
}: LiveCourtCanvasProps) {
  const [selectedDotId, setSelectedDotId] = useState<string | null>(null);

  // Rim flash animation on scoring plays
  const [rimFlash, setRimFlash] = useState<"left" | "right" | null>(null);
  const prevEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastEvent || lastEvent.sourceEventId === prevEventIdRef.current) return;
    prevEventIdRef.current = lastEvent.sourceEventId;
    if (lastEvent.isScoringPlay) {
      const side = lastEvent.teamId === homeTeamId ? "right" : "left";
      setRimFlash(side);
      const t = setTimeout(() => setRimFlash(null), 900);
      return () => clearTimeout(t);
    }
  }, [lastEvent, homeTeamId]);

  const dots = useMemo<CourtDot[]>(() => {
    const seen = new Map<string, CourtDot>();
    const eventsToShow = recentEvents.slice(-30);

    for (let i = eventsToShow.length - 1; i >= 0; i--) {
      const ev = eventsToShow[i];
      const playerKey = ev.primaryPlayerId || ev.sourceEventId;
      if (seen.has(playerKey) || seen.size >= 10) continue;
      if (["timeout", "period_start", "period_end", "substitution"].includes(ev.eventType)) continue;

      const zone = ev.zoneKey || "unknown";
      const basePos = ZONE_POSITIONS[zone];
      const jitter = seen.size * 1.5;
      const pos = {
        x: basePos.x + (seen.size % 2 === 0 ? jitter : -jitter) * 0.3,
        y: basePos.y + (seen.size % 3 === 0 ? jitter : -jitter) * 0.4,
      };

      const isLatest = i === eventsToShow.length - 1;
      const age = eventsToShow.length - 1 - i;
      const opacity = Math.max(0.30, 1 - age * 0.08);

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

  const possDirection = possessionTeamId === homeTeamId ? "right" : possessionTeamId === awayTeamId ? "left" : null;
  const selectedDot = dots.find(d => d.id === selectedDotId);

  return (
    <div
      className="relative w-full overflow-hidden select-none rounded-xl shadow-2xl"
      style={{
        aspectRatio: "940 / 500",
        // ── Real maple hardwood color — warm golden blonde ──
        background: "linear-gradient(175deg, #d4924e 0%, #c98440 35%, #c07c3a 65%, #b87234 100%)",
      }}
    >
      {/* ── Wood plank grain (vertical lines running along long axis) ── */}
      <svg
        viewBox="0 0 940 500"
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <pattern id="woodgrain" x="0" y="0" width="28" height="500" patternUnits="userSpaceOnUse">
            <line x1="7"  y1="0" x2="7"  y2="500" stroke="rgba(0,0,0,0.07)" strokeWidth="0.6" />
            <line x1="14" y1="0" x2="14" y2="500" stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" />
            <line x1="21" y1="0" x2="21" y2="500" stroke="rgba(0,0,0,0.05)" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="courtVignette" cx="50%" cy="50%" r="75%" fx="50%" fy="50%">
            <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.28)" />
          </radialGradient>
          {/* Possession glow gradients */}
          <radialGradient id="possLeft" cx="0%" cy="50%" r="60%">
            <stop offset="0%"   stopColor="rgba(99,102,241,0.18)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="possRight" cx="100%" cy="50%" r="60%">
            <stop offset="0%"   stopColor="rgba(99,102,241,0.18)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        {/* Wood grain texture */}
        <rect x="0" y="0" width="940" height="500" fill="url(#woodgrain)" />

        {/* Vignette edge darkening */}
        <rect x="0" y="0" width="940" height="500" fill="url(#courtVignette)" />

        {/* ── Paint areas (slightly darker inset) ── */}
        <rect x="20"   y={C.PAINT_TOP} width={C.LEFT_PAINT_R  - 20}  height={C.PAINT_BOT - C.PAINT_TOP} fill={PAINT_FILL} />
        <rect x={C.RIGHT_PAINT_L} y={C.PAINT_TOP} width={920 - C.RIGHT_PAINT_L} height={C.PAINT_BOT - C.PAINT_TOP} fill={PAINT_FILL} />

        {/* ── Court outer boundary ── */}
        <rect x="20" y="20" width="900" height="460" fill="none" stroke={LINE} strokeWidth="2.5" />

        {/* ── Half-court line ── */}
        <line x1="470" y1="20" x2="470" y2="480" stroke={LINE} strokeWidth="2" />

        {/* ── Center circle ── */}
        <circle cx={C.CENTER_X} cy={C.CENTER_Y} r={C.CENTER_RADIUS}
          fill="none" stroke={LINE} strokeWidth="2" />
        <circle cx={C.CENTER_X} cy={C.CENTER_Y} r="5"
          fill={LINE_DIM} />

        {/* ── Left 3-point arc + corner straights ── */}
        {/* Top corner straight */}
        <line x1="20" y1={C.THREE_TOP} x2={C.LEFT_ARC_X} y2={C.THREE_TOP}
          stroke={LINE} strokeWidth="2" />
        {/* Arc */}
        <path d={`M ${C.LEFT_ARC_X},${C.THREE_TOP} A ${C.THREE_RADIUS},${C.THREE_RADIUS} 0 0,1 ${C.LEFT_ARC_X},${C.THREE_BOT}`}
          fill="none" stroke={LINE} strokeWidth="2" />
        {/* Bottom corner straight */}
        <line x1="20" y1={C.THREE_BOT} x2={C.LEFT_ARC_X} y2={C.THREE_BOT}
          stroke={LINE} strokeWidth="2" />

        {/* ── Right 3-point arc + corner straights ── */}
        <line x1="920" y1={C.THREE_TOP} x2={C.RIGHT_ARC_X} y2={C.THREE_TOP}
          stroke={LINE} strokeWidth="2" />
        <path d={`M ${C.RIGHT_ARC_X},${C.THREE_TOP} A ${C.THREE_RADIUS},${C.THREE_RADIUS} 0 0,0 ${C.RIGHT_ARC_X},${C.THREE_BOT}`}
          fill="none" stroke={LINE} strokeWidth="2" />
        <line x1="920" y1={C.THREE_BOT} x2={C.RIGHT_ARC_X} y2={C.THREE_BOT}
          stroke={LINE} strokeWidth="2" />

        {/* ── Left paint outline ── */}
        <rect x="20" y={C.PAINT_TOP} width={C.LEFT_PAINT_R - 20} height={C.PAINT_BOT - C.PAINT_TOP}
          fill="none" stroke={LINE} strokeWidth="1.8" />

        {/* ── Right paint outline ── */}
        <rect x={C.RIGHT_PAINT_L} y={C.PAINT_TOP} width={920 - C.RIGHT_PAINT_L} height={C.PAINT_BOT - C.PAINT_TOP}
          fill="none" stroke={LINE} strokeWidth="1.8" />

        {/* ── Lane block marks (hash marks on paint edges) ── */}
        {/* Left paint - top edge blocks */}
        {[0.28, 0.52, 0.72, 0.88].map((t, i) => {
          const x = 20 + t * (C.LEFT_PAINT_R - 20);
          return (
            <g key={i}>
              <line x1={x} y1={C.PAINT_TOP - 6} x2={x} y2={C.PAINT_TOP} stroke={LINE_DIM} strokeWidth="1.5" />
              <line x1={x} y1={C.PAINT_BOT}     x2={x} y2={C.PAINT_BOT + 6} stroke={LINE_DIM} strokeWidth="1.5" />
            </g>
          );
        })}
        {/* Right paint - block marks */}
        {[0.12, 0.28, 0.48, 0.72].map((t, i) => {
          const x = C.RIGHT_PAINT_L + t * (920 - C.RIGHT_PAINT_L);
          return (
            <g key={i}>
              <line x1={x} y1={C.PAINT_TOP - 6} x2={x} y2={C.PAINT_TOP} stroke={LINE_DIM} strokeWidth="1.5" />
              <line x1={x} y1={C.PAINT_BOT}     x2={x} y2={C.PAINT_BOT + 6} stroke={LINE_DIM} strokeWidth="1.5" />
            </g>
          );
        })}

        {/* ── FT circles (upper half solid, lower half dashed) ── */}
        <path d={`M ${C.LEFT_PAINT_R},${C.CENTER_Y - C.FT_RADIUS} A ${C.FT_RADIUS},${C.FT_RADIUS} 0 0,1 ${C.LEFT_PAINT_R},${C.CENTER_Y + C.FT_RADIUS}`}
          fill="none" stroke={LINE} strokeWidth="1.8" />
        <path d={`M ${C.LEFT_PAINT_R},${C.CENTER_Y + C.FT_RADIUS} A ${C.FT_RADIUS},${C.FT_RADIUS} 0 0,1 ${C.LEFT_PAINT_R},${C.CENTER_Y - C.FT_RADIUS}`}
          fill="none" stroke={LINE_FAINT} strokeWidth="1.5" strokeDasharray="6 6" />

        <path d={`M ${C.RIGHT_PAINT_L},${C.CENTER_Y - C.FT_RADIUS} A ${C.FT_RADIUS},${C.FT_RADIUS} 0 0,0 ${C.RIGHT_PAINT_L},${C.CENTER_Y + C.FT_RADIUS}`}
          fill="none" stroke={LINE} strokeWidth="1.8" />
        <path d={`M ${C.RIGHT_PAINT_L},${C.CENTER_Y + C.FT_RADIUS} A ${C.FT_RADIUS},${C.FT_RADIUS} 0 0,0 ${C.RIGHT_PAINT_L},${C.CENTER_Y - C.FT_RADIUS}`}
          fill="none" stroke={LINE_FAINT} strokeWidth="1.5" strokeDasharray="6 6" />

        {/* ── Restricted area arcs ── */}
        <path d={`M ${C.LEFT_BASKET_X},${C.CENTER_Y - C.RA_RADIUS} A ${C.RA_RADIUS},${C.RA_RADIUS} 0 0,1 ${C.LEFT_BASKET_X},${C.CENTER_Y + C.RA_RADIUS}`}
          fill="none" stroke={LINE_DIM} strokeWidth="1.5" />
        <path d={`M ${C.RIGHT_BASKET_X},${C.CENTER_Y - C.RA_RADIUS} A ${C.RA_RADIUS},${C.RA_RADIUS} 0 0,0 ${C.RIGHT_BASKET_X},${C.CENTER_Y + C.RA_RADIUS}`}
          fill="none" stroke={LINE_DIM} strokeWidth="1.5" />

        {/* ── Backboards ── */}
        <line x1={C.LEFT_BOARD_X}  y1={C.BOARD_TOP} x2={C.LEFT_BOARD_X}  y2={C.BOARD_BOT}
          stroke="rgba(255,255,255,0.90)" strokeWidth="4" strokeLinecap="round" />
        <line x1={C.RIGHT_BOARD_X} y1={C.BOARD_TOP} x2={C.RIGHT_BOARD_X} y2={C.BOARD_BOT}
          stroke="rgba(255,255,255,0.90)" strokeWidth="4" strokeLinecap="round" />

        {/* Backboard support arms */}
        <line x1={C.LEFT_BOARD_X}  y1={C.CENTER_Y} x2={C.LEFT_BASKET_X - 2}  y2={C.CENTER_Y}
          stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
        <line x1={C.RIGHT_BOARD_X} y1={C.CENTER_Y} x2={C.RIGHT_BASKET_X + 2} y2={C.CENTER_Y}
          stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />

        {/* ── Rims ── */}
        <circle cx={C.LEFT_BASKET_X}  cy={C.CENTER_Y} r="11"
          fill="none"
          stroke={rimFlash === "left" ? "#ffffff" : RIM_COLOR}
          strokeWidth="3"
          opacity={rimFlash === "left" ? 1 : 0.92}
          style={{ transition: "stroke 0.15s, opacity 0.15s" }}
        />
        <circle cx={C.RIGHT_BASKET_X} cy={C.CENTER_Y} r="11"
          fill="none"
          stroke={rimFlash === "right" ? "#ffffff" : RIM_COLOR}
          strokeWidth="3"
          opacity={rimFlash === "right" ? 1 : 0.92}
          style={{ transition: "stroke 0.15s, opacity 0.15s" }}
        />

        {/* ── Possession half-court glow ── */}
        {possDirection === "left"  && <rect x="0" y="0" width="470" height="500" fill="url(#possLeft)"  />}
        {possDirection === "right" && <rect x="470" y="0" width="470" height="500" fill="url(#possRight)" />}
      </svg>

      {/* ── Player marker dots ── */}
      <AnimatePresence>
        {dots.map((dot) => {
          const colors = dot.animKey ? EVENT_COLORS[dot.animKey] : null;
          const bg     = colors?.bg     || (dot.isHome ? "#818cf8" : "#38bdf8");
          const border = colors?.border || (dot.isHome ? "#6366f1" : "#0284c7");
          const glow   = colors?.glow   || "transparent";
          const size   = dot.isLatest ? 30 : 22;
          const fontSize = dot.isLatest ? "8px" : "7px";

          return (
            <motion.button
              key={dot.id}
              layout
              initial={{ left: `${dot.pos.x}%`, top: `${dot.pos.y}%`, scale: 0, opacity: 0 }}
              animate={{ left: `${dot.pos.x}%`, top: `${dot.pos.y}%`, scale: 1, opacity: dot.opacity }}
              exit={{ scale: 0, opacity: 0, transition: { duration: 0.25 } }}
              transition={{
                left:    { type: "spring", stiffness: 90, damping: 22 },
                top:     { type: "spring", stiffness: 90, damping: 22 },
                scale:   { type: "spring", stiffness: 260, damping: 20 },
                opacity: { duration: 0.35 },
              }}
              className="absolute z-10 focus:outline-none"
              style={{ transform: "translate(-50%, -50%)", width: size, height: size }}
              onClick={() => setSelectedDotId(prev => prev === dot.id ? null : dot.id)}
              aria-label={dot.label}
            >
              {/* Scoring pulse ring */}
              {dot.isLatest && dot.event.isScoringPlay && (
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{ inset: -7, border: `2px solid ${bg}` }}
                  animate={{ scale: [1, 2.4, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                />
              )}

              {/* Outer glow */}
              {dot.isLatest && glow !== "transparent" && (
                <div className="absolute rounded-full pointer-events-none"
                  style={{ inset: -4, background: glow, filter: "blur(7px)" }} />
              )}

              {/* Main circle */}
              <div
                className="relative w-full h-full rounded-full flex items-center justify-center"
                style={{
                  background: bg,
                  border: `2px solid ${border}`,
                  boxShadow: dot.isLatest
                    ? `0 0 0 1.5px rgba(255,255,255,0.20) inset, 0 3px 10px rgba(0,0,0,0.45), 0 0 12px ${glow}`
                    : "0 1px 4px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.10) inset",
                }}
              >
                <span style={{ fontSize, fontWeight: 800, color: "rgba(255,255,255,0.95)", lineHeight: 1 }}>
                  {getInitials(dot.playerName)}
                </span>
              </div>

              {/* Points badge */}
              {dot.isLatest && dot.event.isScoringPlay && dot.event.pointsScored && (
                <motion.div
                  initial={{ y: 0, opacity: 0, scale: 0.6 }}
                  animate={{ y: -20, opacity: 1, scale: 1 }}
                  className="absolute left-1/2 -translate-x-1/2 -top-1 pointer-events-none"
                  style={{
                    fontSize: "11px",
                    fontWeight: 900,
                    color: "#22c55e",
                    textShadow: "0 1px 6px rgba(0,0,0,0.7)",
                    letterSpacing: "-0.5px",
                  }}
                >
                  +{dot.event.pointsScored}
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </AnimatePresence>

      {/* ── Tooltip on tap ── */}
      <AnimatePresence>
        {selectedDot && (
          <motion.div
            key="tooltip"
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-20 pointer-events-none"
            style={{
              left: `${Math.min(Math.max(selectedDot.pos.x, 12), 88)}%`,
              top:  `${Math.max(selectedDot.pos.y - 12, 5)}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="rounded-xl px-3 py-2.5 shadow-2xl max-w-[200px] pointer-events-auto"
              style={{
                background: "rgba(15,15,20,0.88)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(12px)",
              }}
            >
              <p className="text-[11px] font-bold text-white truncate">
                {selectedDot.event.primaryPlayerId || selectedDot.event.teamId || "—"}
              </p>
              <p className="text-[10px] text-white/60 mt-0.5 leading-snug">
                {selectedDot.event.rawDescription?.slice(0, 70) || selectedDot.event.eventType}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[9px] font-bold text-white/40">Q{selectedDot.event.period}</span>
                <span className="text-[9px] tabular-nums text-white/40">{selectedDot.event.clockDisplay}</span>
                {selectedDot.event.isScoringPlay && (
                  <span className="text-[9px] font-black text-green-400 ml-auto">
                    +{selectedDot.event.pointsScored}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Possession arrow ── */}
      {possDirection && (
        <div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
        >
          {possDirection === "left"  && <span className="text-[10px] text-white/70">◄</span>}
          <span className="text-[9px] font-bold tracking-widest uppercase text-white/60">
            {possDirection === "right" ? awayTeamId : homeTeamId}
          </span>
          {possDirection === "right" && <span className="text-[10px] text-white/70">►</span>}
        </div>
      )}

      {/* ── Timeout overlay ── */}
      {lastEvent?.animationKey === "timeout_pause" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl"
          style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(5px)" }}
        >
          <span className="text-xs font-black uppercase tracking-[0.3em] text-white/80">Timeout</span>
          <span className="text-[10px] text-white/40">{lastEvent.teamId}</span>
        </motion.div>
      )}

      {/* ── Period end overlay ── */}
      {lastEvent?.animationKey === "period_end_freeze" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center rounded-xl"
          style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(5px)" }}
        >
          <span className="text-sm font-black uppercase tracking-[0.25em] text-white/80">End of Period</span>
        </motion.div>
      )}

      {/* ── Active dot count (top-right, subtle) ── */}
      <div className="absolute top-2 right-2 text-[8px] font-mono px-1.5 py-0.5 rounded"
        style={{ background: "rgba(0,0,0,0.35)", color: "rgba(255,255,255,0.30)" }}
      >
        {dots.length} on floor
      </div>
    </div>
  );
}
