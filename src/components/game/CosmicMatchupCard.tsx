/**
 * #4 — Cosmic Matchup Card
 * Deep element-vs-element visual with team astro profiles.
 * Enhances the existing Zodiac Matchup with team_astro data.
 */
import { useQuery } from "@tanstack/react-query";
import { Flame, Droplets, Wind, Mountain, Swords, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  homeAbbr: string;
  awayAbbr: string;
  league: string;
}

const ELEMENT_CONFIG: Record<string, { icon: React.ReactNode; color: string; gradient: string; label: string }> = {
  Fire:  { icon: <Flame className="h-5 w-5" />, color: "text-orange-400", gradient: "from-orange-500/20 to-red-500/10", label: "Fire" },
  Earth: { icon: <Mountain className="h-5 w-5" />, color: "text-emerald-400", gradient: "from-emerald-500/20 to-green-500/10", label: "Earth" },
  Air:   { icon: <Wind className="h-5 w-5" />, color: "text-sky-400", gradient: "from-sky-500/20 to-blue-500/10", label: "Air" },
  Water: { icon: <Droplets className="h-5 w-5" />, color: "text-blue-400", gradient: "from-blue-500/20 to-indigo-500/10", label: "Water" },
};

const PLANET_SYMBOLS: Record<string, string> = {
  Mars: "♂", Venus: "♀", Mercury: "☿", Moon: "☽", Sun: "☉",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};

const MATCHUP_TYPES: Record<string, { name: string; betting: string }> = {
  "Fire-Fire": { name: "Inferno", betting: "High pace, overs, star player props over" },
  "Fire-Earth": { name: "Forge", betting: "Pace mismatch — Fire pushes tempo, Earth grinds. Watch spread" },
  "Fire-Air": { name: "Wildfire", betting: "Explosive scoring, high totals, transition points" },
  "Fire-Water": { name: "Steam Engine", betting: "Emotional intensity, momentum swings, live betting edges" },
  "Earth-Earth": { name: "Siege", betting: "Low scoring, unders, defensive player props" },
  "Earth-Air": { name: "Erosion", betting: "Air's movement vs Earth's wall — turnovers prop edges" },
  "Earth-Water": { name: "Mudslide", betting: "Grinding, physical — unders, rebounding props over" },
  "Air-Air": { name: "Hurricane", betting: "Quick possessions, 3-point shooting, assist props" },
  "Air-Water": { name: "Tsunami", betting: "Flow offense — high assists, unpredictable totals" },
  "Water-Water": { name: "Deep Current", betting: "Rhythm game, second-half surge, 4Q momentum bets" },
};

function getMatchupType(el1: string, el2: string): { name: string; betting: string } {
  const key = [el1, el2].sort().join("-");
  return MATCHUP_TYPES[key] || { name: "Unknown", betting: "Insufficient data" };
}

function getElementAdvantage(away: string, home: string): { team: "home" | "away" | "neutral"; reason: string } {
  const matrix: Record<string, string> = {
    "Fire-Earth": "Fire overwhelms Earth's structure",
    "Fire-Water": "Water dampens Fire's momentum",
    "Earth-Air": "Earth grounds Air's movement",
    "Air-Water": "Air disrupts Water's flow",
    "Fire-Air": "neutral",
    "Earth-Water": "neutral",
  };
  const key = [away, home].sort().join("-");
  const result = matrix[key];
  if (!result || result === "neutral") return { team: "neutral", reason: "Even elemental matchup — no clear cosmic edge" };
  
  // Determine which team benefits
  if (away === "Fire" && home === "Earth") return { team: "away", reason: `${away} overwhelms ${home}'s structure` };
  if (away === "Earth" && home === "Fire") return { team: "home", reason: `Fire overwhelms Earth's structure` };
  if (away === "Fire" && home === "Water") return { team: "home", reason: `Water dampens Fire's momentum` };
  if (away === "Water" && home === "Fire") return { team: "away", reason: `Water dampens Fire's momentum` };
  if (away === "Earth" && home === "Air") return { team: "away", reason: `Earth grounds Air's movement` };
  if (away === "Air" && home === "Earth") return { team: "home", reason: `Earth grounds Air's movement` };
  if (away === "Air" && home === "Water") return { team: "away", reason: `Air disrupts Water's flow` };
  if (away === "Water" && home === "Air") return { team: "home", reason: `Air disrupts Water's flow` };
  return { team: "neutral", reason: "Even elemental matchup" };
}

