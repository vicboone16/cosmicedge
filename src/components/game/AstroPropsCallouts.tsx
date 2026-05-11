/**
 * #7 — Astro Props Callouts
 * Highlights player props that have astrological backing.
 * Cross-references planetary hours, team elements, and transit energy
 * to surface props with cosmic tailwinds.
 */
import { useQuery } from "@tanstack/react-query";
import { Sparkles, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getPlanetaryHourAt } from "@/lib/planetary-hours";

interface Props {
  gameId: string;
  startTime: string;
  homeAbbr: string;
  awayAbbr: string;
  league: string;
  venueLat: number | null;
}

/** Maps planetary energy to prop types that benefit */
const PLANET_PROP_BOOSTS: Record<string, { over: string[]; under: string[]; note: string }> = {
  Mars: {
    over: ["player_points", "player_steals", "player_blocks", "player_rebounds"],
    under: ["player_turnovers"],
    note: "Mars hour: aggressive energy boosts physical play — points/steals/blocks over",
  },
  Venus: {
    over: ["player_assists", "player_three_pointers_made"],
    under: ["player_turnovers", "player_fouls"],
    note: "Venus hour: finesse energy — assists over, shooting accuracy up",
  },
  Mercury: {
    over: ["player_assists", "player_steals"],
    under: [],
    note: "Mercury hour: quick reads and ball movement — assists/steals over",
  },
  Jupiter: {
    over: ["player_points", "player_pra", "player_rebounds"],
    under: [],
    note: "Jupiter hour: expansion energy — high scoring, big stat lines",
  },
  Saturn: {
    over: ["player_blocks", "player_rebounds"],
    under: ["player_points", "player_three_pointers_made"],
    note: "Saturn hour: restriction — defensive props over, scoring props under",
  },
  Sun: {
    over: ["player_points", "player_pra"],
    under: [],
    note: "Sun hour: star power — primary scorers shine, points props over",
  },
  Moon: {
    over: ["player_rebounds", "player_assists"],
    under: [],
    note: "Moon hour: emotional energy, crowd influence — hustle stats up",
  },
};

/** Element-based prop tendencies */
const ELEMENT_PROP_TENDENCIES: Record<string, { markets: string[]; direction: "over" | "under"; note: string }> = {
  Fire: { markets: ["player_points", "player_pra"], direction: "over", note: "Fire teams drive pace — scoring props trend over" },
  Earth: { markets: ["player_rebounds", "player_blocks"], direction: "over", note: "Earth teams grind — rebounding and defensive props trend over" },
  Air: { markets: ["player_assists", "player_three_pointers_made"], direction: "over", note: "Air teams move the ball — assists and 3PT props trend over" },
  Water: { markets: ["player_assists", "player_steals"], direction: "over", note: "Water teams flow — playmaking and opportunistic steals trend over" },
};

const MARKET_LABELS: Record<string, string> = {
  player_points: "Points",
  player_assists: "Assists",
  player_rebounds: "Rebounds",
  player_steals: "Steals",
  player_blocks: "Blocks",
  player_turnovers: "Turnovers",
  player_three_pointers_made: "3-Pointers",
  player_pra: "Pts+Reb+Ast",
  player_fouls: "Fouls",
  player_pr: "Pts+Reb",
  player_pa: "Pts+Ast",
  player_hits: "Hits",
  player_total_bases: "Total Bases",
  player_strikeouts: "Strikeouts",
  player_home_runs: "Home Runs",
};

interface AstroCallout {
  market: string;
  direction: "over" | "under";
  reasons: string[];
  strength: number; // 1-3
}

