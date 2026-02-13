import { useState, useEffect } from "react";
import { Orbit } from "lucide-react";
import { useCurrentEphemeris, useRisingSign, useLunarMetrics, type PlanetPosition } from "@/hooks/use-astro";

const SIGN_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

const PLANET_SYMBOLS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇", Rising: "⬆",
};

const ELEMENT_MAP: Record<string, string> = {
  Aries: "Fire", Taurus: "Earth", Gemini: "Air", Cancer: "Water",
  Leo: "Fire", Virgo: "Earth", Libra: "Air", Scorpio: "Water",
  Sagittarius: "Fire", Capricorn: "Earth", Aquarius: "Air", Pisces: "Water",
};

// ── Moon Phase Calculator (fallback) ──
function getMoonPhaseFallback(forDate?: Date): { name: string; emoji: string; dayInCycle: number; advice: string } {
  const now = forDate || new Date();
  const lp = 2551443;
  const newMoon = new Date(1970, 0, 7, 20, 35, 0).getTime() / 1000;
  const phase = ((now.getTime() / 1000 - newMoon) % lp) / lp;
  const dayInCycle = phase * 29.53;
  const phases = [
    { max: 1.85, name: "New Moon", emoji: "🌑", advice: "Fresh starts — new betting strategies favored. Intuition peaks." },
    { max: 5.53, name: "Waxing Crescent", emoji: "🌒", advice: "Building momentum — underdogs may surprise. Trust emerging patterns." },
    { max: 9.22, name: "First Quarter", emoji: "🌓", advice: "Tension & action — expect competitive games and close spreads." },
    { max: 12.91, name: "Waxing Gibbous", emoji: "🌔", advice: "Refining edge — data-driven picks shine. Favor discipline over impulse." },
    { max: 16.61, name: "Full Moon", emoji: "🌕", advice: "Peak energy — high-scoring, emotional games. Watch for ejections & fouls." },
    { max: 20.30, name: "Waning Gibbous", emoji: "🌖", advice: "Harvest phase — collect on established trends. Veterans perform well." },
    { max: 23.99, name: "Last Quarter", emoji: "🌗", advice: "Release & recalibrate — close positions, review your model." },
    { max: 27.68, name: "Waning Crescent", emoji: "🌘", advice: "Rest & reflect — lower stakes, wait for the next cycle." },
  ];
  const p = phases.find((ph) => dayInCycle < ph.max) || { ...phases[0], name: "New Moon", emoji: "🌑", advice: phases[0].advice };
  return { ...p, dayInCycle };
}

function getMoonPhaseEmoji(phaseName: string): string {
  const map: Record<string, string> = {
    "New Moon": "🌑", "Waxing Crescent": "🌒", "First Quarter": "🌓",
    "Waxing Gibbous": "🌔", "Full Moon": "🌕", "Waning Gibbous": "🌖",
    "Last Quarter": "🌗", "Waning Crescent": "🌘", "new_moon": "🌑",
    "waxing_crescent": "🌒", "first_quarter": "🌓", "waxing_gibbous": "🌔",
    "full_moon": "🌕", "waning_gibbous": "🌖", "last_quarter": "🌗",
    "waning_crescent": "🌘",
  };
  return map[phaseName] || "🌙";
}

function getMoonPhaseAdvice(phaseName: string): string {
  const key = phaseName.toLowerCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    new_moon: "Fresh starts — new betting strategies favored. Intuition peaks.",
    waxing_crescent: "Building momentum — underdogs may surprise.",
    first_quarter: "Tension & action — competitive games, close spreads.",
    waxing_gibbous: "Refining edge — data-driven picks shine.",
    full_moon: "Peak energy — high-scoring, emotional games.",
    waning_gibbous: "Harvest phase — collect on established trends.",
    last_quarter: "Release & recalibrate — review your model.",
    waning_crescent: "Rest & reflect — lower stakes, wait for next cycle.",
  };
  return map[key] || "Observe lunar energy and adjust strategy accordingly.";
}

