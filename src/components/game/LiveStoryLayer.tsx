import { cn } from "@/lib/utils";
import { useGameMomentum, type MomentumLabel } from "@/hooks/use-game-momentum";

type GamePhase = "pregame" | "live" | "final";

interface LiveStoryLayerProps {
  gameId: string;
  gameStatus?: string;
}

function resolvePhase(status?: string): GamePhase {
  if (!status || status === "scheduled") return "pregame";
  if (status === "final") return "final";
  if (status === "live" || status === "in_progress") return "live";
  return "pregame";
}

/**
 * Atmospheric background layer with distinct treatments per game phase.
 * - Pregame: calm starry ambience, no momentum reactivity
 * - Live: subtle momentum-reactive blooms
 * - Final: resolved, low-motion state
 */
export function LiveStoryLayer({ gameId, gameStatus }: LiveStoryLayerProps) {
  const phase = resolvePhase(gameStatus);
  const isLive = phase === "live";
  const momentum = useGameMomentum(gameId, isLive);

  // Pregame: calm cosmic, no heavy overlays
  if (phase === "pregame") {
    return (
      <div
        className="fixed inset-0 -z-[5] pointer-events-none overflow-hidden opacity-60"
        aria-hidden
      >
        <div className="absolute inset-0 star-field opacity-20" />
        <div className="absolute inset-0 star-field animate-twinkle-slow opacity-10" />
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full blur-[100px]"
          style={{ background: `hsl(var(--cosmic-glow) / 0.03)` }}
        />
      </div>
    );
  }

  // Final: resolved, minimal motion
  if (phase === "final") {
    return (
      <div
        className="fixed inset-0 -z-[5] pointer-events-none overflow-hidden opacity-40"
        aria-hidden
      >
        <div className="absolute inset-0 star-field opacity-15" />
        <div
          className="absolute top-1/4 left-1/3 w-[250px] h-[250px] rounded-full blur-[90px]"
          style={{ background: `hsl(var(--muted) / 0.04)` }}
        />
        <div
          className="absolute bottom-1/3 right-1/4 w-[200px] h-[200px] rounded-full blur-[80px]"
          style={{ background: `hsl(var(--cosmic-cyan) / 0.02)` }}
        />
      </div>
    );
  }

  // Live: momentum-reactive atmospheric layer
  const label = momentum?.momentumLabel ?? "Neutral";
  const intensity = getIntensity(label);
  const palette = getPalette(label);

  return (
    <div
      className="fixed inset-0 -z-[5] pointer-events-none overflow-hidden transition-opacity duration-[1600ms] ease-out opacity-100"
      aria-hidden
    >
      {/* Keep base readable: no dark scrim, only light atmospheric tint */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, hsl(var(--background) / 0), hsl(var(--background) / 0.04) 50%, hsl(var(--background) / 0.02))`,
        }}
      />

      {/* Primary ambient bloom */}
      <div
        className="absolute inset-0 transition-all duration-[2600ms] ease-in-out"
        style={{
          background: `radial-gradient(ellipse 70% 48% at 50% 26%, ${palette.primary}, transparent 72%)`,
          opacity: intensity * 0.07,
        }}
      />

      {/* Secondary corner bloom */}
      <div
        className={cn(
          "absolute -bottom-[8%] -right-[8%] w-[62vw] h-[55vh] rounded-full blur-[120px] transition-all duration-[2600ms]",
          intensity >= 0.7 ? "animate-nebula-pulse" : "animate-nebula-pulse-slow"
        )}
        style={{
          background: palette.secondary,
          opacity: intensity * 0.055,
        }}
      />

      {/* Top-left live accent */}
      <div
        className="absolute -top-[8%] -left-[5%] w-[46vw] h-[42vh] rounded-full blur-[100px] animate-nebula-drift"
        style={{
          background: palette.accent,
          opacity: intensity * 0.045,
        }}
      />

      {/* Fine star shimmer in live mode */}
      <div className="absolute inset-0 star-field animate-twinkle-slow opacity-[0.08]" />

      {/* High-intensity top ribbon (still subtle) */}
      {intensity >= 0.8 && (
        <div
          className="absolute top-0 left-0 w-full h-[1px] animate-nebula-drift"
          style={{
            background: `linear-gradient(90deg, transparent 12%, ${palette.accent} 50%, transparent 88%)`,
            opacity: 0.28,
          }}
        />
      )}
    </div>
  );
}

function getIntensity(label: MomentumLabel): number {
  switch (label) {
    case "Explosive": return 1.0;
    case "Surge": return 0.85;
    case "Heating Up": return 0.7;
    case "Closing Battle": return 0.75;
    case "Comeback Pressure": return 0.8;
    case "Volatile": return 0.65;
    case "Neutral": return 0.3;
    case "Slowing": return 0.2;
    case "Cooling": return 0.15;
    case "Dead Zone": return 0.1;
    default: return 0.3;
  }
}

function getPalette(label: MomentumLabel): { primary: string; secondary: string; accent: string } {
  switch (label) {
    case "Explosive":
    case "Surge":
      return {
        primary: "hsl(var(--cosmic-red) / 0.10)",
        secondary: "hsl(var(--cosmic-gold) / 0.08)",
        accent: "hsl(var(--cosmic-gold) / 0.12)",
      };
    case "Heating Up":
    case "Closing Battle":
      return {
        primary: "hsl(var(--cosmic-gold) / 0.08)",
        secondary: "hsl(var(--cosmic-glow) / 0.07)",
        accent: "hsl(var(--cosmic-gold) / 0.10)",
      };
    case "Comeback Pressure":
      return {
        primary: "hsl(var(--cosmic-cyan) / 0.10)",
        secondary: "hsl(var(--cosmic-red) / 0.07)",
        accent: "hsl(var(--cosmic-cyan) / 0.12)",
      };
    case "Volatile":
      return {
        primary: "hsl(var(--cosmic-lavender) / 0.08)",
        secondary: "hsl(var(--cosmic-cyan) / 0.05)",
        accent: "hsl(var(--cosmic-lavender) / 0.10)",
      };
    case "Cooling":
    case "Slowing":
    case "Dead Zone":
      return {
        primary: "hsl(var(--muted) / 0.05)",
        secondary: "hsl(var(--muted) / 0.04)",
        accent: "hsl(var(--muted) / 0.05)",
      };
    default:
      return {
        primary: "hsl(var(--cosmic-glow) / 0.06)",
        secondary: "hsl(var(--cosmic-cyan) / 0.04)",
        accent: "hsl(var(--cosmic-glow) / 0.08)",
      };
  }
}
