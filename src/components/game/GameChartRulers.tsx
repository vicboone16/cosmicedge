/**
 * Game Chart Rulers — Deep-dive into planetary rulers and their relationships.
 * 
 * Differentiated from HoraryChartSection:
 * - Horary = chart overview (houses, signs, API-enhanced analysis, verdict)
 * - Chart Rulers = ruler dignity table, mutual reception, planetary aspects,
 *   betting angle implications per planet
 */
import { Shield, Swords, ArrowRightLeft, TrendingUp, TrendingDown } from "lucide-react";
import {
  getTraditionalRuler,
  getEssentialDignity,
  getDignityColor,
  getOppositeSign,
  getSignAtHouse,
  ZODIAC_SIGNS,
} from "@/lib/horary-utils";
import { cn } from "@/lib/utils";

interface Props {
  startTime: string;
  homeAbbr: string;
  awayAbbr: string;
  homeML: number;
  awayML: number;
  venueLat: number | null;
}

const ZODIAC_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

const PLANET_TRAITS: Record<string, { nature: string; betting: string }> = {
  Mars: { nature: "Aggression, pace, physicality", betting: "High pace, fouls, overs when dominant" },
  Venus: { nature: "Finesse, flow, team chemistry", betting: "Smooth scoring, under when strong, role player props" },
  Mercury: { nature: "Speed, transitions, playmaking", betting: "Assist props, fast breaks, turnover risk" },
  Moon: { nature: "Emotion, crowd energy, rhythm", betting: "Momentum swings, home-court edge, second-half runs" },
  Sun: { nature: "Star power, leadership, dominance", betting: "Star player props, points leader, clutch performance" },
  Jupiter: { nature: "Expansion, scoring, confidence", betting: "Overs, high totals, blowout potential" },
  Saturn: { nature: "Restriction, defense, discipline", betting: "Unders, defensive battles, grind-it-out games" },
};

const DIGNITY_RANKS: Record<string, number> = {
  Domicile: 5,
  Exaltation: 4,
  Peregrine: 2,
  Detriment: 1,
  Fall: 0,
};

/** Checks if two rulers are in mutual reception (each in the other's sign of rulership) */
function checkMutualReception(
  rulerA: string, signA: string,
  rulerB: string, signB: string,
): boolean {
  const rulerOfSignA = getTraditionalRuler(signA);
  const rulerOfSignB = getTraditionalRuler(signB);
  return rulerA === rulerOfSignB && rulerB === rulerOfSignA;
}

