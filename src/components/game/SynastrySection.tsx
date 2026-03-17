import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Player {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  birth_date: string | null;
}

interface SynastrySectionProps {
  awayPlayers: Player[];
  homePlayers: Player[];
  awayAbbr: string;
  homeAbbr: string;
}

// ── Zodiac sign from date ──
const ZODIAC_SIGNS = [
  { sign: "Capricorn", m1: 1, d1: 1, m2: 1, d2: 19 },
  { sign: "Aquarius", m1: 1, d1: 20, m2: 2, d2: 18 },
  { sign: "Pisces", m1: 2, d1: 19, m2: 3, d2: 20 },
  { sign: "Aries", m1: 3, d1: 21, m2: 4, d2: 19 },
  { sign: "Taurus", m1: 4, d1: 20, m2: 5, d2: 20 },
  { sign: "Gemini", m1: 5, d1: 21, m2: 6, d2: 20 },
  { sign: "Cancer", m1: 6, d1: 21, m2: 7, d2: 22 },
  { sign: "Leo", m1: 7, d1: 23, m2: 8, d2: 22 },
  { sign: "Virgo", m1: 8, d1: 23, m2: 9, d2: 22 },
  { sign: "Libra", m1: 9, d1: 23, m2: 10, d2: 22 },
  { sign: "Scorpio", m1: 10, d1: 23, m2: 11, d2: 21 },
  { sign: "Sagittarius", m1: 11, d1: 22, m2: 12, d2: 21 },
  { sign: "Capricorn", m1: 12, d1: 22, m2: 12, d2: 31 },
];

const SIGN_INDEX: Record<string, number> = {
  Aries: 0, Taurus: 1, Gemini: 2, Cancer: 3, Leo: 4, Virgo: 5,
  Libra: 6, Scorpio: 7, Sagittarius: 8, Capricorn: 9, Aquarius: 10, Pisces: 11,
};

const SIGN_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

function getSign(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  for (const s of ZODIAC_SIGNS) {
    if ((month === s.m1 && day >= s.d1) || (month === s.m2 && day <= s.d2)) return s.sign;
  }
  return "Capricorn";
}

// ── Aspect calculation based on sun sign distance ──
type AspectType = "conjunction" | "sextile" | "square" | "trine" | "opposition" | "quincunx" | "semisextile";

interface SynastryAspect {
  type: AspectType;
  symbol: string;
  label: string;
  nature: "harmonious" | "challenging" | "neutral";
  description: string;
  color: string;
}

const ASPECT_MAP: Record<number, SynastryAspect> = {
  0: { type: "conjunction", symbol: "☌", label: "Conjunction", nature: "neutral", description: "Intense fusion — amplifies both players' energy for better or worse", color: "text-cosmic-gold" },
  1: { type: "semisextile", symbol: "⚺", label: "Semi-sextile", nature: "neutral", description: "Subtle friction — different wavelengths create minor adjustments", color: "text-muted-foreground" },
  2: { type: "sextile", symbol: "⚹", label: "Sextile", nature: "harmonious", description: "Flowing cooperation — natural chemistry and complementary skills", color: "text-cosmic-green" },
  3: { type: "square", symbol: "□", label: "Square", nature: "challenging", description: "Dynamic tension — drives competition, fouls, and aggressive play", color: "text-cosmic-red" },
  4: { type: "trine", symbol: "△", label: "Trine", nature: "harmonious", description: "Easy harmony — intuitive connection, beautiful team play", color: "text-cosmic-cyan" },
  5: { type: "quincunx", symbol: "⚻", label: "Quincunx", nature: "challenging", description: "Awkward mismatch — timing issues and miscommunication", color: "text-cosmic-lavender" },
  6: { type: "opposition", symbol: "☍", label: "Opposition", nature: "challenging", description: "Direct rivalry — polarizing energy, head-to-head battles", color: "text-destructive" },
};

function getAspect(sign1: string, sign2: string): SynastryAspect {
  const i1 = SIGN_INDEX[sign1] ?? 0;
  const i2 = SIGN_INDEX[sign2] ?? 0;
  const dist = Math.abs(i1 - i2);
  const normalized = dist > 6 ? 12 - dist : dist;
  return ASPECT_MAP[normalized] || ASPECT_MAP[1];
}

interface MatchupPair {
  away: Player & { sign: string };
  home: Player & { sign: string };
  aspect: SynastryAspect;
}

