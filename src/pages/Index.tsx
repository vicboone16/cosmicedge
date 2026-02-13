import { useState } from "react";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { GameCard } from "@/components/GameCard";
import { LeagueFilter } from "@/components/LeagueFilter";
import { AstroHeader } from "@/components/AstroHeader";
import { useGames } from "@/hooks/use-games";
import type { League } from "@/lib/mock-data";
import { format } from "date-fns";

const Index = () => {
  const [selectedLeague, setSelectedLeague] = useState<League | "ALL">("ALL");
  const { data: games, isLoading, isError, refetch, isFetching } = useGames(selectedLeague);

  const liveGames = games?.filter((g) => g.status === "live") || [];
  const upcoming = games?.filter((g) => g.status === "scheduled") || [];
  const final = games?.filter((g) => g.status === "final") || [];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-4 pt-12 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold font-display tracking-tight">Cosmic Edge</h1>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d")} · Today's Slate
          </p>
        </div>

        {/* Astro Banner */}
        <AstroHeader />

        <LeagueFilter selected={selectedLeague} onSelect={setSelectedLeague} />
      </header>

      {/* Content */}
      <div className="px-4 py-4 space-y-6">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Fetching odds...</span>
          </div>
        )}

        {isError && (
          <div className="text-center py-16">
            <p className="text-sm text-destructive mb-2">Failed to load games</p>
            <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {liveGames.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-cosmic-green uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse-glow" />
                  Live Now
                </h2>
                <div className="space-y-3">
                  {liveGames.map((game) => (
                    <GameCard key={game.id} game={game} />
                  ))}
                </div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Upcoming
                </h2>
                <div className="space-y-3">
                  {upcoming.map((game) => (
                    <GameCard key={game.id} game={game} />
                  ))}
                </div>
              </section>
            )}

            {final.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Final
                </h2>
                <div className="space-y-3">
                  {final.map((game) => (
                    <GameCard key={game.id} game={game} />
                  ))}
                </div>
              </section>
            )}

            {!games?.length && (
              <div className="text-center py-16">
                <p className="text-muted-foreground text-sm">No games found for today</p>
                <p className="text-xs text-muted-foreground mt-1">Try refreshing or check back later</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