export function GameChartRulers({ startTime, homeAbbr, awayAbbr, homeML, awayML, venueLat }: Props) {
  const gameDate = new Date(startTime);

  // Compute chart angles (same base calc as Horary, for ruler analysis)
  const hour = gameDate.getHours();
  const signIndex = Math.floor((hour / 24) * 12);
  const ascSign = ZODIAC_SIGNS[signIndex % 12];
  const descSign = getOppositeSign(ascSign);
  const icSign = getSignAtHouse(ascSign, 3);
  const mcSign = getSignAtHouse(ascSign, 9);

  // Additional houses for deeper analysis
  const h2Sign = getSignAtHouse(ascSign, 1); // 2nd house - resources
  const h5Sign = getSignAtHouse(ascSign, 4); // 5th house - luck/gambling
  const h8Sign = getSignAtHouse(ascSign, 7); // 8th house - opponent resources
  const h11Sign = getSignAtHouse(ascSign, 10); // 11th house - hopes/wishes

  // All relevant rulers
  const rulers = [
    { house: "1st (Home)", sign: ascSign, team: homeAbbr, role: "Home strength" },
    { house: "7th (Away)", sign: descSign, team: awayAbbr, role: "Away strength" },
    { house: "10th (MC)", sign: mcSign, team: null, role: "Outcome / Prize" },
    { house: "4th (IC)", sign: icSign, team: null, role: "End of matter" },
    { house: "5th", sign: h5Sign, team: null, role: "Luck / Speculation" },
    { house: "2nd", sign: h2Sign, team: homeAbbr, role: "Home resources" },
    { house: "8th", sign: h8Sign, team: awayAbbr, role: "Away resources" },
    { house: "11th", sign: h11Sign, team: null, role: "Hopes / Wishes" },
  ].map((h) => {
    const ruler = getTraditionalRuler(h.sign);
    const dignity = getEssentialDignity(ruler, h.sign);
    return { ...h, ruler, dignity };
  });

  const homeLord = rulers[0];
  const awayLord = rulers[1];

  // Determine favorite/underdog
  const homeFavorite = homeML < 0 || (homeML > 0 && awayML > 0 && homeML < awayML);
  const favoriteAbbr = homeFavorite ? homeAbbr : awayAbbr;
  const underdogAbbr = homeFavorite ? awayAbbr : homeAbbr;

  // Mutual reception check
  const hasMutualReception = checkMutualReception(
    homeLord.ruler, homeLord.sign,
    awayLord.ruler, awayLord.sign,
  );

  // Compare ruler strengths
  const homeRank = DIGNITY_RANKS[homeLord.dignity] ?? 2;
  const awayRank = DIGNITY_RANKS[awayLord.dignity] ?? 2;

  // MC ruler analysis — which team controls the outcome
  const mcRuler = rulers[2];
  const mcFavorsHome = mcRuler.ruler === homeLord.ruler;
  const mcFavorsAway = mcRuler.ruler === awayLord.ruler;

  // 5th house (luck/gambling) ruler
  const h5Ruler = rulers[4];

  // Betting implications
  const bettingAngles: { label: string; insight: string; icon: React.ReactNode }[] = [];

  if (homeRank > awayRank) {
    bettingAngles.push({
      label: `${homeAbbr} Ruler Stronger`,
      insight: `${homeLord.ruler} in ${homeLord.dignity} vs ${awayLord.ruler} in ${awayLord.dignity} — ${homeAbbr} has planetary backing`,
      icon: <TrendingUp className="h-3 w-3 text-cosmic-green" />,
    });
  } else if (awayRank > homeRank) {
    bettingAngles.push({
      label: `${awayAbbr} Ruler Stronger`,
      insight: `${awayLord.ruler} in ${awayLord.dignity} vs ${homeLord.ruler} in ${homeLord.dignity} — ${awayAbbr} has planetary backing`,
      icon: <TrendingUp className="h-3 w-3 text-cosmic-green" />,
    });
  }

  if (mcFavorsHome) {
    bettingAngles.push({
      label: "MC Favors Home",
      insight: `MC ruler (${mcRuler.ruler}) matches home lord — outcome energy flows to ${homeAbbr}`,
      icon: <TrendingUp className="h-3 w-3 text-primary" />,
    });
  } else if (mcFavorsAway) {
    bettingAngles.push({
      label: "MC Favors Away",
      insight: `MC ruler (${mcRuler.ruler}) matches away lord — outcome energy flows to ${awayAbbr}`,
      icon: <TrendingUp className="h-3 w-3 text-primary" />,
    });
  }

  const homeTraits = PLANET_TRAITS[homeLord.ruler];
  const awayTraits = PLANET_TRAITS[awayLord.ruler];
  if (homeTraits) {
    bettingAngles.push({
      label: `${homeLord.ruler} Betting Edge`,
      insight: homeTraits.betting,
      icon: <Swords className="h-3 w-3 text-cosmic-gold" />,
    });
  }
  if (awayTraits && awayLord.ruler !== homeLord.ruler) {
    bettingAngles.push({
      label: `${awayLord.ruler} Betting Edge`,
      insight: awayTraits.betting,
      icon: <Swords className="h-3 w-3 text-cosmic-gold" />,
    });
  }

  // 5th house insight for speculative bets
  const h5Traits = PLANET_TRAITS[h5Ruler.ruler];
  if (h5Traits) {
    bettingAngles.push({
      label: "5th House (Luck/Props)",
      insight: `${h5Ruler.ruler} rules speculation today — ${h5Traits.betting}`,
      icon: <TrendingUp className="h-3 w-3 text-cosmic-lavender" />,
    });
  }

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Shield className="h-3.5 w-3.5" />
        Chart Rulers — Planetary Breakdown
      </h3>
      <div className="cosmic-card rounded-xl p-4 space-y-4">
        {/* Ruler Dignity Table */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Ruler Dignities by House
          </p>
          <div className="space-y-1.5">
            {rulers.map((r) => (
              <div key={r.house} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{ZODIAC_SYMBOLS[r.sign]}</span>
                  <div>
                    <p className="text-[10px] font-semibold text-foreground">
                      {r.house} <span className="text-muted-foreground">{r.sign}</span>
                    </p>
                    <p className="text-[8px] text-muted-foreground">
                      {r.team ? `${r.team} — ` : ""}{r.role}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold text-foreground">{r.ruler}</p>
                  <p className={cn("text-[9px] font-medium", getDignityColor(r.dignity))}>
                    {r.dignity}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mutual Reception */}
        {hasMutualReception && (
          <div className="flex items-center gap-2 bg-cosmic-gold/10 border border-cosmic-gold/20 rounded-lg px-3 py-2">
            <ArrowRightLeft className="h-3.5 w-3.5 text-cosmic-gold" />
            <div>
              <p className="text-[10px] font-semibold text-cosmic-gold">Mutual Reception Detected</p>
              <p className="text-[9px] text-muted-foreground">
                {homeLord.ruler} ↔ {awayLord.ruler} — both lords assist each other. Expect a competitive, closely-contested game. Spreads tighten.
              </p>
            </div>
          </div>
        )}

        {/* Planetary Nature + Betting Angles */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Betting Angles from Rulers
          </p>
          <div className="space-y-2">
            {bettingAngles.map((angle, i) => (
              <div key={i} className="flex items-start gap-2 py-1.5">
                <div className="mt-0.5 flex-shrink-0">{angle.icon}</div>
                <div>
                  <p className="text-[10px] font-semibold text-foreground">{angle.label}</p>
                  <p className="text-[9px] text-muted-foreground leading-relaxed">{angle.insight}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Favorite/Underdog Alert */}
        {!homeFavorite && (
          <div className="bg-primary/5 border border-primary/15 rounded-lg px-3 py-2">
            <p className="text-[9px] text-primary italic">
              ⚠ Role reversal: Favorite ({favoriteAbbr}) is away — mapped to 7th house. Underdog ({underdogAbbr}) holds the 1st house advantage.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
