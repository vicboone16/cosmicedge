import { useState } from "react";
import { Star, Orbit, Moon, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, addDays, isToday } from "date-fns";
import { useCurrentEphemeris, type PlanetPosition } from "@/hooks/use-astro";

const SIGN_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

const PLANET_SYMBOLS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};

const ELEMENT_MAP: Record<string, string> = {
  Aries: "Fire", Taurus: "Earth", Gemini: "Air", Cancer: "Water",
  Leo: "Fire", Virgo: "Earth", Libra: "Air", Scorpio: "Water",
  Sagittarius: "Fire", Capricorn: "Earth", Aquarius: "Air", Pisces: "Water",
};

const PLANET_MEANINGS: Record<string, (sign: string) => string> = {
  Sun: (s) => `Core energy in ${s} — ${ELEMENT_MAP[s] === "Fire" ? "explosive starts, individual brilliance" : ELEMENT_MAP[s] === "Earth" ? "grinding methodical play" : ELEMENT_MAP[s] === "Air" ? "high-IQ plays, passing" : "emotional, home-court energy"}`,
  Moon: (s) => `Emotional tone in ${s} — ${ELEMENT_MAP[s] === "Fire" ? "aggressive crowd energy" : ELEMENT_MAP[s] === "Earth" ? "steady, predictable games" : ELEMENT_MAP[s] === "Air" ? "tempo swings, lead changes" : "intuition-driven, runs in waves"}`,
  Mercury: (s) => `Communication in ${s} — affects playmaking, coaching adjustments, and ball movement`,
  Venus: (s) => `Harmony in ${s} — influences shooting touch, team chemistry, and finesse plays`,
  Mars: (s) => `Drive in ${s} — drives physicality, aggression, fast breaks, and foul rates`,
  Jupiter: (s) => `Expansion in ${s} — amplifies scoring, generous stat lines, and big performances`,
  Saturn: (s) => `Structure in ${s} — favors discipline, defense, and veteran execution`,
  Uranus: (s) => `Disruption in ${s} — unexpected lead changes, wild momentum shifts`,
  Neptune: (s) => `Illusion in ${s} — deceptive plays, fadeaways, misdirection`,
  Pluto: (s) => `Transformation in ${s} — power shifts, roster impacts, intensity`,
};

function getElementBalance(planets: PlanetPosition[]) {
  const counts: Record<string, number> = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
  planets.forEach((p) => {
    const el = ELEMENT_MAP[p.sign];
    if (el) counts[el]++;
  });
  return counts;
}

function getElementSummary(counts: Record<string, number>): string {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [first, second] = sorted;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const max = sorted[0][1];
  const min = sorted[sorted.length - 1][1];

  if (max - min <= 1 && total >= 4) {
    return "Balanced elements — unpredictable, evenly matched contests. No single style dominates.";
  }

  if (first[1] === second[1] && first[1] > 0) {
    const combos: Record<string, string> = {
      "Fire+Air": "Fire–Air synergy — explosive pace with high-IQ plays, overs and three-point shooting favored",
      "Air+Fire": "Fire–Air synergy — explosive pace with high-IQ plays, overs and three-point shooting favored",
      "Fire+Earth": "Fire–Earth tension — volatile swings between runs and defensive stops",
      "Earth+Fire": "Fire–Earth tension — volatile swings between runs and defensive stops",
      "Fire+Water": "Fire–Water steam — passion meets emotion, home teams energized, fouls elevated",
      "Water+Fire": "Fire–Water steam — passion meets emotion, home teams energized, fouls elevated",
      "Earth+Air": "Earth–Air strategy — methodical execution meets smart passing, coaches shine",
      "Air+Earth": "Earth–Air strategy — methodical execution meets smart passing, coaches shine",
      "Earth+Water": "Earth–Water foundation — defense and emotion rule, unders favored, home-court amplified",
      "Water+Earth": "Earth–Water foundation — defense and emotion rule, unders favored, home-court amplified",
      "Air+Water": "Air–Water flow — cerebral and intuitive play, lead changes and tempo swings",
      "Water+Air": "Air–Water flow — cerebral and intuitive play, lead changes and tempo swings",
    };
    const key = `${first[0]}+${second[0]}`;
    if (combos[key]) return combos[key];
  }

  const summaries: Record<string, string> = {
    Fire: "Fire dominance — explosive scoring, individual brilliance, aggressive play",
    Earth: "Earth dominance — grinding defense, low totals, methodical execution",
    Air: "Air dominance — high-pace, three-point shooting, creative passing",
    Water: "Water dominance — emotional games, home court matters, intuition over analytics",
  };
  return summaries[first[0]] || "Balanced elemental energy";
}

