import { useGames } from "@/hooks/use-games";
import { useMemo } from "react";

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

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(240_30%_6%)] via-[hsl(260_25%_10%)] to-[hsl(230_25%_8%)]" />
      <div className="absolute inset-0 star-field opacity-60" />
      <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-[hsl(260_60%_30%/0.08)] blur-[100px]" />
      <div className="absolute bottom-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-[hsl(195_70%_30%/0.06)] blur-[80px]" />
    </div>
  );
}