export function CosmicMatchupCard({ homeAbbr, awayAbbr, league }: Props) {
  const { data: teamAstro, isLoading } = useQuery({
    queryKey: ["team-astro-matchup", homeAbbr, awayAbbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_astro")
        .select("team_abbr, element, ruling_planet, modality, mascot_sign, city_ruler, founded_date, founded_city")
        .in("team_abbr", [homeAbbr, awayAbbr]);
      return data || [];
    },
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Swords className="h-3.5 w-3.5" />
          Cosmic Matchup
        </h3>
        <div className="cosmic-card rounded-xl p-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  const awayTeam = teamAstro?.find(t => t.team_abbr === awayAbbr);
  const homeTeam = teamAstro?.find(t => t.team_abbr === homeAbbr);

  if (!awayTeam || !homeTeam) return null;

  const awayEl = awayTeam.element || "Fire";
  const homeEl = homeTeam.element || "Fire";
  const awayCfg = ELEMENT_CONFIG[awayEl] || ELEMENT_CONFIG.Fire;
  const homeCfg = ELEMENT_CONFIG[homeEl] || ELEMENT_CONFIG.Fire;
  const matchup = getMatchupType(awayEl, homeEl);
  const advantage = getElementAdvantage(awayEl, homeEl);

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Swords className="h-3.5 w-3.5" />
        Cosmic Matchup
      </h3>
      <div className="cosmic-card rounded-xl overflow-hidden">
        {/* Element vs Element Header */}
        <div className="flex">
          <div className={cn("flex-1 p-4 bg-gradient-to-br", awayCfg.gradient)}>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{awayAbbr}</p>
            <div className={cn("mb-1", awayCfg.color)}>{awayCfg.icon}</div>
            <p className={cn("text-sm font-bold", awayCfg.color)}>{awayEl}</p>
            <p className="text-[9px] text-muted-foreground">{awayTeam.modality || "—"}</p>
          </div>
          <div className="flex items-center px-3 bg-background/50">
            <div className="text-center">
              <p className="text-[8px] text-muted-foreground uppercase tracking-wider">vs</p>
              <p className="text-xs font-bold text-foreground mt-1">{matchup.name}</p>
            </div>
          </div>
          <div className={cn("flex-1 p-4 bg-gradient-to-bl text-right", homeCfg.gradient)}>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{homeAbbr}</p>
            <div className={cn("mb-1 flex justify-end", homeCfg.color)}>{homeCfg.icon}</div>
            <p className={cn("text-sm font-bold", homeCfg.color)}>{homeEl}</p>
            <p className="text-[9px] text-muted-foreground">{homeTeam.modality || "—"}</p>
          </div>
        </div>

        {/* Planetary Rulers */}
        <div className="px-4 py-3 border-t border-border/30">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <span className="text-lg">{PLANET_SYMBOLS[awayTeam.ruling_planet || ""] || "?"}</span>
              <div>
                <p className="text-[10px] font-semibold text-foreground">{awayTeam.ruling_planet || "Unknown"}</p>
                <p className="text-[8px] text-muted-foreground">{awayAbbr} ruler</p>
              </div>
            </div>
            <div className="text-center">
              {awayTeam.mascot_sign && homeTeam.mascot_sign && (
                <p className="text-[8px] text-muted-foreground">
                  {awayTeam.mascot_sign} vs {homeTeam.mascot_sign}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="text-right">
                <p className="text-[10px] font-semibold text-foreground">{homeTeam.ruling_planet || "Unknown"}</p>
                <p className="text-[8px] text-muted-foreground">{homeAbbr} ruler</p>
              </div>
              <span className="text-lg">{PLANET_SYMBOLS[homeTeam.ruling_planet || ""] || "?"}</span>
            </div>
          </div>
        </div>

        {/* Betting Implications */}
        <div className="px-4 py-3 border-t border-border/30 space-y-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Betting Implications</p>
          <p className="text-[10px] text-foreground leading-relaxed">💰 {matchup.betting}</p>
          <div className={cn(
            "rounded-lg px-3 py-2",
            advantage.team === "home" ? "bg-cosmic-green/8" :
            advantage.team === "away" ? "bg-primary/8" :
            "bg-secondary/30",
          )}>
            <p className={cn(
              "text-[10px] font-semibold",
              advantage.team === "home" ? "text-cosmic-green" :
              advantage.team === "away" ? "text-primary" :
              "text-muted-foreground",
            )}>
              {advantage.team === "neutral" ? "⚖️ Neutral" : `✦ ${advantage.team === "home" ? homeAbbr : awayAbbr} Element Edge`}
            </p>
            <p className="text-[9px] text-muted-foreground">{advantage.reason}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
