/**
 * #5 — Team Astro Context Block
 * Shows each team's astrological DNA: founded date, ruling planet, element,
 * modality, mascot sign, city ruler. Dual-column layout.
 */
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, Calendar, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  homeAbbr: string;
  awayAbbr: string;
}

const PLANET_SYMBOLS: Record<string, string> = {
  Mars: "♂", Venus: "♀", Mercury: "☿", Moon: "☽", Sun: "☉",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};

const ELEMENT_EMOJI: Record<string, string> = {
  Fire: "🔥", Earth: "🌍", Air: "💨", Water: "🌊",
};

const MODALITY_DESC: Record<string, string> = {
  Cardinal: "Initiators — fast starts, first-half dominance",
  Fixed: "Grinders — won't quit, 4th quarter strength",
  Mutable: "Adapters — versatile, matchup-proof",
};

interface TeamAstroData {
  team_abbr: string;
  element: string | null;
  ruling_planet: string | null;
  modality: string | null;
  mascot_sign: string | null;
  city_ruler: string | null;
  founded_date: string | null;
  founded_city: string | null;
}

function TeamProfile({ team, abbr }: { team: TeamAstroData; abbr: string }) {
  const rows = [
    {
      label: "Element",
      value: team.element
        ? `${ELEMENT_EMOJI[team.element] || ""} ${team.element}`
        : null,
    },
    {
      label: "Ruler",
      value: team.ruling_planet
        ? `${PLANET_SYMBOLS[team.ruling_planet] || ""} ${team.ruling_planet}`
        : null,
    },
    { label: "Modality", value: team.modality },
    { label: "Mascot Sign", value: team.mascot_sign },
    { label: "City Ruler", value: team.city_ruler },
    {
      label: "Founded",
      value: team.founded_date
        ? `${team.founded_date.slice(0, 4)}${team.founded_city ? ` · ${team.founded_city}` : ""}`
        : null,
    },
  ].filter(r => r.value);

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">{abbr}</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between items-center">
            <span className="text-[9px] text-muted-foreground">{r.label}</span>
            <span className="text-[10px] font-medium text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
      {team.modality && MODALITY_DESC[team.modality] && (
        <p className="text-[8px] text-muted-foreground italic mt-2">
          {MODALITY_DESC[team.modality]}
        </p>
      )}
    </div>
  );
}

export function TeamAstroContext({ homeAbbr, awayAbbr }: Props) {
  const { data: teamAstro, isLoading } = useQuery({
    queryKey: ["team-astro-context", homeAbbr, awayAbbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_astro")
        .select("team_abbr, element, ruling_planet, modality, mascot_sign, city_ruler, founded_date, founded_city")
        .in("team_abbr", [homeAbbr, awayAbbr]);
      return (data || []) as TeamAstroData[];
    },
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Team Astro DNA
        </h3>
        <div className="cosmic-card rounded-xl p-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  const awayTeam = teamAstro?.find(t => t.team_abbr === awayAbbr);
  const homeTeam = teamAstro?.find(t => t.team_abbr === homeAbbr);

  if (!awayTeam && !homeTeam) return null;

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5" />
        Team Astro DNA
      </h3>
      <div className="cosmic-card rounded-xl p-4">
        <div className="flex gap-4">
          {awayTeam && <TeamProfile team={awayTeam} abbr={awayAbbr} />}
          <div className="w-px bg-border/40" />
          {homeTeam && <TeamProfile team={homeTeam} abbr={homeAbbr} />}
        </div>
      </div>
    </section>
  );
}
