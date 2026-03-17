import { useGames } from "@/hooks/use-games";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export function CosmicBackground() {
  const { data: games } = useGames("ALL", new Date());

  const isActive = useMemo(() => {
    if (!games || games.length === 0) return false;
    const now = Date.now();
    const thirtyMin = 30 * 60 * 1000;

    const hasLive = games.some(g => g.status === "live" || g.status === "in_progress");
    if (hasLive) return true;

    const starts = games.map(g => new Date(g.start_time).getTime());
    const firstStart = Math.min(...starts);
    const lastStart = Math.max(...starts);

    if (now >= firstStart - thirtyMin && now <= lastStart + 3 * 60 * 60 * 1000 + thirtyMin) return true;
    return false;
  }, [games]);

  return (
    <div
      className={cn(
        "fixed inset-0 -z-10 pointer-events-none overflow-hidden transition-opacity duration-[1500ms] ease-in-out",
        isActive ? "opacity-100" : "opacity-40"
      )}
    >
      {/* Deep space gradient — uses semantic tokens, NOT hardcoded dark values */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, hsl(var(--background)), hsl(var(--background) / 0.95), hsl(var(--background)))`,
        }}
      />

      {/* Static star layers — subtle sparkle */}
      <div className="absolute inset-0 star-field opacity-40" />

      {/* Twinkling star layer 1 */}
      <div className="absolute inset-0 star-field animate-twinkle-slow opacity-25" />

      {/* Twinkling star layer 2 (offset timing) */}
      <div className="absolute inset-0 star-field animate-twinkle-fast opacity-15 scale-[1.3] rotate-12" />

      {/* Primary nebula glow — very subtle, no darkening */}
      <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] rounded-full blur-[100px] animate-nebula-pulse"
        style={{ background: `hsl(var(--cosmic-glow) / 0.06)` }}
      />

      {/* Secondary nebula glow */}
      <div className="absolute bottom-1/3 right-1/4 w-[300px] h-[300px] rounded-full blur-[80px] animate-nebula-drift"
        style={{ background: `hsl(var(--cosmic-cyan) / 0.04)` }}
      />

      {/* Subtle gold accent nebula */}
      <div className="absolute top-2/3 left-[20%] w-[200px] h-[200px] rounded-full blur-[60px] animate-nebula-pulse-slow"
        style={{ background: `hsl(var(--cosmic-gold) / 0.03)` }}
      />
    </div>
  );
}
