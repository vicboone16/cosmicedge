import { cn } from "@/lib/utils";
import { useGameMomentum, type MomentumLabel } from "@/hooks/use-game-momentum";

interface LiveStoryLayerProps {
  gameId: string;
  isLive: boolean;
}

/**
 * Subtle atmospheric background layer for live games.
 * Intentionally low opacity to preserve card/text readability.
 */
export function LiveStoryLayer({ gameId, isLive }: LiveStoryLayerProps) {
  const momentum = useGameMomentum(gameId, isLive);

  if (!isLive) return null;

  const label = momentum?.momentumLabel ?? "Neutral";
  const intensity = getIntensity(label);
  const palette = getPalette(label);

  return (
    <div
      className={cn(
        "fixed inset-0 -z-[5] pointer-events-none overflow-hidden transition-opacity duration-[1600ms] ease-out",
        isLive ? "opacity-100" : "opacity-0"
      )}
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
