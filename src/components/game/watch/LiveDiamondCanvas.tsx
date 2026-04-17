import { motion, AnimatePresence } from "framer-motion";
import type { MlbParsedEvent, MlbGameState, HitZone } from "@/lib/mlb-parser";
import { MLB_ZONE_COORDS } from "@/lib/mlb-parser";

interface LiveDiamondCanvasProps {
  gameState: MlbGameState;
  latestEvent: MlbParsedEvent | null;
  homeAbbr: string;
  awayAbbr: string;
}

// Base diamond coordinates (viewBox 0 0 400 380)
const HOME   = { x: 200, y: 340 };
const FIRST  = { x: 295, y: 245 };
const SECOND = { x: 200, y: 150 };
const THIRD  = { x: 105, y: 245 };
const MOUND  = { x: 200, y: 255 };

// Base square side half-width for the rotated square
const BASE_SIZE = 9;

function DiamondBase({ cx, cy, occupied, label }: {
  cx: number; cy: number; occupied: boolean; label: string
}) {
  return (
    <g>
      {/* glow when occupied */}
      {occupied && (
        <motion.rect
          x={cx - BASE_SIZE - 4} y={cy - BASE_SIZE - 4}
          width={BASE_SIZE * 2 + 8} height={BASE_SIZE * 2 + 8}
          rx={3}
          transform={`rotate(45 ${cx} ${cy})`}
          fill="hsl(45 95% 60% / 0.25)"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          style={{ filter: "blur(6px)" }}
        />
      )}
      {/* base bag */}
      <motion.rect
        x={cx - BASE_SIZE} y={cy - BASE_SIZE}
        width={BASE_SIZE * 2} height={BASE_SIZE * 2}
        rx={2}
        transform={`rotate(45 ${cx} ${cy})`}
        fill={occupied ? "hsl(45 95% 62%)" : "rgba(255,255,255,0.55)"}
        stroke={occupied ? "hsl(45 95% 75%)" : "rgba(255,255,255,0.75)"}
        strokeWidth={1.5}
        animate={{ fill: occupied ? "hsl(45 95% 62%)" : "rgba(255,255,255,0.55)" }}
        transition={{ duration: 0.3 }}
      />
    </g>
  );
}

// Outfield grass stripe pattern (alternating dark/medium)
function GrassStripes() {
  const stripes: React.ReactElement[] = [];
  const stripeW = 30;
  for (let i = 0; i < 14; i++) {
    const x = -10 + i * stripeW;
    const dark = i % 2 === 0;
    stripes.push(
      <rect
        key={i}
        x={x} y={0}
        width={stripeW} height={400}
        fill={dark ? "hsl(120 55% 19%)" : "hsl(120 58% 23%)"}
      />
    );
  }
  return <g clipPath="url(#outfieldClip)">{stripes}</g>;
}

function HitBallAnimation({ zone, eventId }: { zone: HitZone; eventId: string }) {
  const dest = MLB_ZONE_COORDS[zone] ?? MLB_ZONE_COORDS.unknown;
  const isHR = zone === "beyond_fence";

  return (
    <AnimatePresence>
      <motion.g key={eventId}>
        {/* trajectory arc */}
        <motion.circle
          cx={HOME.x} cy={HOME.y} r={isHR ? 7 : 5}
          fill={isHR ? "hsl(45 95% 62%)" : "rgba(255,255,255,0.92)"}
          style={{ filter: isHR ? "drop-shadow(0 0 6px hsl(45 95% 62%))" : "drop-shadow(0 0 4px rgba(255,255,255,0.7))" }}
          initial={{ cx: HOME.x, cy: HOME.y, opacity: 1, scale: isHR ? 1.4 : 1 }}
          animate={{ cx: dest.x, cy: dest.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: isHR ? 0.9 : 0.55, ease: isHR ? [0.2, 0.8, 0.6, 1] : "easeOut" }}
        />
        {/* impact flash */}
        <motion.circle
          cx={dest.x} cy={dest.y} r={12}
          fill="rgba(255,255,255,0)"
          stroke={isHR ? "hsl(45 95% 62%)" : "rgba(255,255,255,0.8)"}
          strokeWidth={2}
          initial={{ r: 2, opacity: 0 }}
          animate={{ r: [2, 22, 22], opacity: [0, 0.85, 0] }}
          transition={{ duration: 0.6, delay: isHR ? 0.85 : 0.5, times: [0, 0.3, 1] }}
        />
        {/* Home run star burst */}
        {isHR && (
          <motion.text
            x={dest.x} y={dest.y - 14}
            textAnchor="middle"
            fontSize={16}
            fill="hsl(45 95% 62%)"
            initial={{ opacity: 0, y: dest.y }}
            animate={{ opacity: [0, 1, 1, 0], y: [dest.y, dest.y - 20, dest.y - 22, dest.y - 28] }}
            transition={{ duration: 1.2, delay: 0.7 }}
            style={{ fontWeight: 900, filter: "drop-shadow(0 0 6px hsl(45 95% 62%))" }}
          >
            HR
          </motion.text>
        )}
      </motion.g>
    </AnimatePresence>
  );
}

