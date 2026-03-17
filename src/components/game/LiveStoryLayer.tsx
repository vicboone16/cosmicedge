import { cn } from "@/lib/utils";
import { useGameMomentum, type MomentumLabel } from "@/hooks/use-game-momentum";

interface LiveStoryLayerProps {
  gameId: string;
  isLive: boolean;
}

/**
 * Subtle atmospheric overlay for live game detail pages.
 * Provides a "cosmic alive" feel — color accents without reducing readability.
 * Uses CSS design tokens. All effects are very low opacity.
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
        "fixed inset-0 -z-[5] pointer-events-none overflow-hidden transition-opacity duration-[2000ms] ease-in-out",
        isLive ? "opacity-100" : "opacity-0"
      )}
      aria-hidden
    >
      {/* Soft ambient gradient — colorful but light, never darkening */}
      <div
        className="absolute inset-0 transition-all duration-[3000ms] ease-in-out"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${palette.primary}, transparent 70%)`,
          opacity: intensity * 0.12,
        }}
      />

      {/* Secondary pulse — corner accent with color */}
      <div
        className={cn(
          "absolute bottom-0 right-0 w-[50vw] h-[50vh] rounded-full blur-[120px] transition-all duration-[3000ms]",
          intensity >= 0.7 ? "animate-nebula-pulse" : "animate-nebula-pulse-slow"
        )}
        style={{
          background: palette.secondary,
          opacity: intensity * 0.08,
        }}
      />

      {/* Top-left color accent for live vibrancy */}
      <div
        className="absolute top-0 left-0 w-[40vw] h-[40vh] rounded-full blur-[100px] animate-nebula-drift"
        style={{
          background: palette.accent,
          opacity: intensity * 0.06,
        }}
      />

      {/* Thin surge ribbon — visible during high-intensity moments */}
      {intensity >= 0.7 && (
        <div
          className="absolute top-0 left-0 w-full h-[2px] animate-nebula-drift"
          style={{
            background: `linear-gradient(90deg, transparent 10%, ${palette.accent} 50%, transparent 90%)`,
            opacity: intensity * 0.25,
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
        primary: "hsl(var(--cosmic-red) / 0.12)",
        secondary: "hsl(var(--cosmic-gold) / 0.10)",
        accent: "hsl(var(--cosmic-gold) / 0.15)",
      };
    case "Heating Up":
    case "Closing Battle":
      return {
        primary: "hsl(var(--cosmic-gold) / 0.10)",
        secondary: "hsl(var(--cosmic-glow) / 0.08)",
        accent: "hsl(var(--cosmic-gold) / 0.12)",
      };
    case "Comeback Pressure":
      return {
        primary: "hsl(var(--cosmic-cyan) / 0.12)",
        secondary: "hsl(var(--cosmic-red) / 0.08)",
        accent: "hsl(var(--cosmic-cyan) / 0.15)",
      };
    case "Volatile":
      return {
        primary: "hsl(var(--cosmic-lavender) / 0.10)",
        secondary: "hsl(var(--cosmic-cyan) / 0.06)",
        accent: "hsl(var(--cosmic-lavender) / 0.12)",
      };
    case "Cooling":
    case "Slowing":
    case "Dead Zone":
      return {
        primary: "hsl(var(--muted) / 0.06)",
        secondary: "hsl(var(--muted) / 0.04)",
        accent: "hsl(var(--muted) / 0.05)",
      };
    default: // Neutral
      return {
        primary: "hsl(var(--cosmic-glow) / 0.06)",
        secondary: "hsl(var(--cosmic-cyan) / 0.04)",
        accent: "hsl(var(--cosmic-glow) / 0.08)",
      };
  }
}
