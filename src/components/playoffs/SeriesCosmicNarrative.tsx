/**
 * #9 — Series Cosmic Narrative
 * Per-series astrological breakdown cards showing element matchups,
 * planetary rulers, and cosmic advantage analysis.
 */
import { Sparkles, Flame, Droplets, Wind, Mountain } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PlayoffSeries } from "@/hooks/use-playoff-series";
import { cn } from "@/lib/utils";

interface Props {
  series: PlayoffSeries[];
  league: string;
}

interface TeamAstroInfo {
  element: string | null;
  ruling_planet: string | null;
  modality: string | null;
  mascot_sign: string | null;
}

const ELEMENT_ICON: Record<string, React.ReactNode> = {
  Fire: <Flame className="h-3.5 w-3.5 text-orange-400" />,
  Earth: <Mountain className="h-3.5 w-3.5 text-emerald-400" />,
  Air: <Wind className="h-3.5 w-3.5 text-violet-400" />,
  Water: <Droplets className="h-3.5 w-3.5 text-cyan-400" />,
};

const ELEMENT_COLOR: Record<string, string> = {
  Fire: "from-orange-500/15 to-orange-500/5 border-orange-500/25",
  Earth: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/25",
  Air: "from-violet-500/15 to-violet-500/5 border-violet-500/25",
  Water: "from-cyan-500/15 to-cyan-500/5 border-cyan-500/25",
};

const ELEMENT_MATCHUP: Record<string, Record<string, { label: string; advantage: string; desc: string }>> = {
  Fire: {
    Fire: { label: "Inferno Clash", advantage: "Even", desc: "Explosive matchup — expect high-scoring, fast-paced games with momentum swings." },
    Earth: { label: "Blaze vs Bedrock", advantage: "Fire early, Earth late", desc: "Fire takes early leads but Earth grinds back. Series goes long." },
    Air: { label: "Firestorm", advantage: "Fire", desc: "Air fuels Fire — both teams score freely. Overs dominate." },
    Water: { label: "Steam Pressure", advantage: "Volatile", desc: "Emotional intensity peaks. Ejections, fouls, and dramatic finishes." },
  },
  Earth: {
    Fire: { label: "Bedrock vs Blaze", advantage: "Earth late, Fire early", desc: "Earth absorbs Fire's runs and wins through attrition." },
    Earth: { label: "War of Attrition", advantage: "Even", desc: "Defensive slugfest — low totals, grind-it-out basketball." },
    Air: { label: "Foundation vs Flow", advantage: "Earth", desc: "Earth's defense disrupts Air's rhythm. Unders favored." },
    Water: { label: "Mudslide", advantage: "Home team", desc: "Home-court advantage amplified. Emotion meets discipline." },
  },
  Air: {
    Fire: { label: "Firestorm", advantage: "Fire", desc: "Air feeds Fire's aggression — high pace, high scores." },
    Earth: { label: "Flow vs Foundation", advantage: "Air in transition", desc: "Air needs pace to win. Half-court favors Earth." },
    Air: { label: "Chess Match", advantage: "Even", desc: "Tactical battle — coaching adjustments decide the series." },
    Water: { label: "Hurricane", advantage: "Streaky", desc: "Momentum swings wildly. Whichever team hits a run rides it." },
  },
  Water: {
    Fire: { label: "Steam Pressure", advantage: "Volatile", desc: "Passion collides — expect drama and controversy." },
    Earth: { label: "Mudslide", advantage: "Home team", desc: "Emotion amplifies home-court. Road teams struggle." },
    Air: { label: "Hurricane", advantage: "Streaky", desc: "Waves of momentum — series swings unpredictably." },
    Water: { label: "Tidal War", advantage: "Even", desc: "Deep emotional battle. Stars must carry — role players drown." },
  },
};

const PLANET_SYMBOLS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};