export function AstroPropsCallouts({ gameId, startTime, homeAbbr, awayAbbr, league, venueLat }: Props) {
  const { data: teamAstro } = useQuery({
    queryKey: ["astro-props-teams", homeAbbr, awayAbbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_astro")
        .select("team_abbr, element, ruling_planet")
        .in("team_abbr", [homeAbbr, awayAbbr]);
      return data || [];
    },
    staleTime: 60 * 60 * 1000,
  });

  // Compute callouts
  const callouts: AstroCallout[] = [];
  const marketScores: Record<string, { over: number; under: number; reasons: string[] }> = {};

  const addScore = (market: string, direction: "over" | "under", score: number, reason: string) => {
    if (!marketScores[market]) marketScores[market] = { over: 0, under: 0, reasons: [] };
    marketScores[market][direction] += score;
    marketScores[market].reasons.push(reason);
  };

  // 1. Planetary hour influence
  const planetaryHour = getPlanetaryHourAt(startTime, venueLat || 40.7);
  const hourPlanet = typeof planetaryHour === "string"
    ? planetaryHour
    : (planetaryHour as any)?.planet || "";

  if (hourPlanet && PLANET_PROP_BOOSTS[hourPlanet]) {
    const boosts = PLANET_PROP_BOOSTS[hourPlanet];
    for (const m of boosts.over) addScore(m, "over", 2, boosts.note);
    for (const m of boosts.under) addScore(m, "under", 1, boosts.note);
  }

  // 2. Team element tendencies
  const homeEl = teamAstro?.find(t => t.team_abbr === homeAbbr)?.element;
  const awayEl = teamAstro?.find(t => t.team_abbr === awayAbbr)?.element;

  for (const el of [homeEl, awayEl].filter(Boolean)) {
    const tend = ELEMENT_PROP_TENDENCIES[el!];
    if (tend) {
      for (const m of tend.markets) addScore(m, tend.direction, 1, tend.note);
    }
  }

  // 3. Opposing element boost (Fire vs Earth → more scoring AND more boards)
  if ((homeEl === "Fire" && awayEl === "Earth") || (awayEl === "Fire" && homeEl === "Earth")) {
    addScore("player_rebounds", "over", 1, "Fire vs Earth clash — expect extra boards");
    addScore("player_points", "over", 1, "Fire vs Earth tempo battle — scoring up");
  }

  // Build sorted callouts
  for (const [market, scores] of Object.entries(marketScores)) {
    const dir = scores.over >= scores.under ? "over" : "under";
    const strength = Math.max(scores.over, scores.under);
    if (strength >= 2) {
      callouts.push({
        market,
        direction: dir as "over" | "under",
        reasons: scores.reasons,
        strength: Math.min(3, strength),
      });
    }
  }

  callouts.sort((a, b) => b.strength - a.strength);
  const topCallouts = callouts.slice(0, 6);

  if (topCallouts.length === 0) return null;

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5" />
        Astro-Backed Props
      </h3>
      <div className="cosmic-card rounded-xl p-4 space-y-3">
        <p className="text-[9px] text-muted-foreground">
          Props with multiple cosmic signals pointing the same direction:
        </p>

        <div className="space-y-2">
          {topCallouts.map((c, i) => (
            <div key={c.market} className="flex items-start gap-3 py-2 border-b border-border/20 last:border-0">
              <div className={cn(
                "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                c.direction === "over" ? "bg-cosmic-green/10" : "bg-cosmic-red/10",
              )}>
                {c.direction === "over"
                  ? <TrendingUp className="h-4 w-4 text-cosmic-green" />
                  : <TrendingDown className="h-4 w-4 text-cosmic-red" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[10px] font-bold text-foreground">
                    {MARKET_LABELS[c.market] || c.market} {c.direction.toUpperCase()}
                  </p>
                  <div className="flex gap-0.5">
                    {Array.from({ length: c.strength }).map((_, j) => (
                      <span key={j} className="text-[8px] text-cosmic-gold">★</span>
                    ))}
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground leading-relaxed">
                  {c.reasons.slice(0, 2).join(" · ")}
                </p>
              </div>
            </div>
          ))}
        </div>

        {hourPlanet && (
          <div className="bg-primary/5 rounded-lg px-3 py-2">
            <p className="text-[9px] text-primary italic">
              🕐 Tip-off during {hourPlanet} hour — {PLANET_PROP_BOOSTS[hourPlanet]?.note || "monitor props aligned with this planetary energy"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
