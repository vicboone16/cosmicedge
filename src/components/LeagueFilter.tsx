import { cn } from "@/lib/utils";
import type { League } from "@/lib/mock-data";
import { leagues } from "@/lib/mock-data";

interface LeagueFilterProps {
  selected: League | "ALL";
  onSelect: (league: League | "ALL") => void;
}

export function LeagueFilter({ selected, onSelect }: LeagueFilterProps) {
  const options: (League | "ALL")[] = ["ALL", ...leagues];

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2 no-scrollbar">
      {options.map((league) => (
        <button
          key={league}
          onClick={() => onSelect(league)}
          className={cn(
            "px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap",
            selected === league
              ? "bg-primary text-primary-foreground cosmic-glow"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          )}
        >
          {league}
          {league === "NCAAB" && (
            <span className="ml-1 text-[8px] font-normal opacity-70 align-super">β</span>
          )}
        </button>
      ))}
    </div>
  );
}
