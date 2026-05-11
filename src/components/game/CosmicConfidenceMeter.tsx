/**
 * #6 — Cosmic Confidence Meter
 * Visual gauge combining Oracle edge + cosmic alignment signals.
 * Shows a composite confidence score and breakdown.
 */
import { useQuery } from "@tanstack/react-query";
import { Gauge, TrendingUp, TrendingDown, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getPlanetaryHourAt } from "@/lib/planetary-hours";
import {
  getTraditionalRuler,
  getEssentialDignity,
  ZODIAC_SIGNS,
} from "@/lib/horary-utils";

interface Props {
  gameId: string;
  startTime: string;
  homeAbbr: string;
  awayAbbr: string;
  league: string;
  venueLat: number | null;
}

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  S: { label: "S-TIER", color: "text-cosmic-gold", bg: "bg-cosmic-gold/15", emoji: "🔥" },
  A: { label: "A-TIER", color: "text-cosmic-green", bg: "bg-cosmic-green/15", emoji: "⚡" },
  B: { label: "B-TIER", color: "text-cosmic-cyan", bg: "bg-cosmic-cyan/15", emoji: "✦" },
  C: { label: "C-TIER", color: "text-muted-foreground", bg: "bg-secondary/40", emoji: "~" },
};

function getTier(score: number): string {
  if (score >= 80) return "S";
  if (score >= 60) return "A";
  if (score >= 40) return "B";
  return "C";
}

