import { useState } from "react";
import { Sparkles } from "lucide-react";
import { GameCard } from "@/components/GameCard";
import { LeagueFilter } from "@/components/LeagueFilter";
import { mockGames, type League } from "@/lib/mock-data";
import { format } from "date-fns";

const Index = () => {
  const [selectedLeague, setSelectedLeague] = useState<League | "ALL">("ALL");

  const filtered = selectedLeague === "ALL"
    ? mockGames
    : mockGames.filter((g) => g.league === selectedLeague);

  const liveGames = filtered.filter((g) => g.status === "live");
  const upcoming = filtered.filter((g) => g.status === "scheduled");
  const final = filtered.filter((g) => g.status === "final");

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/70 backdrop-blur-xl border-b border-border/50">
        <div className="px-4 pt-12 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold font-display tracking-tight">Cosmic Edge</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d")} · Today's Slate
          </p>
        </div>
        <LeagueFilter selected={selectedLeague} onSelect={setSelectedLeague} />
      </header>

      {/* Content */}
      <div className="px-4 py-4 space-y-6">
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

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">No games for this league today</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
