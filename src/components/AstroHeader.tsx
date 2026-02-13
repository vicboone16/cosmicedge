import { useState, useEffect } from "react";
import { Orbit } from "lucide-react";
import { useCurrentEphemeris } from "@/hooks/use-astro";

// ── Moon Phase Calculator ──
function getMoonPhase(): { name: string; emoji: string; dayInCycle: number; advice: string } {
  const now = new Date();
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

// ── Retrograde Tracker ──
function getRetrogradePlanets(): { planet: string; symbol: string; meaning: string }[] {
  const now = new Date();
  const retros: { planet: string; symbol: string; meaning: string; start: Date; end: Date }[] = [
    { planet: "Mercury", symbol: "☿", meaning: "Miscommunication, travel delays, review contracts", start: new Date("2026-01-25"), end: new Date("2026-02-15") },
    { planet: "Mercury", symbol: "☿", meaning: "Miscommunication, travel delays, review contracts", start: new Date("2026-05-20"), end: new Date("2026-06-12") },
    { planet: "Venus", symbol: "♀", meaning: "Reassess values & partnerships", start: new Date("2026-03-02"), end: new Date("2026-04-13") },
    { planet: "Mars", symbol: "♂", meaning: "Low physical energy, frustration, injuries more likely", start: new Date("2025-12-06"), end: new Date("2026-02-24") },
    { planet: "Jupiter", symbol: "♃", meaning: "Internalized growth, luck turns inward", start: new Date("2026-07-14"), end: new Date("2026-11-10") },
    { planet: "Saturn", symbol: "♄", meaning: "Restructuring, karmic lessons resurface", start: new Date("2026-06-08"), end: new Date("2026-10-24") },
  ];
  return retros.filter((r) => now >= r.start && now <= r.end).map(({ planet, symbol, meaning }) => ({ planet, symbol, meaning }));
}

// ── Moon sign changes roughly every 2.5 days ──
function getMoonSign(): string {
  const signs = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const now = new Date();
  // Use hours for sub-day granularity
  const hoursSinceEpoch = now.getTime() / 3600000;
  const idx = Math.floor((hoursSinceEpoch / 60) % 12); // ~2.5 day per sign
  return signs[idx];
}

function getMoonSignSymbol(): string {
  const map: Record<string, string> = {
    Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
    Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
  };
  return map[getMoonSign()] || "♈";
}

// ── Rising sign approximation (changes every ~2 hours) ──
function getRisingSign(): { sign: string; symbol: string } {
  const signs = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const symbols: Record<string, string> = {
    Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
    Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
  };
  const now = new Date();
  // Rising sign rotates through all 12 signs in 24 hours
  const hourOfDay = now.getHours() + now.getMinutes() / 60;
  const idx = Math.floor((hourOfDay / 2) % 12);
  const sign = signs[idx];
  return { sign, symbol: symbols[sign] };
}

// ── Moon degree approximation (moves ~0.5° per hour) ──
function getMoonDegree(): number {
  const now = new Date();
  const hoursSinceEpoch = now.getTime() / 3600000;
  return Math.floor((hoursSinceEpoch * 0.5) % 30);
}

// ── Planetary Positions ──
function getPlanetaryPositions() {
  const rising = getRisingSign();
  return [
    { planet: "Sun", symbol: "☉", sign: "Aquarius", signSymbol: "♒", degree: 24 },
    { planet: "Moon", symbol: "☽", sign: getMoonSign(), signSymbol: getMoonSignSymbol(), degree: getMoonDegree() },
    { planet: "Rising", symbol: "⬆", sign: rising.sign, signSymbol: rising.symbol, degree: Math.floor((new Date().getMinutes() / 60) * 30) },
    { planet: "Mercury", symbol: "☿", sign: "Aquarius", signSymbol: "♒", degree: 8 },
    { planet: "Venus", symbol: "♀", sign: "Pisces", signSymbol: "♓", degree: 15 },
    { planet: "Mars", symbol: "♂", sign: "Cancer", signSymbol: "♋", degree: 22 },
    { planet: "Jupiter", symbol: "♃", sign: "Cancer", signSymbol: "♋", degree: 14 },
    { planet: "Saturn", symbol: "♄", sign: "Pisces", signSymbol: "♓", degree: 27 },
  ];
}

// ── Daily Cosmic Energy ──
function getDailyEnergy(): { title: string; description: string; intensity: number } {
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const energies = [
    { title: "Cardinal Fire", description: "Explosive starts, fast breaks, and momentum shifts dominate.", intensity: 85 },
    { title: "Fixed Earth", description: "Grinding, physical contests. Totals skew under.", intensity: 60 },
    { title: "Mutable Air", description: "High-IQ basketball. Guards and playmakers feast.", intensity: 72 },
    { title: "Cardinal Water", description: "Emotional, home-court energy is amplified.", intensity: 78 },
    { title: "Fixed Fire", description: "Star players dominate. Individual brilliance over team play.", intensity: 90 },
    { title: "Mutable Earth", description: "Methodical execution wins. Coaching matters most.", intensity: 55 },
    { title: "Cardinal Air", description: "Pace & space. Three-point shooting is hot.", intensity: 80 },
  ];
  return energies[dayOfYear % energies.length];
}

export function AstroHeader() {
  const [tick, setTick] = useState(0);
  const { data: liveEphemeris } = useCurrentEphemeris();

  // Refresh every 30 minutes for moon/rising movement
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const moon = getMoonPhase();
  const retrogrades = getRetrogradePlanets();
  const energy = getDailyEnergy();
  const rising = getRisingSign();

  // Use live ephemeris if available, otherwise fall back to hardcoded
  const planets = liveEphemeris
    ? liveEphemeris.map((p) => {
        const signSymbols: Record<string, string> = {
          Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
          Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
        };
        const planetSymbols: Record<string, string> = {
          Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
          Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
        };
        return {
          planet: p.planet,
          symbol: planetSymbols[p.planet] || "★",
          sign: p.sign,
          signSymbol: signSymbols[p.sign] || "♈",
          degree: p.degree,
          retrograde: p.retrograde,
        };
      })
    : getPlanetaryPositions();

  // Suppress unused warning
  void tick;

  return (
    <div className="mx-4 mt-2 mb-1 space-y-2">
      {/* Moon Phase + Daily Energy */}
      <div className="celestial-gradient rounded-xl p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{moon.emoji}</span>
            <div>
              <p className="text-sm font-semibold font-display text-foreground">{moon.name}</p>
              <p className="text-[10px] text-muted-foreground">Day {Math.floor(moon.dayInCycle)} · Moon in {getMoonSign()} · Rising {rising.symbol} {rising.sign}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-cosmic-indigo uppercase tracking-wider">{energy.title}</p>
            <div className="flex items-center gap-1 mt-0.5 justify-end">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-3 rounded-full ${
                    i < Math.round(energy.intensity / 20)
                      ? "bg-primary"
                      : "bg-border"
                  }`}
                />
              ))}
              <span className="text-[10px] text-muted-foreground ml-1">{energy.intensity}%</span>
            </div>
          </div>
        </div>

        {/* Moon Advice */}
        <p className="text-xs text-foreground/80 leading-relaxed mb-3 italic">
          "{moon.advice}"
        </p>

        {/* Planetary Positions Strip */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {planets.map((p) => (
            <div
              key={p.planet}
              className="flex-shrink-0 astro-badge rounded-lg px-2 py-1.5 text-center min-w-[52px]"
            >
              <p className="text-[9px] text-muted-foreground leading-none">
                {p.planet}
                {"retrograde" in p && (p as any).retrograde ? " ℞" : ""}
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
