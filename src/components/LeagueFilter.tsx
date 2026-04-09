import { memo, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { League } from "@/lib/mock-data";
import { leagues } from "@/lib/mock-data";

interface LeagueFilterProps {
  selected: League | "ALL";
  onSelect: (league: League | "ALL") => void;
}

const options: (League | "ALL")[] = ["ALL", ...leagues];

// Leagues that are not yet available — selectable but flagged as coming soon
const COMING_SOON_LEAGUES = new Set<League | "ALL">(["NFL", "NCAAF"]);

export const LeagueFilter = memo(function LeagueFilter({ selected, onSelect }: LeagueFilterProps) {
  return (
    <div className="relative">
      <div className="flex gap-2 overflow-x-auto px-4 py-2 no-scrollbar">
        {options.map((league) => (
          <LeagueButton key={league} league={league} selected={selected === league} onSelect={onSelect} />
        ))}
      </div>
      {/* Right-edge fade to hint at scrollable overflow */}
      <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
});

const LeagueButton = memo(function LeagueButton({
  league,
  selected,
  onSelect,
}: {
  league: League | "ALL";
  selected: boolean;
  onSelect: (league: League | "ALL") => void;
}) {
  const handleClick = useCallback(() => onSelect(league), [onSelect, league]);
  const isComingSoon = COMING_SOON_LEAGUES.has(league);

  return (
    <button
      onClick={handleClick}
      title={isComingSoon ? `${league} — coming soon` : undefined}
      className={cn(
        "relative px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap",
        selected
          ? "bg-primary text-primary-foreground cosmic-glow"
          : isComingSoon
            ? "bg-secondary text-muted-foreground/50 hover:bg-secondary/80"
            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
      )}
    >
      {league}
      {league === "NCAAB" && (
        <span className="ml-1 text-[8px] font-normal opacity-70 align-super">β</span>
      )}
      {isComingSoon && (
        <span className="ml-1 text-[7px] font-normal opacity-60 align-super">soon</span>
      )}
    </button>
  );
});