function RunnerDot({ from, to, label }: { from: {x:number;y:number}; to: {x:number;y:number}; label: string }) {
  return (
    <motion.g
      initial={{ x: from.x - to.x, y: from.y - to.y }}
      animate={{ x: 0, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
    >
      <circle cx={to.x} cy={to.y} r={6} fill="hsl(45 95% 62%)" stroke="rgba(0,0,0,0.4)" strokeWidth={1.5}
        style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" }} />
      <text x={to.x} y={to.y + 0.5} textAnchor="middle" dominantBaseline="middle"
        fontSize={5.5} fill="rgba(0,0,0,0.85)" fontWeight="700">{label}</text>
    </motion.g>
  );
}

export function LiveDiamondCanvas({ gameState, latestEvent, homeAbbr, awayAbbr }: LiveDiamondCanvasProps) {
  const { runners, outs, inning, topBottom, homeScore, awayScore } = gameState;

  const showHit = latestEvent?.hitZone != null;
  const inningLabel = inning <= 9 ? `${inning}` : `${inning}`;
  const arrowUp = topBottom === "top" ? "▲" : "▼";

  return (
    <div className="relative w-full select-none" style={{ maxWidth: 420, margin: "0 auto" }}>
      <svg
        viewBox="0 0 400 380"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", width: "100%", borderRadius: 12, overflow: "hidden" }}
      >
        <defs>
          {/* outfield clip mask */}
          <clipPath id="outfieldClip">
            <path d="M 200,340 L 0,142 A 280,280 0 0,1 400,142 Z" />
          </clipPath>
          {/* foul territory clip */}
          <clipPath id="foulClip">
            <rect x={0} y={0} width={400} height={380} />
          </clipPath>
          {/* dirt infield circle */}
          <radialGradient id="dirtGrad" cx="50%" cy="70%" r="55%">
            <stop offset="0%"  stopColor="hsl(28 52% 48%)" />
            <stop offset="100%" stopColor="hsl(25 48% 40%)" />
          </radialGradient>
        </defs>

        {/* ── Sky / foul territory background ─────────────────────────────── */}
        <rect x={0} y={0} width={400} height={380} fill="hsl(210 18% 14%)" />

        {/* ── Outfield grass stripes ────────────────────────────────────── */}
        <GrassStripes />

        {/* ── Warning track (sandy band) ────────────────────────────────── */}
        <path
          d="M 0,142 A 280,280 0 0,1 400,142 L 382,160 A 256,256 0 0,0 18,160 Z"
          fill="hsl(28 48% 42%)"
        />

        {/* ── Outfield wall ─────────────────────────────────────────────── */}
        <path
          d="M 0,142 A 280,280 0 0,1 400,142"
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth={3}
        />

        {/* ── Foul lines ───────────────────────────────────────────────── */}
        <line x1={200} y1={340} x2={0} y2={142} stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />
        <line x1={200} y1={340} x2={400} y2={142} stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />

        {/* ── Infield dirt circle ────────────────────────────────────────── */}
        <circle cx={200} cy={258} r={118} fill="url(#dirtGrad)" />

        {/* ── Basepath dirt between bases (squares connecting bases) ───── */}
        {/* visual "skinned" basepath — just subtle tone overlays on dirt */}
        <line x1={THIRD.x} y1={THIRD.y} x2={SECOND.x} y2={SECOND.y} stroke="hsl(25 48% 36%)" strokeWidth={18} strokeLinecap="round" />
        <line x1={SECOND.x} y1={SECOND.y} x2={FIRST.x} y2={FIRST.y} stroke="hsl(25 48% 36%)" strokeWidth={18} strokeLinecap="round" />

        {/* ── Pitcher's mound ───────────────────────────────────────────── */}
        <ellipse cx={MOUND.x} cy={MOUND.y} rx={18} ry={12} fill="hsl(26 44% 43%)" />
        {/* pitching rubber */}
        <rect x={194} y={MOUND.y - 2} width={12} height={4} rx={1} fill="rgba(255,255,255,0.80)" />

        {/* ── Grass infield cutouts (between baselines and infield dirt) ─── */}
        {/* left-field triangle infield grass patch */}
        <polygon
          points={`${HOME.x},${HOME.y} ${THIRD.x},${THIRD.y} ${SECOND.x},${SECOND.y}`}
          fill="hsl(120 52% 21%)"
          opacity={0.55}
        />
        {/* right-field triangle */}
        <polygon
          points={`${HOME.x},${HOME.y} ${FIRST.x},${FIRST.y} ${SECOND.x},${SECOND.y}`}
          fill="hsl(120 52% 21%)"
          opacity={0.55}
        />

        {/* ── Batter's boxes ───────────────────────────────────────────── */}
        <rect x={179} y={325} width={13} height={22} rx={1} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
        <rect x={208} y={325} width={13} height={22} rx={1} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />

        {/* ── Catcher's box ────────────────────────────────────────────── */}
        <rect x={186} y={348} width={28} height={14} rx={1} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />

        {/* ── Home plate ───────────────────────────────────────────────── */}
        <polygon
          points={`${HOME.x},${HOME.y - 10} ${HOME.x + 8},${HOME.y - 4} ${HOME.x + 8},${HOME.y + 4} ${HOME.x - 8},${HOME.y + 4} ${HOME.x - 8},${HOME.y - 4}`}
          fill="rgba(255,255,255,0.88)"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={1}
        />

        {/* ── Bases ─────────────────────────────────────────────────────── */}
        <DiamondBase cx={FIRST.x}  cy={FIRST.y}  occupied={runners.first}  label="1B" />
        <DiamondBase cx={SECOND.x} cy={SECOND.y} occupied={runners.second} label="2B" />
        <DiamondBase cx={THIRD.x}  cy={THIRD.y}  occupied={runners.third}  label="3B" />

        {/* ── Runner dots on occupied bases ─────────────────────────────── */}
        <AnimatePresence>
          {runners.first  && <RunnerDot key="r1" from={HOME}  to={FIRST}  label="R" />}
          {runners.second && <RunnerDot key="r2" from={FIRST} to={SECOND} label="R" />}
          {runners.third  && <RunnerDot key="r3" from={SECOND} to={THIRD} label="R" />}
        </AnimatePresence>

        {/* ── Hit ball animation ────────────────────────────────────────── */}
        {showHit && latestEvent && (
          <HitBallAnimation
            key={latestEvent.sourceEventId}
            zone={latestEvent.hitZone!}
            eventId={latestEvent.sourceEventId}
          />
        )}

        {/* ── Outs indicator (circles top-right of diamond area) ───────── */}
        <g transform={`translate(322, 165)`}>
          <text x={0} y={0} fontSize={8} fill="rgba(255,255,255,0.5)" fontWeight="600" letterSpacing="0.5">OUTS</text>
          {[0, 1, 2].map(i => (
            <circle
              key={i}
              cx={i * 14 + 7} cy={12} r={5}
              fill={i < outs ? "hsl(0 72% 58%)" : "rgba(255,255,255,0.18)"}
              stroke={i < outs ? "hsl(0 72% 70%)" : "rgba(255,255,255,0.3)"}
              strokeWidth={1.2}
            />
          ))}
        </g>

        {/* ── Inning indicator (top-left of diamond area) ───────────────── */}
        <g transform={`translate(58, 165)`}>
          <text x={0} y={0} fontSize={8} fill="rgba(255,255,255,0.5)" fontWeight="600" letterSpacing="0.5">INNING</text>
          <text x={0} y={14} fontSize={15} fill="rgba(255,255,255,0.85)" fontWeight="800">{arrowUp} {inningLabel}</text>
        </g>

        {/* ── Score bar at top ──────────────────────────────────────────── */}
        <rect x={0} y={0} width={400} height={36} fill="rgba(0,0,0,0.55)" />
        {/* Away */}
        <text x={16} y={14} fontSize={9} fill="rgba(255,255,255,0.55)" fontWeight="600" letterSpacing="0.5">AWAY</text>
        <text x={16} y={29} fontSize={15} fill="rgba(255,255,255,0.90)" fontWeight="800">{awayAbbr}</text>
        <text x={72} y={27} fontSize={20} fill="rgba(255,255,255,0.95)" fontWeight="900" textAnchor="middle">{awayScore}</text>
        {/* separator */}
        <text x={200} y={27} fontSize={18} fill="rgba(255,255,255,0.30)" textAnchor="middle" fontWeight="300">—</text>
        {/* Home */}
        <text x={328} y={27} fontSize={20} fill="rgba(255,255,255,0.95)" fontWeight="900" textAnchor="middle">{homeScore}</text>
        <text x={370} y={14} fontSize={9} fill="rgba(255,255,255,0.55)" fontWeight="600" letterSpacing="0.5" textAnchor="end">HOME</text>
        <text x={384} y={29} fontSize={15} fill="rgba(255,255,255,0.90)" fontWeight="800" textAnchor="end">{homeAbbr}</text>

        {/* ── Count display (balls · strikes) ──────────────────────────── */}
        <g transform={`translate(152, 362)`}>
          {[0,1,2].map(i => (
            <circle key={`b${i}`} cx={i * 12} cy={7} r={4.5}
              fill={i < gameState.balls ? "hsl(120 60% 50%)" : "rgba(255,255,255,0.15)"}
              stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
          ))}
          <text x={42} y={12} fontSize={8} fill="rgba(255,255,255,0.35)">·</text>
          {[0,1].map(i => (
            <circle key={`s${i}`} cx={54 + i * 12} cy={7} r={4.5}
              fill={i < gameState.strikes ? "hsl(0 68% 55%)" : "rgba(255,255,255,0.15)"}
              stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
          ))}
          <text x={-10} y={12} fontSize={8} fill="rgba(255,255,255,0.4)" fontWeight="600">B</text>
          <text x={44} y={12} fontSize={8} fill="rgba(255,255,255,0.4)" fontWeight="600"> S</text>
        </g>
      </svg>
    </div>
  );
}