export function SynastrySection({ awayPlayers, homePlayers, awayAbbr, homeAbbr }: SynastrySectionProps) {
  const [viewMode, setViewMode] = useState<"matchup" | "away_team" | "home_team">("matchup");

  const matchups = useMemo(() => {
    const positionOrder = ["PG", "SG", "SF", "PF", "C", "G", "F"];
    const sortByPos = (a: Player, b: Player) => {
      const ia = positionOrder.indexOf(a.position || "");
      const ib = positionOrder.indexOf(b.position || "");
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    };

    const awayWithSign = awayPlayers
      .filter(p => p.birth_date)
      .sort(sortByPos)
      .slice(0, 5)
      .map(p => ({ ...p, sign: getSign(p.birth_date!) }));

    const homeWithSign = homePlayers
      .filter(p => p.birth_date)
      .sort(sortByPos)
      .slice(0, 5)
      .map(p => ({ ...p, sign: getSign(p.birth_date!) }));

    const pairs: MatchupPair[] = [];
    const maxPairs = Math.min(awayWithSign.length, homeWithSign.length, 5);
    for (let i = 0; i < maxPairs; i++) {
      pairs.push({
        away: awayWithSign[i],
        home: homeWithSign[i],
        aspect: getAspect(awayWithSign[i].sign, homeWithSign[i].sign),
      });
    }
    return pairs;
  }, [awayPlayers, homePlayers]);

  // Teammate synastry — how players on the same team work together
  const teamSynastry = useMemo(() => {
    const computeTeam = (teamPlayers: Player[]) => {
      const withSign = teamPlayers
        .filter(p => p.birth_date)
        .slice(0, 5)
        .map(p => ({ ...p, sign: getSign(p.birth_date!) }));
      const pairs: MatchupPair[] = [];
      for (let i = 0; i < withSign.length; i++) {
        for (let j = i + 1; j < withSign.length; j++) {
          pairs.push({
            away: withSign[i],
            home: withSign[j],
            aspect: getAspect(withSign[i].sign, withSign[j].sign),
          });
        }
      }
      return pairs.sort((a, b) => {
        const order = { harmonious: 0, neutral: 1, challenging: 2 };
        return order[a.aspect.nature] - order[b.aspect.nature];
      }).slice(0, 5);
    };
    return { away: computeTeam(awayPlayers), home: computeTeam(homePlayers) };
  }, [awayPlayers, homePlayers]);

  if (matchups.length === 0) return null;

  const activePairs = viewMode === "matchup" ? matchups
    : viewMode === "away_team" ? teamSynastry.away
    : teamSynastry.home;

  const harmonious = activePairs.filter(m => m.aspect.nature === "harmonious").length;
  const challenging = activePairs.filter(m => m.aspect.nature === "challenging").length;

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5" />
        Synastry
      </h3>

      {/* View mode toggle */}
      <div className="flex gap-1 mb-3 overflow-x-auto no-scrollbar">
        {([
          { val: "matchup" as const, label: "Matchups" },
          { val: "away_team" as const, label: `${awayAbbr} Chemistry` },
          { val: "home_team" as const, label: `${homeAbbr} Chemistry` },
        ]).map(t => (
          <button
            key={t.val}
            onClick={() => setViewMode(t.val)}
            className={cn(
              "text-[10px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors",
              viewMode === t.val
                ? "bg-primary/15 text-primary"
                : "bg-secondary/50 text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      <div className="celestial-gradient rounded-xl p-3 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">
              {viewMode === "matchup" ? "Aspect Breakdown" : "Team Chemistry"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-cosmic-green font-semibold">△ {harmonious} harmonious</span>
            <span className="text-cosmic-red font-semibold">□ {challenging} challenging</span>
          </div>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden mt-2 flex">
          <div
            className="h-full bg-cosmic-green rounded-l-full transition-all"
            style={{ width: `${activePairs.length > 0 ? (harmonious / activePairs.length) * 100 : 0}%` }}
          />
          <div
            className="h-full bg-cosmic-red rounded-r-full transition-all"
            style={{ width: `${activePairs.length > 0 ? (challenging / activePairs.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Matchup / Chemistry cards */}
      {activePairs.length === 0 ? (
        <p className="text-[9px] text-muted-foreground text-center py-4">
          Not enough birth data available for this view.
        </p>
      ) : (
        <div className="space-y-2">
          {activePairs.map((m, i) => (
            <div key={i} className="cosmic-card rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1 text-left min-w-0">
                  <p className="text-[10px] font-medium text-foreground truncate">{m.away.name}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {SIGN_SYMBOLS[m.away.sign]} {m.away.sign} · {m.away.position || "—"}
                  </p>
                </div>
                <div className="flex flex-col items-center px-3">
                  <span className={cn("text-lg font-bold", m.aspect.color)}>
                    {m.aspect.symbol}
                  </span>
                  <span className={cn("text-[9px] font-semibold", m.aspect.color)}>
                    {m.aspect.label}
                  </span>
                </div>
                <div className="flex-1 text-right min-w-0">
                  <p className="text-[10px] font-medium text-foreground truncate">{m.home.name}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {m.home.position || "—"} · {SIGN_SYMBOLS[m.home.sign]} {m.home.sign}
                  </p>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground italic mt-2 leading-relaxed text-center">
                ✦ {viewMode === "matchup" ? m.aspect.description : 
                  m.aspect.nature === "harmonious" ? "These teammates share natural chemistry — expect fluid cooperation" :
                  m.aspect.nature === "challenging" ? "Tension between these teammates may create competition for shots/touches" :
                  "Neutral energy — neither boosting nor hindering each other"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
