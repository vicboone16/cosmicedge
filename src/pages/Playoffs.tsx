/**
 * Playoffs Page — Playoff Analytics with bracket, cosmic narratives, and round history.
 * Recreated from the live Lovable version + new features #8, #9, #10.
 */
import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trophy, RefreshCw, Loader2, Activity, Hash, TrendingUp, Zap } from "lucide-react";
import { usePlayoffSeries, type PlayoffSeries } from "@/hooks/use-playoff-series";
import { PlayoffBracket } from "@/components/playoffs/PlayoffBracket";
import { SeriesCosmicNarrative } from "@/components/playoffs/SeriesCosmicNarrative";
import { RoundHistory } from "@/components/playoffs/RoundHistory";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { League } from "@/lib/mock-data";

const LEAGUES = ["NBA", "MLB", "NHL"] as const;

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex-1 min-w-[70px] rounded-xl bg-secondary/20 border border-border/20 p-3 text-center">
      <div className="flex items-center justify-center mb-1 text-muted-foreground">{icon}</div>
      <p className="text-lg font-bold font-display text-foreground">{value}</p>
      <p className="text-[8px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}

function GameRow({ game, isUpcoming }: { game: any; isUpcoming: boolean }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/game/${game.id}`)}
      className="w-full flex items-center justify-between px-3 py-3 rounded-xl bg-secondary/15 border border-border/20 hover:border-primary/20 transition-colors"
    >
      <div className="flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{game.awayAbbr}</span>
          <span className="text-[10px] text-muted-foreground">@</span>
          <span className="text-xs font-semibold text-foreground">{game.homeAbbr}</span>
        </div>
        {isUpcoming ? (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {format(new Date(game.startTime), "EEE, MMM d · h:mm a")}
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {game.awayScore} - {game.homeScore} · {format(new Date(game.startTime), "MMM d")}
          </p>
        )}
      </div>
      {game.venue && (
        <span className="text-[9px] text-muted-foreground max-w-[80px] truncate">{game.venue}</span>
      )}
    </button>
  );
}

const Playoffs = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const leagueParam = searchParams.get("league") || "NBA";
  const selectedLeague = LEAGUES.includes(leagueParam as any) ? leagueParam : "NBA";

  const setLeague = (l: string) => setSearchParams({ league: l });

  const { data: series, isLoading, isError, refetch, isFetching } = usePlayoffSeries(selectedLeague);

  // Compute stats from all series
  const stats = useMemo(() => {
    if (!series?.length) return { gamesPlayed: 0, avgTotal: 0, blowouts: 0, liveNow: 0 };

    let gamesPlayed = 0;
    let totalPoints = 0;
    let blowouts = 0;
    let liveNow = 0;

    for (const s of series) {
      for (const g of s.games) {
        if (g.status === "final") {
          gamesPlayed++;
          const total = (g.homeScore ?? 0) + (g.awayScore ?? 0);
          totalPoints += total;
          const diff = Math.abs((g.homeScore ?? 0) - (g.awayScore ?? 0));
          if (diff >= 15) blowouts++;
        }
        if (g.status === "live" || g.status === "in_progress") liveNow++;
      }
    }

    return {
      gamesPlayed,
      avgTotal: gamesPlayed > 0 ? Math.round(totalPoints / gamesPlayed) : 0,
      blowouts,
      liveNow,
    };
  }, [series]);

  // Get current round name
  const currentRound = useMemo(() => {
    if (!series?.length) return "";
    const activeSeries = series.filter((s) => !s.isComplete);
    return activeSeries[0]?.round || series[series.length - 1]?.round || "";
  }, [series]);

  // Separate upcoming and completed games from active series
  const { upcomingGames, recentResults } = useMemo(() => {
    if (!series?.length) return { upcomingGames: [], recentResults: [] };

    const upcoming: any[] = [];
    const recent: any[] = [];

    for (const s of series) {
      for (const g of s.games) {
        if (g.status === "scheduled") upcoming.push(g);
        else if (g.status === "final") recent.push(g);
      }
    }

    upcoming.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    recent.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    return { upcomingGames: upcoming.slice(0, 10), recentResults: recent.slice(0, 10) };
  }, [series]);

  return (
    <div className="min-h-screen dark:slate-twilight-bg slate-twilight-bg-light">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-b from-purple-300/30 via-purple-200/15 to-transparent dark:from-black/30 dark:via-black/10 dark:to-transparent backdrop-blur-sm border-b border-purple-400/10 dark:border-white/5">
        <div className="px-4 pt-12 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-cosmic-gold" />
              <h1 className="text-lg font-bold font-display tracking-tight">Playoff Analytics</h1>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Cosmic Edge playoff intelligence & bracket tracker
          </p>
        </div>

        {/* League filter */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
          {LEAGUES.map((l) => (
            <button
              key={l}
              onClick={() => setLeague(l)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-semibold transition-all",
                selectedLeague === l
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="px-4 py-4 space-y-5">
        {/* Season banner */}
        {currentRound && (
          <div className="rounded-xl bg-gradient-to-r from-primary/10 to-cosmic-gold/10 border border-primary/20 px-4 py-3 text-center">
            <p className="text-sm font-bold font-display text-foreground">
              2026 {selectedLeague} Playoffs — {currentRound}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading playoff data...</span>
          </div>
        ) : isError ? (
          <div className="text-center py-16">
            <p className="text-sm text-destructive mb-2">Failed to load playoff data</p>
            <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Retry</button>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <StatCard icon={<Activity className="h-3.5 w-3.5" />} label="Live Now" value={stats.liveNow} />
              <StatCard icon={<Hash className="h-3.5 w-3.5" />} label="Games Played" value={stats.gamesPlayed} />
              <StatCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="Avg Total Pts" value={stats.avgTotal} />
              <StatCard icon={<Zap className="h-3.5 w-3.5" />} label="Blowouts ≥15" value={stats.blowouts} />
            </div>

            {/* #8 — Bracket visualization */}
            {series && series.length > 0 && (
              <PlayoffBracket series={series} league={selectedLeague} />
            )}

            {/* #9 — Cosmic Narratives for active series */}
            {series && series.length > 0 && (
              <SeriesCosmicNarrative series={series} league={selectedLeague} />
            )}

            {/* Upcoming Games */}
            {upcomingGames.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse-glow" />
                  Upcoming
                </h2>
                <div className="space-y-2">
                  {upcomingGames.map((g) => (
                    <GameRow key={g.id} game={g} isUpcoming />
                  ))}
                </div>
              </section>
            )}

            {/* Recent Results */}
            {recentResults.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Recent Results
                </h2>
                <div className="space-y-2">
                  {recentResults.map((g) => (
                    <GameRow key={g.id} game={g} isUpcoming={false} />
                  ))}
                </div>
              </section>
            )}

            {/* #10 — Round History with cosmic accuracy */}
            {series && series.length > 0 && (
              <RoundHistory series={series} league={selectedLeague} />
            )}

            {/* Empty state */}
            {(!series || series.length === 0) && (
              <div className="text-center py-16">
                <p className="text-2xl mb-2">🏆</p>
                <p className="text-muted-foreground text-sm">No playoff series found for {selectedLeague}</p>
                <p className="text-xs text-muted-foreground mt-1">Check back when the postseason begins</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Playoffs;