const TransitsPage = () => {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { data: ephemeris, isLoading: ephemerisLoading } = useCurrentEphemeris(selectedDate);

  const canGoForward = selectedDate < addDays(new Date(), 7);
  const goBack = () => setSelectedDate((d) => addDays(d, -1));
  const goForward = () => canGoForward && setSelectedDate((d) => addDays(d, 1));
  const goToday = () => setSelectedDate(new Date());

  // Fetch lunar metrics for void-of-course
  const dateStr = selectedDate.toISOString().slice(0, 10);
  const { data: lunarData } = useQuery({
    queryKey: ["transit-lunar", dateStr],
    queryFn: async () => {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrologyapi?mode=lunar_metrics&transit_date=${dateStr}&entity_id=transit_${dateStr}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (!resp.ok) return null;
      return resp.json();
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  // Fetch games for the selected date
  const { data: games } = useQuery({
    queryKey: ["transit-games", dateStr],
    queryFn: async () => {
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(selectedDate);
      end.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from("games")
        .select("*")
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString())
        .order("start_time");
      return data || [];
    },
  });

  const planets = ephemeris || [];
  const elementBalance = getElementBalance(planets);
  const lunarResult = lunarData?.result;
  const voc = lunarResult?.void_of_course || lunarResult?.voc;
  const moonPhase = lunarResult?.moon_phase || lunarResult?.phase;

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold font-display">Daily Transits</h1>
        </div>
        {/* Date Navigator */}
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={goToday}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isToday(selectedDate)
              ? `${format(selectedDate, "EEEE, MMMM d, yyyy")} · Today`
              : format(selectedDate, "EEEE, MMMM d, yyyy")}
          </button>
          <button onClick={goForward} disabled={!canGoForward} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {!isToday(selectedDate) && (
            <button onClick={goToday} className="text-[10px] text-primary hover:underline ml-1">
              Today
            </button>
          )}
        </div>
      </header>

      <div className="px-4 py-4 space-y-5">
        {/* Element Balance */}
        <section>
          <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Elemental Balance</h3>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(elementBalance).map(([element, count]) => {
              const colors: Record<string, string> = { Fire: "bg-cosmic-red", Earth: "bg-cosmic-green", Air: "bg-cosmic-cyan", Water: "bg-cosmic-indigo" };
              const emojis: Record<string, string> = { Fire: "🔥", Earth: "🌍", Air: "💨", Water: "🌊" };
              return (
                <div key={element} className="cosmic-card rounded-xl p-3 text-center">
                  <p className="text-lg mb-1">{emojis[element]}</p>
                  <p className="text-xs font-semibold text-foreground">{element}</p>
                  <div className="flex justify-center gap-0.5 mt-1.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className={cn("h-1.5 w-2 rounded-full", i < count ? colors[element] : "bg-border")} />
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{count} planets</p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2 italic">
            ✦ {planets.length > 0 ? getElementSummary(elementBalance) : "Loading planetary data..."}
          </p>
        </section>

        {/* Void of Course Moon */}
        <div className={cn(
          "cosmic-card rounded-xl p-3 flex items-center gap-3",
          (voc === true || voc?.is_voc) ? "border-l-2 border-l-cosmic-gold" : ""
        )}>
          <Moon className="h-4 w-4 text-cosmic-gold" />
          <div>
            <p className="text-xs font-semibold text-foreground">
              Void-of-Course Moon: {(voc === true || voc?.is_voc) ? "ACTIVE ⚠" : "Clear ✓"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {(voc === true || voc?.is_voc)
                ? "Avoid new bets during VoC — outcomes are unpredictable"
                : "Moon is making aspects — normal betting conditions"}
            </p>
            {moonPhase && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                🌙 {typeof moonPhase === "string" ? moonPhase : moonPhase.name || moonPhase.phase || ""}
              </p>
            )}
          </div>
        </div>

        {/* Planetary Positions */}
        <section>
          <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Orbit className="h-3.5 w-3.5" />
            Planetary Positions
            {ephemerisLoading && <span className="text-[9px] text-muted-foreground ml-1">(loading...)</span>}
          </h3>
          {planets.length > 0 ? (
            <div className="space-y-2">
              {planets.map((p) => {
                const meaning = PLANET_MEANINGS[p.planet]?.(p.sign) || `${p.planet} in ${p.sign}`;
                return (
                  <div key={p.planet} className={cn(
                    "cosmic-card rounded-xl p-3",
                    p.retrograde ? "border-l-2 border-l-cosmic-red" : ""
                  )}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg w-6 text-center">{PLANET_SYMBOLS[p.planet] || "★"}</span>
                        <div>
                          <span className="text-xs font-semibold text-foreground">{p.planet}</span>
                          {p.retrograde && <span className="text-[10px] text-cosmic-red ml-1 font-bold">℞</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-display">{SIGN_SYMBOLS[p.sign] || "?"}</span>
                        <span className="text-xs text-muted-foreground ml-1">{p.sign} {p.degree}°</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed pl-8">{meaning}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="cosmic-card rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground">
                {ephemerisLoading ? "Fetching planetary positions..." : "Planetary data unavailable — API quota may be exceeded"}
              </p>
            </div>
          )}
        </section>

        {/* Game Slate Mapping */}
        {games && games.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Transit × Slate Map</h3>
            <div className="space-y-2">
              {games.map((g) => {
                const hour = new Date(g.start_time).getHours();
                const planetaryHour = hour < 14 ? "☉ Sun" : hour < 18 ? "♀ Venus" : hour < 21 ? "♂ Mars" : "♄ Saturn";
                const influence = hour < 14
                  ? "Solar hour amplifies individual brilliance and home energy"
                  : hour < 18
                  ? "Venus hour favors shooting touch and ball movement"
                  : hour < 21
                  ? "Mars hour — aggression and physicality shape the outcome"
                  : "Saturn hour — grinding, methodical play wins";

                return (
                  <button
                    key={g.id}
                    onClick={() => navigate(`/game/${g.id}`)}
                    className="w-full cosmic-card rounded-xl p-3 text-left hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground">
                        {g.away_abbr} @ {g.home_abbr}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(g.start_time), "h:mm a")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-cosmic-indigo font-medium">{planetaryHour}</span>
                      <span className="text-[10px] text-muted-foreground">— {influence}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default TransitsPage;