export function CosmicConfidenceMeter({ gameId, startTime, homeAbbr, awayAbbr, league, venueLat }: Props) {
  // Fetch Oracle prediction
  const { data: prediction, isLoading: predLoading } = useQuery({
    queryKey: ["confidence-prediction", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ce_game_predictions")
        .select("p_home_win, p_away_win, edge_home, edge_away, mu_total, mu_spread_home, blowout_risk")
        .eq("game_id", gameId)
        .order("run_ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 15 * 60 * 1000,
  });

  // Fetch team_astro
  const { data: teamAstro } = useQuery({
    queryKey: ["confidence-astro", homeAbbr, awayAbbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_astro")
        .select("team_abbr, element, ruling_planet, modality")
        .in("team_abbr", [homeAbbr, awayAbbr]);
      return data || [];
    },
    staleTime: 60 * 60 * 1000,
  });

  if (predLoading) {
    return (
      <div className="cosmic-card rounded-xl p-4 flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">Computing cosmic confidence…</span>
      </div>
    );
  }

  if (!prediction) return null;

  // Calculate Oracle component (0-100 based on edge strength)
  const maxEdge = Math.max(
    Math.abs(prediction.edge_home || 0),
    Math.abs(prediction.edge_away || 0),
  );
  const oracleScore = Math.min(100, maxEdge * 8); // scale edge to 0-100

  // Determine favored team from Oracle
  const oracleFavors = (prediction.p_home_win || 0) > (prediction.p_away_win || 0) ? "home" : "away";
  const favoredAbbr = oracleFavors === "home" ? homeAbbr : awayAbbr;
  const winProb = oracleFavors === "home" ? prediction.p_home_win : prediction.p_away_win;
  const edge = oracleFavors === "home" ? prediction.edge_home : prediction.edge_away;

  // Calculate cosmic alignment component
  let cosmicScore = 50; // neutral baseline
  const gameDate = new Date(startTime);

  // Horary alignment check
  const hour = gameDate.getHours();
  const signIndex = Math.floor((hour / 24) * 12);
  const ascSign = ZODIAC_SIGNS[signIndex % 12];
  const ascRuler = getTraditionalRuler(ascSign);
  const ascDignity = getEssentialDignity(ascRuler, ascSign);

  if (ascDignity === "Domicile" || ascDignity === "Exaltation") cosmicScore += 15;
  else if (ascDignity === "Detriment" || ascDignity === "Fall") cosmicScore -= 10;

  // Element alignment
  const homeAstro = teamAstro?.find(t => t.team_abbr === homeAbbr);
  const awayAstro = teamAstro?.find(t => t.team_abbr === awayAbbr);
  const favoredAstro = oracleFavors === "home" ? homeAstro : awayAstro;

  if (favoredAstro?.ruling_planet === ascRuler) cosmicScore += 20; // ruler alignment bonus
  if (favoredAstro?.modality === "Fixed" && ascDignity !== "Fall") cosmicScore += 5; // fixed grinder bonus

  // Planetary hour check
  const planetaryHour = getPlanetaryHourAt(startTime, venueLat || 40.7);
  if (planetaryHour && favoredAstro?.ruling_planet) {
    const hourPlanet = typeof planetaryHour === "string" ? planetaryHour : (planetaryHour as any).planet || "";
    if (hourPlanet.toLowerCase() === favoredAstro.ruling_planet.toLowerCase()) cosmicScore += 15;
  }

  cosmicScore = Math.max(0, Math.min(100, cosmicScore));

  // Combined score (weighted: 60% oracle, 40% cosmic)
  const combinedScore = Math.round(oracleScore * 0.6 + cosmicScore * 0.4);
  const tier = getTier(combinedScore);
  const cfg = TIER_CONFIG[tier];

  // Build signal breakdown
  const signals: { label: string; positive: boolean; detail: string }[] = [];

  if (winProb) {
    signals.push({
      label: "Oracle Win Prob",
      positive: (winProb || 0) > 0.55,
      detail: `${(winProb * 100).toFixed(1)}% for ${favoredAbbr}`,
    });
  }
  if (edge) {
    signals.push({
      label: "Edge vs Market",
      positive: Math.abs(edge) > 3,
      detail: `${edge > 0 ? "+" : ""}${edge.toFixed(1)}%`,
    });
  }
  signals.push({
    label: "Horary Dignity",
    positive: ascDignity === "Domicile" || ascDignity === "Exaltation",
    detail: `ASC ruler in ${ascDignity}`,
  });
  if (favoredAstro?.ruling_planet) {
    const rulerMatch = favoredAstro.ruling_planet === ascRuler;
    signals.push({
      label: "Ruler Alignment",
      positive: rulerMatch,
      detail: rulerMatch ? `${favoredAstro.ruling_planet} rules both team & chart` : `${favoredAstro.ruling_planet} ≠ ${ascRuler}`,
    });
  }

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Gauge className="h-3.5 w-3.5" />
        Cosmic Confidence
      </h3>
      <div className="cosmic-card rounded-xl p-4 space-y-3">
        {/* Main gauge */}
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2" className="text-border/30" />
              <circle
                cx="18" cy="18" r="15.5" fill="none"
                strokeWidth="2.5"
                strokeDasharray={`${combinedScore} ${100 - combinedScore}`}
                strokeLinecap="round"
                className={cfg.color}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn("text-sm font-bold", cfg.color)}>{combinedScore}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", cfg.bg, cfg.color)}>
                {cfg.emoji} {cfg.label}
              </span>
              <span className="text-[10px] font-bold text-foreground">{favoredAbbr}</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {combinedScore >= 80
                ? "Strong Oracle edge backed by strong cosmic alignment. High conviction."
                : combinedScore >= 60
                  ? "Solid edge with moderate cosmic support. Good value."
                  : combinedScore >= 40
                    ? "Modest edge, mixed cosmic signals. Proceed with caution."
                    : "Weak edge or conflicting cosmic signals. Consider passing."}
            </p>
          </div>
        </div>

        {/* Signal breakdown */}
        <div className="border-t border-border/30 pt-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Signal Breakdown</p>
          <div className="grid grid-cols-2 gap-1.5">
            {signals.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                {s.positive
                  ? <TrendingUp className="h-3 w-3 text-cosmic-green flex-shrink-0" />
                  : <TrendingDown className="h-3 w-3 text-cosmic-red flex-shrink-0" />}
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold text-foreground truncate">{s.label}</p>
                  <p className="text-[8px] text-muted-foreground truncate">{s.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Blowout risk */}
        {prediction.blowout_risk != null && prediction.blowout_risk > 0.3 && (
          <div className="bg-cosmic-gold/8 border border-cosmic-gold/20 rounded-lg px-3 py-2">
            <p className="text-[9px] text-cosmic-gold font-semibold">
              ⚠ Blowout Risk: {(prediction.blowout_risk * 100).toFixed(0)}% — Alt spreads may offer better value
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