function NarrativeCard({ s, astroA, astroB }: { s: PlayoffSeries; astroA: TeamAstroInfo | null; astroB: TeamAstroInfo | null }) {
  const elA = astroA?.element || "Fire";
  const elB = astroB?.element || "Fire";
  const matchup = ELEMENT_MATCHUP[elA]?.[elB] || { label: "Cosmic Clash", advantage: "Even", desc: "The stars reveal a balanced matchup." };

  const rulerA = astroA?.ruling_planet;
  const rulerB = astroB?.ruling_planet;

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3 bg-gradient-to-br",
      ELEMENT_COLOR[elA] || "from-secondary/20 to-secondary/10 border-border/30",
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-cosmic-lavender" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Cosmic Narrative
          </span>
        </div>
        <span className="text-[10px] text-cosmic-gold font-semibold">{matchup.label}</span>
      </div>

      {/* Element matchup visual */}
      <div className="flex items-center justify-center gap-4">
        <div className="text-center">
          <div className="h-10 w-10 rounded-full bg-background/50 flex items-center justify-center mx-auto mb-1">
            {ELEMENT_ICON[elA] || <Sparkles className="h-4 w-4" />}
          </div>
          <p className="text-xs font-bold text-foreground">{s.teamA.abbr}</p>
          <p className="text-[9px] text-muted-foreground">{elA} · {astroA?.modality || "—"}</p>
          {rulerA && (
            <p className="text-[9px] text-cosmic-indigo">
              {PLANET_SYMBOLS[rulerA] || "★"} {rulerA}
            </p>
          )}
        </div>

        <div className="text-center px-3">
          <p className="text-lg font-bold text-muted-foreground/50">vs</p>
          <div className="flex gap-0.5 mt-1">
            {Array.from({ length: s.teamA.wins }).map((_, i) => (
              <div key={`a${i}`} className="h-1.5 w-3 rounded-full bg-primary" />
            ))}
            {Array.from({ length: s.teamB.wins }).map((_, i) => (
              <div key={`b${i}`} className="h-1.5 w-3 rounded-full bg-cosmic-red" />
            ))}
          </div>
        </div>

        <div className="text-center">
          <div className="h-10 w-10 rounded-full bg-background/50 flex items-center justify-center mx-auto mb-1">
            {ELEMENT_ICON[elB] || <Sparkles className="h-4 w-4" />}
          </div>
          <p className="text-xs font-bold text-foreground">{s.teamB.abbr}</p>
          <p className="text-[9px] text-muted-foreground">{elB} · {astroB?.modality || "—"}</p>
          {rulerB && (
            <p className="text-[9px] text-cosmic-indigo">
              {PLANET_SYMBOLS[rulerB] || "★"} {rulerB}
            </p>
          )}
        </div>
      </div>

      {/* Advantage + Description */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-cosmic-gold">Cosmic Edge:</span>
          <span className="text-[10px] text-foreground font-semibold">{matchup.advantage}</span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed italic">
          "{matchup.desc}"
        </p>
      </div>

      {/* Mascot signs if available */}
      {(astroA?.mascot_sign || astroB?.mascot_sign) && (
        <div className="flex items-center gap-3 pt-1 border-t border-border/20">
          {astroA?.mascot_sign && (
            <span className="text-[9px] text-muted-foreground">
              {s.teamA.abbr}: {astroA.mascot_sign}
            </span>
          )}
          {astroB?.mascot_sign && (
            <span className="text-[9px] text-muted-foreground">
              {s.teamB.abbr}: {astroB.mascot_sign}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function SeriesCosmicNarrative({ series, league }: Props) {
  // Get all team abbreviations
  const allAbbrs = [...new Set(series.flatMap((s) => [s.teamA.abbr, s.teamB.abbr]))];

  const { data: astroData } = useQuery({
    queryKey: ["playoff-team-astro", league, allAbbrs.sort().join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_astro")
        .select("team_abbr, element, ruling_planet, modality, mascot_sign")
        .in("team_abbr", allAbbrs);
      const map = new Map<string, TeamAstroInfo>();
      for (const d of data || []) {
        map.set(d.team_abbr, d);
      }
      return map;
    },
    enabled: allAbbrs.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  // Only show for active (non-complete) series
  const activeSeries = series.filter((s) => !s.isComplete);
  if (!activeSeries.length || !astroData) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-cosmic-lavender" />
        Series Cosmic Narratives
      </h2>

      <div className="space-y-3">
        {activeSeries.map((s) => (
          <NarrativeCard
            key={s.key}
            s={s}
            astroA={astroData.get(s.teamA.abbr) || null}
            astroB={astroData.get(s.teamB.abbr) || null}
          />
        ))}
      </div>
    </section>
  );
}
