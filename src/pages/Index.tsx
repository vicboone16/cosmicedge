import { useState, useCallback, useMemo } from "react";
import { RefreshCw, Loader2, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { GameCard } from "@/components/GameCard";
import { LeagueFilter } from "@/components/LeagueFilter";
import { AstroHeader } from "@/components/AstroHeader";
import { useGames } from "@/hooks/use-games";
import { useTimezone } from "@/hooks/use-timezone";
import type { League } from "@/lib/mock-data";
import { format, addDays, isToday } from "date-fns";

const Index = () => {
  const [selectedLeague, setSelectedLeague] = useState<League | "ALL">("ALL");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { userTimezone } = useTimezone();
  const { data: games, isLoading, isError, refetch, isFetching } = useGames(selectedLeague, selectedDate, userTimezone);

  const canGoForward = selectedDate < addDays(new Date(), 7);
  const goBack = useCallback(() => setSelectedDate((d) => addDays(d, -1)), []);
  const goForward = useCallback(() => setSelectedDate((d) => addDays(d, 1)), []);
  const goToday = useCallback(() => setSelectedDate(new Date()), []);
  const handleRefresh = useCallback(() => refetch(), [refetch]);

  const { liveGames, upcoming, final: finalGames } = useMemo(() => ({
    liveGames: games?.filter((g) => g.status === "live") || [],
    upcoming: games?.filter((g) => g.status === "scheduled") || [],
    final: games?.filter((g) => g.status === "final") || [],
  }), [games]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-4 pt-12 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 mb-1">
              <Star className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold font-display tracking-tight">Cosmic Edge</h1>
            </div>
            <button
              onClick={handleRefresh}
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
          <div className="flex items-center gap-2 mt-0.5">
            <button onClick={goBack} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={goToday}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {isToday(selectedDate)
                ? `${format(selectedDate, "EEE, MMM d")} · Today`
                : format(selectedDate, "EEE, MMM d")}
            </button>
            <button onClick={goForward} disabled={!canGoForward} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {!isToday(selectedDate) && (
              <button onClick={goToday} className="text-[10px] text-primary hover:underline ml-1">
                Today
              </button>
            )}
          </div>
        </div>

        <LeagueFilter selected={selectedLeague} onSelect={setSelectedLeague} />
      </header>

      {/* Rich Astro Dashboard - scrollable, not in sticky header */}
      <AstroHeader date={selectedDate} />

      {/* Content */}
      <div className="px-4 py-4 space-y-6">
        {(selectedLeague === "NCAAF" || selectedLeague === "MLB") ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-6">
            <span className="text-4xl">🔮✨</span>
            <p className="text-lg font-semibold font-display text-foreground">The Stars Are Still Charting This One…</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              {selectedLeague === "MLB"
                ? "MLB coverage is aligning — rosters and schedules are still forming. The celestial edge is coming to baseball soon."
                : "NCAA Football coverage is aligning in the cosmos. Stay tuned — the celestial edge is coming to college football soon."}
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Consulting the stars...</span>
          </div>
        ) : null}

        {selectedLeague !== "NCAAF" && selectedLeague !== "MLB" && isError && (
          <div className="text-center py-16">
            <p className="text-sm text-destructive mb-2">The cosmos are misaligned</p>
            <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
              Realign & retry
            </button>
          </div>
        )}

        {selectedLeague !== "NCAAF" && selectedLeague !== "MLB" && !isLoading && !isError && (
          <>
            {liveGames.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-cosmic-green uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse-glow" />
                  Live · Celestial Energy Active
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
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Star className="h-3 w-3 text-cosmic-lavender" />
                  Upcoming · Chart Alignments
                </h2>
                <div className="space-y-3">
                  {upcoming.map((game) => (
                    <GameCard key={game.id} game={game} />
                  ))}
                </div>
              </section>
            )}

            {finalGames.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Settled · Outcomes Recorded
                </h2>
                <div className="space-y-3">
                  {finalGames.map((game) => (
                    <GameCard key={game.id} game={game} />
                  ))}
                </div>
              </section>
            )}

            {!games?.length && (
              <div className="text-center py-16">
                <p className="text-2xl mb-2">✦</p>
                <p className="text-muted-foreground text-sm">No games aligned for today</p>
                <p className="text-xs text-muted-foreground mt-1">The stars rest — check back for tomorrow's slate</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