// ── Retrograde Tracker ──
function getRetrogradePlanets(forDate?: Date, livePositions?: PlanetPosition[]): { planet: string; symbol: string; meaning: string }[] {
  // Use live retrograde data if available
  if (livePositions) {
    const meanings: Record<string, string> = {
      Mercury: "Miscommunication, travel delays, review contracts",
      Venus: "Reassess values & partnerships",
      Mars: "Low physical energy, frustration, injuries more likely",
      Jupiter: "Internalized growth, luck turns inward",
      Saturn: "Restructuring, karmic lessons resurface",
      Uranus: "Inner revolution, unexpected shifts",
      Neptune: "Spiritual fog, illusion fades",
      Pluto: "Deep transformation, power dynamics shift",
    };
    return livePositions
      .filter((p) => p.retrograde)
      .map((p) => ({
        planet: p.planet,
        symbol: PLANET_SYMBOLS[p.planet] || "★",
        meaning: meanings[p.planet] || `${p.planet} retrograde energy`,
      }));
  }

  // Fallback to hardcoded ranges
  const now = forDate || new Date();
  const retros = [
    { planet: "Mercury", symbol: "☿", meaning: "Miscommunication, travel delays, review contracts", start: new Date("2026-01-25"), end: new Date("2026-02-15") },
    { planet: "Mercury", symbol: "☿", meaning: "Miscommunication, travel delays, review contracts", start: new Date("2026-05-20"), end: new Date("2026-06-12") },
    { planet: "Venus", symbol: "♀", meaning: "Reassess values & partnerships", start: new Date("2026-03-02"), end: new Date("2026-04-13") },
    { planet: "Mars", symbol: "♂", meaning: "Low physical energy, frustration, injuries more likely", start: new Date("2025-12-06"), end: new Date("2026-02-24") },
    { planet: "Jupiter", symbol: "♃", meaning: "Internalized growth, luck turns inward", start: new Date("2026-07-14"), end: new Date("2026-11-10") },
    { planet: "Saturn", symbol: "♄", meaning: "Restructuring, karmic lessons resurface", start: new Date("2026-06-08"), end: new Date("2026-10-24") },
  ];
  return retros.filter((r) => now >= r.start && now <= r.end).map(({ planet, symbol, meaning }) => ({ planet, symbol, meaning }));
}

// ── Rising sign approximation (fallback) ──
function getRisingSignFallback(forDate?: Date): { sign: string; symbol: string } {
  const signs = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const now = forDate || new Date();
  const hourOfDay = now.getHours() + now.getMinutes() / 60;
  const idx = Math.floor((hourOfDay / 2) % 12);
  const sign = signs[idx];
  return { sign, symbol: SIGN_SYMBOLS[sign] };
}

// ── Element Balance from planets ──
function getElementBalance(positions: { sign: string }[]): Record<string, number> {
  const counts: Record<string, number> = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
  positions.forEach((p) => {
    const el = ELEMENT_MAP[p.sign];
    if (el) counts[el]++;
  });
  return counts;
}

function getElementSummary(counts: Record<string, number>): { title: string; description: string; intensity: number } {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [first, second] = sorted;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Check for balanced (all within 1 of each other)
  const max = sorted[0][1];
  const min = sorted[sorted.length - 1][1];
  if (max - min <= 1 && total >= 4) {
    return { title: "Balanced Elements", description: "All elements in equilibrium — expect unpredictable, evenly matched contests. No single style dominates.", intensity: 65 };
  }

  // Check for tie between top two
  if (first[1] === second[1] && first[1] > 0) {
    const combos: Record<string, { title: string; description: string; intensity: number }> = {
      "Fire+Air": { title: "Fire–Air Synergy", description: "Explosive pace with high-IQ plays. Fast breaks meet creative passing — overs and three-point shooting favored.", intensity: 88 },
      "Air+Fire": { title: "Fire–Air Synergy", description: "Explosive pace with high-IQ plays. Fast breaks meet creative passing — overs and three-point shooting favored.", intensity: 88 },
      "Fire+Earth": { title: "Fire–Earth Tension", description: "Individual brilliance clashes with grind. Watch for volatile swings between runs and defensive stops.", intensity: 75 },
      "Earth+Fire": { title: "Fire–Earth Tension", description: "Individual brilliance clashes with grind. Watch for volatile swings between runs and defensive stops.", intensity: 75 },
      "Fire+Water": { title: "Fire–Water Steam", description: "Passion meets emotion. Home teams energized, tempers flare — ejections and fouls elevated.", intensity: 82 },
      "Water+Fire": { title: "Fire–Water Steam", description: "Passion meets emotion. Home teams energized, tempers flare — ejections and fouls elevated.", intensity: 82 },
      "Earth+Air": { title: "Earth–Air Strategy", description: "Methodical execution meets smart passing. Coaches shine — disciplined offenses dominate.", intensity: 68 },
      "Air+Earth": { title: "Earth–Air Strategy", description: "Methodical execution meets smart passing. Coaches shine — disciplined offenses dominate.", intensity: 68 },
      "Earth+Water": { title: "Earth–Water Foundation", description: "Defense and emotion rule. Unders favored, home-court advantage amplified, low-scoring grind.", intensity: 58 },
      "Water+Earth": { title: "Earth–Water Foundation", description: "Defense and emotion rule. Unders favored, home-court advantage amplified, low-scoring grind.", intensity: 58 },
      "Air+Water": { title: "Air–Water Flow", description: "Cerebral and intuitive play merge. Lead changes, tempo swings, and highlight-reel assists.", intensity: 76 },
      "Water+Air": { title: "Air–Water Flow", description: "Cerebral and intuitive play merge. Lead changes, tempo swings, and highlight-reel assists.", intensity: 76 },
    };
    const key = `${first[0]}+${second[0]}`;
    if (combos[key]) return combos[key];
  }

  // Single element dominance
  const summaries: Record<string, { title: string; description: string; intensity: number }> = {
    Fire: { title: "Fire Dominant", description: "Explosive scoring, individual brilliance, aggressive play. Overs and star performances favored.", intensity: 85 },
    Earth: { title: "Earth Dominant", description: "Grinding defense, low totals, methodical execution. Unders and veteran discipline rewarded.", intensity: 60 },
    Air: { title: "Air Dominant", description: "High-pace, three-point shooting, creative passing. Guards and playmakers feast.", intensity: 78 },
    Water: { title: "Water Dominant", description: "Emotional games, home court matters, intuition over analytics. Momentum runs in waves.", intensity: 72 },
  };
  return summaries[first[0]] || { title: "Balanced Elements", description: "Mixed elemental energy", intensity: 65 };
}

