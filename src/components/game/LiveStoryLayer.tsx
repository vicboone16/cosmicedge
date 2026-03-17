import { cn } from "@/lib/utils";
import { useGameMomentum, type MomentumLabel } from "@/hooks/use-game-momentum";

interface LiveStoryLayerProps {
  gameId: string;
  isLive: boolean;
}

/**
 * Immersive atmospheric overlay for live game detail pages.
 * Intensifies based on momentum state — explosive games get dramatic effects,
 * dead zones get subdued atmospheres.
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
      {/* Ambient gradient wash — shifts hue with momentum */}
      <div
        className="absolute inset-0 transition-all duration-[3000ms] ease-in-out"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${palette.primary}, transparent 70%)`,
          opacity: intensity * 0.35,
        }}
      />

      {/* Secondary pulse — corner accent */}
      <div
        className={cn(
          "absolute bottom-0 right-0 w-[50vw] h-[50vh] rounded-full blur-[100px] transition-all duration-[3000ms]",
          intensity >= 0.7 ? "animate-nebula-pulse" : "animate-nebula-pulse-slow"
        )}
        style={{
          background: palette.secondary,
          opacity: intensity * 0.25,
        }}
      />

      {/* Surge ribbon — visible only during high-intensity moments */}
      {intensity >= 0.6 && (
        <div
          className="absolute top-0 left-0 w-full h-1 animate-nebula-drift"
          style={{
            background: `linear-gradient(90deg, transparent, ${palette.accent}, transparent)`,
            opacity: intensity * 0.5,
          }}
        />
      )}

      {/* Explosive particle shimmer — max intensity only */}
      {intensity >= 0.9 && (
        <div className="absolute inset-0 star-field animate-twinkle-fast opacity-20" />
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
        primary: "hsl(0 65% 50% / 0.15)",
        secondary: "hsl(42 80% 55% / 0.12)",
        accent: "hsl(42 80% 55% / 0.4)",
      };
    case "Heating Up":
    case "Closing Battle":
      return {
        primary: "hsl(42 80% 55% / 0.12)",
        secondary: "hsl(260 60% 55% / 0.10)",
        accent: "hsl(42 80% 55% / 0.3)",
      };
    case "Comeback Pressure":
      return {
        primary: "hsl(195 70% 45% / 0.15)",
        secondary: "hsl(0 65% 50% / 0.10)",
        accent: "hsl(195 70% 45% / 0.4)",
      };
    case "Volatile":
      return {
        primary: "hsl(270 40% 55% / 0.12)",
        secondary: "hsl(195 70% 45% / 0.08)",
        accent: "hsl(270 40% 55% / 0.3)",
      };
    case "Cooling":
    case "Slowing":
    case "Dead Zone":
      return {
        primary: "hsl(230 25% 30% / 0.06)",
        secondary: "hsl(230 20% 20% / 0.04)",
        accent: "hsl(230 20% 40% / 0.15)",
      };
    default: // Neutral
      return {
        primary: "hsl(260 60% 55% / 0.06)",
        secondary: "hsl(195 70% 45% / 0.04)",
        accent: "hsl(260 60% 55% / 0.2)",
      };
  }
}
