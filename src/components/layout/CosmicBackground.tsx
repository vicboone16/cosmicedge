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
      {/* Deep space gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(240_30%_6%)] via-[hsl(260_25%_10%)] to-[hsl(230_25%_8%)]" />

      {/* Static star layers */}
      <div className="absolute inset-0 star-field opacity-60" />

      {/* Twinkling star layer 1 */}
      <div className="absolute inset-0 star-field animate-twinkle-slow opacity-40" />

      {/* Twinkling star layer 2 (offset timing) */}
      <div className="absolute inset-0 star-field animate-twinkle-fast opacity-30 scale-[1.3] rotate-12" />

      {/* Primary nebula glow - pulsing */}
      <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-[hsl(260_60%_30%/0.10)] blur-[100px] animate-nebula-pulse" />

      {/* Secondary nebula glow - counter-pulsing */}
      <div className="absolute bottom-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-[hsl(195_70%_30%/0.08)] blur-[80px] animate-nebula-drift" />

      {/* Subtle gold accent nebula */}
      <div className="absolute top-2/3 left-1/5 w-[200px] h-[200px] rounded-full bg-[hsl(42_60%_40%/0.04)] blur-[60px] animate-nebula-pulse-slow" />
    </div>
  );
}