export function AstroHeader({ date }: { date?: Date } = {}) {
  const [tick, setTick] = useState(0);
  const forDate = date || new Date();
  const { data: liveEphemeris } = useCurrentEphemeris(forDate);
  const { data: liveRising } = useRisingSign(forDate);
  const { data: lunarData } = useLunarMetrics(forDate);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Moon phase: prefer live data ──
  const lunarResult = lunarData?.data || lunarData;
  const liveMoonPhase = lunarResult?.moon_phase || lunarResult?.phase;
  const liveVoc = lunarResult?.void_of_course || lunarResult?.voc;
  const fallbackMoon = getMoonPhaseFallback(forDate);

  const moonPhaseName = liveMoonPhase
    ? (typeof liveMoonPhase === "string" ? liveMoonPhase : liveMoonPhase.name || liveMoonPhase.phase || fallbackMoon.name)
    : fallbackMoon.name;
  const moonEmoji = liveMoonPhase ? getMoonPhaseEmoji(moonPhaseName) : fallbackMoon.emoji;
  const moonAdvice = getMoonPhaseAdvice(moonPhaseName);
  const moonDayInCycle = liveMoonPhase?.day_in_cycle ?? liveMoonPhase?.age ?? fallbackMoon.dayInCycle;

  // ── Rising sign ──
  const risingFallback = getRisingSignFallback(forDate);
  const rising = liveRising
    ? { sign: liveRising.sign, symbol: SIGN_SYMBOLS[liveRising.sign] || "⬆" }
    : risingFallback;

  // ── Moon sign from live data ──
  const liveMoonPosition = liveEphemeris?.find((p) => p.planet === "Moon");
  const moonSign = liveMoonPosition?.sign || risingFallback.sign; // fallback doesn't matter much

  // ── Build full planet strip: always include Rising ──
  const displayPlanets: { planet: string; symbol: string; sign: string; signSymbol: string; degree: number; retrograde?: boolean }[] = [];

  if (liveEphemeris && liveEphemeris.length > 0) {
    // Add all live planets
    liveEphemeris.forEach((p) => {
      displayPlanets.push({
        planet: p.planet,
        symbol: PLANET_SYMBOLS[p.planet] || "★",
        sign: p.sign,
        signSymbol: SIGN_SYMBOLS[p.sign] || "?",
        degree: p.degree,
        retrograde: p.retrograde,
      });
    });
    // Insert Rising after Moon if not already present
    if (!displayPlanets.find((p) => p.planet === "Rising")) {
      const moonIdx = displayPlanets.findIndex((p) => p.planet === "Moon");
      const risingEntry = {
        planet: "Rising",
        symbol: "⬆",
        sign: rising.sign,
        signSymbol: rising.symbol,
        degree: liveRising?.degree ?? Math.floor(((forDate || new Date()).getMinutes() / 60) * 30),
        retrograde: false,
      };
      displayPlanets.splice(moonIdx >= 0 ? moonIdx + 1 : 0, 0, risingEntry);
    }
  } else {
    // Fallback: use approximation with all planets
    const d = forDate || new Date();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const sunSigns = [
      { sign: "Capricorn", sym: "♑", m1: 1, d1: 1, m2: 1, d2: 19 },
      { sign: "Aquarius", sym: "♒", m1: 1, d1: 20, m2: 2, d2: 18 },
      { sign: "Pisces", sym: "♓", m1: 2, d1: 19, m2: 3, d2: 20 },
      { sign: "Aries", sym: "♈", m1: 3, d1: 21, m2: 4, d2: 19 },
      { sign: "Taurus", sym: "♉", m1: 4, d1: 20, m2: 5, d2: 20 },
      { sign: "Gemini", sym: "♊", m1: 5, d1: 21, m2: 6, d2: 20 },
      { sign: "Cancer", sym: "♋", m1: 6, d1: 21, m2: 7, d2: 22 },
      { sign: "Leo", sym: "♌", m1: 7, d1: 23, m2: 8, d2: 22 },
      { sign: "Virgo", sym: "♍", m1: 8, d1: 23, m2: 9, d2: 22 },
      { sign: "Libra", sym: "♎", m1: 9, d1: 23, m2: 10, d2: 22 },
      { sign: "Scorpio", sym: "♏", m1: 10, d1: 23, m2: 11, d2: 21 },
      { sign: "Sagittarius", sym: "♐", m1: 11, d1: 22, m2: 12, d2: 21 },
      { sign: "Capricorn", sym: "♑", m1: 12, d1: 22, m2: 12, d2: 31 },
    ];
    const sunInfo = sunSigns.find(s => (month === s.m1 && day >= s.d1) || (month === s.m2 && day <= s.d2)) || { sign: "Capricorn", sym: "♑" };
    displayPlanets.push(
      { planet: "Sun", symbol: "☉", sign: sunInfo.sign, signSymbol: sunInfo.sym, degree: day },
      { planet: "Moon", symbol: "☽", sign: moonSign, signSymbol: SIGN_SYMBOLS[moonSign] || "?", degree: 0 },
      { planet: "Rising", symbol: "⬆", sign: rising.sign, signSymbol: rising.symbol, degree: 0 },
    );
  }

  // ── Retrogrades from live data ──
  const retrogrades = getRetrogradePlanets(forDate, liveEphemeris || undefined);

  // ── Element balance from all positions (excluding Rising) ──
  const elementPositions = displayPlanets.filter((p) => p.planet !== "Rising");
  const elementBalance = getElementBalance(elementPositions);
  const energy = getElementSummary(elementBalance);

  // ── VoC status ──
  const isVoc = liveVoc === true || (typeof liveVoc === "object" && liveVoc?.is_voc);

  void tick;

  return (
    <div className="mx-4 mt-2 mb-1 space-y-2">
      {/* Moon Phase + Element Energy */}
      <div className="celestial-gradient rounded-xl p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{moonEmoji}</span>
            <div>
              <p className="text-sm font-semibold font-display text-foreground">
                {moonPhaseName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Day {Math.floor(moonDayInCycle)} · Moon in {liveMoonPosition?.sign || moonSign} · Rising {rising.symbol} {rising.sign}
              </p>
              {isVoc && (
                <p className="text-[10px] text-cosmic-gold font-semibold mt-0.5">⚠ Void-of-Course Moon — avoid new bets</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-cosmic-indigo uppercase tracking-wider">{energy.title}</p>
            <div className="flex items-center gap-1 mt-0.5 justify-end">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-3 rounded-full ${
                    i < Math.round(energy.intensity / 20) ? "bg-primary" : "bg-border"
                  }`}
                />
              ))}
              <span className="text-[10px] text-muted-foreground ml-1">{energy.intensity}%</span>
            </div>
          </div>
        </div>

        {/* Moon Advice */}
        <p className="text-xs text-foreground/80 leading-relaxed mb-3 italic">
          "{moonAdvice}"
        </p>

        {/* Element Summary */}
        <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
          ✦ {energy.description}
        </p>

        {/* Planetary Positions Strip */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {displayPlanets.map((p) => (
            <div
              key={p.planet}
              className="flex-shrink-0 astro-badge rounded-lg px-2 py-1.5 text-center min-w-[52px]"
            >
              <p className="text-[9px] text-muted-foreground leading-none">
                {p.planet}
                {p.retrograde ? " ℞" : ""}
              </p>
              <p className="text-sm leading-none mt-0.5">{p.symbol}</p>
              <p className="text-[9px] text-cosmic-indigo font-semibold mt-0.5">{p.signSymbol} {p.degree}°</p>
            </div>
          ))}
        </div>
      </div>

      {/* Retrogrades */}
      {retrogrades.length > 0 && (
        <div className="cosmic-card rounded-xl p-3">
          <p className="text-[10px] font-semibold text-destructive uppercase tracking-widest mb-2 flex items-center gap-1">
            <Orbit className="h-3 w-3" />
            Planets in Retrograde
          </p>
          <div className="space-y-1.5">
            {retrogrades.map((r) => (
              <div key={r.planet} className="flex items-center gap-2">
                <span className="text-sm w-5 text-center">{r.symbol}</span>
                <span className="text-xs font-semibold text-foreground">{r.planet} ℞</span>
                <span className="text-[10px] text-muted-foreground">— {r.meaning}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
