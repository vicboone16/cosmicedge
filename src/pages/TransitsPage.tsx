import { Star, Orbit, Moon, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ── Planetary Data ──
const PLANETS = [
  { planet: "Sun", symbol: "☉", sign: "Aquarius", signSymbol: "♒", degree: 24, element: "Air", house: "11th", meaning: "Innovation, team dynamics, unconventional strategies" },
  { planet: "Moon", symbol: "☽", sign: "Sagittarius", signSymbol: "♐", degree: 18, element: "Fire", house: "9th", meaning: "Long-range shots favored, travel teams energized" },
  { planet: "Mercury", symbol: "☿", sign: "Aquarius", signSymbol: "♒", degree: 8, element: "Air", house: "11th", meaning: "Creative passing, unorthodox plays — BUT retrograde disrupts execution", retrograde: true },
  { planet: "Venus", symbol: "♀", sign: "Pisces", signSymbol: "♓", degree: 15, element: "Water", house: "12th", meaning: "Graceful movement, finesse players shine, artistic plays" },
  { planet: "Mars", symbol: "♂", sign: "Cancer", signSymbol: "♋", degree: 22, element: "Water", house: "4th", meaning: "Home court advantage amplified — BUT retrograde saps aggression", retrograde: true },
  { planet: "Jupiter", symbol: "♃", sign: "Cancer", signSymbol: "♋", degree: 14, element: "Water", house: "4th", meaning: "Expansion at home, big scoring nights, generous stat lines" },
  { planet: "Saturn", symbol: "♄", sign: "Pisces", signSymbol: "♓", degree: 27, element: "Water", house: "12th", meaning: "Structural defense, disciplined play, low-scoring affairs" },
  { planet: "Uranus", symbol: "♅", sign: "Gemini", signSymbol: "♊", degree: 3, element: "Air", house: "3rd", meaning: "Unexpected lead changes, wild fourth quarters" },
  { planet: "Neptune", symbol: "♆", sign: "Aries", signSymbol: "♈", degree: 2, element: "Fire", house: "1st", meaning: "Deceptive ball-handling, misdirection plays, fadeaways" },
  { planet: "Pluto", symbol: "♇", sign: "Aquarius", signSymbol: "♒", degree: 5, element: "Air", house: "11th", meaning: "Power shifts in team dynamics, roster shake-ups impact outcomes" },
];

// ── Aspects ──
const ASPECTS = [
  { planet1: "☉", planet2: "♃", type: "Trine", symbol: "△", effect: "Flowing energy between individual will and expansion — high-scoring games with star performances", impact: "positive" as const },
  { planet1: "☿℞", planet2: "♄", type: "Sextile", symbol: "⚹", effect: "Disciplined communication despite Mercury retrograde — set plays execute better than improvisation", impact: "neutral" as const },
  { planet1: "♂℞", planet2: "♆", type: "Square", symbol: "□", effect: "Frustration meets confusion — expect sloppy turnovers, fouls from frustration, and ejection risk", impact: "negative" as const },
  { planet1: "♀", planet2: "♃", type: "Conjunction", symbol: "☌", effect: "Grace meets abundance — beautiful basketball, career highlight plays, and generous stat lines", impact: "positive" as const },
  { planet1: "☽", planet2: "♅", type: "Opposition", symbol: "☍", effect: "Emotional volatility — momentum swings, buzzer beaters, and crowd energy shifts", impact: "negative" as const },
  { planet1: "♄", planet2: "♇", type: "Sextile", symbol: "⚹", effect: "Structural transformation — defensive schemes evolve mid-game, adjustments win", impact: "neutral" as const },
];

// ── Element counts for the day ──
function getElementBalance() {
  const counts: Record<string, number> = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
  PLANETS.forEach(p => { counts[p.element]++; });
  return counts;
}

// ── Void of Course Moon ──
function getVoidOfCourseMoon(): { active: boolean; start: string; end: string } {
  // Approximate window for today
  return { active: false, start: "3:42 AM", end: "5:18 AM" };
}

const TransitsPage = () => {
  const navigate = useNavigate();
  const elementBalance = getElementBalance();
  const voc = getVoidOfCourseMoon();
  const today = format(new Date(), "EEEE, MMMM d, yyyy");

  // Fetch today's games to map transits
  const { data: games } = useQuery({
    queryKey: ["transit-games"],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from("games")
        .select("*")
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString())
        .order("start_time");
      return data || [];
    },
  });

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold font-display">Daily Transits</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{today}</p>
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
            ✦ Water dominance today — emotional games, home court matters, intuition over analytics
          </p>
        </section>

        {/* Void of Course Moon */}
        <div className={cn(
          "cosmic-card rounded-xl p-3 flex items-center gap-3",
          voc.active ? "border-l-2 border-l-cosmic-gold" : ""
        )}>
          <Moon className="h-4 w-4 text-cosmic-gold" />
          <div>
            <p className="text-xs font-semibold text-foreground">
              Void-of-Course Moon: {voc.active ? "ACTIVE" : "Clear"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {voc.active
                ? "Avoid new bets during VoC — outcomes are unpredictable"
                : `Next VoC window: ${voc.start} – ${voc.end} (passed)`}
            </p>
          </div>
        </div>

        {/* Planetary Positions */}
        <section>
          <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Orbit className="h-3.5 w-3.5" />
            Planetary Positions
          </h3>
          <div className="space-y-2">
            {PLANETS.map((p) => (
              <div key={p.planet} className={cn(
                "cosmic-card rounded-xl p-3",
                p.retrograde ? "border-l-2 border-l-cosmic-red" : ""
              )}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg w-6 text-center">{p.symbol}</span>
                    <div>
                      <span className="text-xs font-semibold text-foreground">{p.planet}</span>
                      {p.retrograde && <span className="text-[10px] text-cosmic-red ml-1 font-bold">℞</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-display">{p.signSymbol}</span>
                    <span className="text-xs text-muted-foreground ml-1">{p.sign} {p.degree}°</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed pl-8">{p.meaning}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Major Aspects */}
        <section>
          <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Major Aspects</h3>
          <div className="space-y-2">
            {ASPECTS.map((a, i) => (
              <div key={i} className={cn(
                "cosmic-card rounded-xl p-3 border-l-2",
                a.impact === "positive" ? "border-l-cosmic-green" : a.impact === "negative" ? "border-l-cosmic-red" : "border-l-cosmic-gold"
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-display">{a.planet1}</span>
                  <span className="text-xs text-muted-foreground">{a.symbol} {a.type}</span>
                  <span className="text-sm font-display">{a.planet2}</span>
                  <span className={cn(
                    "ml-auto text-[10px] font-semibold uppercase",
                    a.impact === "positive" ? "text-cosmic-green" : a.impact === "negative" ? "text-cosmic-red" : "text-cosmic-gold"
                  )}>
                    {a.impact === "positive" ? "Favorable" : a.impact === "negative" ? "Challenging" : "Neutral"}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{a.effect}</p>
              </div>
            ))}
          </div>
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
                  ? "Mars hour (retrograde) — aggression muted, fouls spike"
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
