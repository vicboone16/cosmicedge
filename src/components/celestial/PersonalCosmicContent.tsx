import { Sun, Moon, Sparkles, TrendingUp, Shield, Zap, AlertTriangle, Edit2, CalendarDays, Activity, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useCurrentEphemeris, useLunarMetrics, type PlanetPosition } from "@/hooks/use-astro";
import { addDays, format } from "date-fns";
import { cn } from "@/lib/utils";

// ── Styling tokens ──────────────────────────────────────────────────────────
const glassCard =
  "backdrop-blur-xl bg-[#e8dff5]/40 dark:bg-[#2a1a45]/50 border border-[#c4b0e0]/40 dark:border-[#6b4c9a]/40 shadow-lg";
const innerCard =
  "rounded-xl bg-[#f3eef9]/60 dark:bg-[#1e1035]/60 border border-[#d4c4ec]/50 dark:border-[#6b4c9a]/30";
const labelColor = "text-[#6b4c9a] dark:text-[#c4a8f0]";

// ── Static maps ─────────────────────────────────────────────────────────────
const SIGN_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

const SIGN_ELEMENTS: Record<string, { element: string; color: string }> = {
  Aries:       { element: "Fire",  color: "text-orange-400" },
  Leo:         { element: "Fire",  color: "text-orange-400" },
  Sagittarius: { element: "Fire",  color: "text-orange-400" },
  Taurus:      { element: "Earth", color: "text-emerald-500" },
  Virgo:       { element: "Earth", color: "text-emerald-500" },
  Capricorn:   { element: "Earth", color: "text-emerald-500" },
  Gemini:      { element: "Air",   color: "text-sky-400" },
  Libra:       { element: "Air",   color: "text-sky-400" },
  Aquarius:    { element: "Air",   color: "text-sky-400" },
  Cancer:      { element: "Water", color: "text-indigo-400" },
  Scorpio:     { element: "Water", color: "text-indigo-400" },
  Pisces:      { element: "Water", color: "text-indigo-400" },
};

const SIGNS_ORDERED = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

const ELEMENT_MAP: Record<string, string> = {
  Aries: "Fire", Taurus: "Earth", Gemini: "Air",    Cancer: "Water",
  Leo:   "Fire", Virgo:  "Earth", Libra:  "Air",    Scorpio: "Water",
  Sagittarius: "Fire", Capricorn: "Earth", Aquarius: "Air", Pisces: "Water",
};

// ── Aspect geometry ──────────────────────────────────────────────────────────
type AspectType = "conjunction" | "trine" | "sextile" | "square" | "opposition";

function getAspect(sign1: string, sign2: string): AspectType | null {
  const i = SIGNS_ORDERED.indexOf(sign1);
  const j = SIGNS_ORDERED.indexOf(sign2);
  if (i < 0 || j < 0) return null;
  const d = Math.min(Math.abs(i - j), 12 - Math.abs(i - j));
  if (d === 0) return "conjunction";
  if (d === 4) return "trine";
  if (d === 2) return "sextile";
  if (d === 3) return "square";
  if (d === 6) return "opposition";
  return null;
}

const MALEFICS = new Set(["Mars", "Saturn", "Pluto"]);

// ── Types ─────────────────────────────────────────────────────────────────────
interface TransitAspect {
  transitPlanet: string;
  natalPoint: string;
  natalSign: string;
  aspect: AspectType;
  transitSign: string;
  retrograde: boolean;
  type: "boost" | "caution";
  badge: string;
  detail: string;
}

// ── Bet-context aspect descriptions ──────────────────────────────────────────
const ASPECT_BETTING: Record<string, Record<AspectType, string>> = {
  Sun: {
    conjunction: "Solar confidence peak — analytical instincts are at their sharpest today",
    trine:       "Solar flow active — intuition and data align, ideal for your go-to markets",
    sextile:     "Supportive solar energy — well-researched props and spreads pay off",
    square:      "Solar friction — overconfidence risk, avoid doubling down on losing plays",
    opposition:  "Solar opposition — pause before big swings, trust the model over ego",
  },
  Moon: {
    conjunction: "Moon merges with your natal Moon — gut reads are unusually reliable today",
    trine:       "Moon harmony — emotional clarity supports live-game decision-making",
    sextile:     "Moon lift — steady emotional baseline, good conditions for focused analysis",
    square:      "Moon friction — emotional volatility elevated, stick to pre-planned plays",
    opposition:  "Moon opposition — frustration risk, avoid tilt bets after a loss",
  },
  Rising: {
    conjunction: "Rising amplified — first reads on matchups and line value are sharp",
    trine:       "Rising flow — situational awareness dialed in, trust your game-reads",
    sextile:     "Rising support — solid instincts for spotting value on the board",
    square:      "Rising tension — initial instincts may mislead, double-check your reads",
    opposition:  "Rising opposition — reconsider initial reactions to line movement",
  },
};

// ── Core computations ─────────────────────────────────────────────────────────
function computeTransitAspects(
  sun: string | null,
  moon: string | null,
  rising: string | null,
  ephemeris: PlanetPosition[],
): TransitAspect[] {
  const natalPoints = [
    ...(sun    ? [{ name: "Sun",    sign: sun    }] : []),
    ...(moon   ? [{ name: "Moon",   sign: moon   }] : []),
    ...(rising ? [{ name: "Rising", sign: rising }] : []),
  ];
  if (!natalPoints.length || !ephemeris.length) return [];

  const PRIORITY = ["Mercury", "Venus", "Mars", "Moon", "Sun", "Jupiter", "Saturn"];
  const sorted = [...ephemeris].sort(
    (a, b) => (PRIORITY.indexOf(a.planet) + 1 || 99) - (PRIORITY.indexOf(b.planet) + 1 || 99),
  );

  const aspects: TransitAspect[] = [];
  const ASPECT_NAMES: Record<AspectType, string> = {
    conjunction: "merges with", trine: "trines", sextile: "sextiles",
    square: "squares", opposition: "opposes",
  };
  const BADGES: Record<AspectType, string> = {
    conjunction: "DIRECT", trine: "FLOW", sextile: "LIFT", square: "FRICTION", opposition: "TENSION",
  };

  for (const natal of natalPoints) {
    for (const transit of sorted.slice(0, 7)) {
      const aspect = getAspect(transit.sign, natal.sign);
      if (!aspect) continue;

      const isMalefic = MALEFICS.has(transit.planet);
      const positiveAspect =
        aspect === "trine" || aspect === "sextile" ||
        (aspect === "conjunction" && !isMalefic);
      let type: "boost" | "caution" = positiveAspect ? "boost" : "caution";
      if (transit.retrograde) type = "caution";

      const detail =
        ASPECT_BETTING[natal.name]?.[aspect] ||
        `${transit.planet} ${ASPECT_NAMES[aspect]} your natal ${natal.name} in ${natal.sign}`;

      aspects.push({
        transitPlanet: transit.planet,
        natalPoint:    natal.name,
        natalSign:     natal.sign,
        aspect,
        transitSign:   transit.sign,
        retrograde:    transit.retrograde,
        type,
        badge:  (transit.retrograde ? "℞ " : "") + BADGES[aspect],
        detail: detail + (transit.retrograde ? " — retrograde review energy in effect" : ""),
      });
    }
  }

  const boosts   = aspects.filter(a => a.type === "boost").slice(0, 2);
  const cautions = aspects.filter(a => a.type === "caution").slice(0, 2);
  return [...boosts, ...cautions];
}

function computeIntensity(aspects: TransitAspect[], retroCount: number, isVoC: boolean): number {
  let score = 5;
  for (const a of aspects) score += a.type === "boost" ? 0.6 : -0.4;
  score -= retroCount * 0.3;
  if (isVoC) score -= 1;
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

function computeRiskPct(aspects: TransitAspect[], sunSign: string | null): number {
  const base  = sunSign ? ({ Fire: 58, Earth: 38, Air: 52, Water: 47 }[SIGN_ELEMENTS[sunSign]?.element || ""] ?? 50) : 50;
  const boost = aspects.filter(a => a.type === "boost").length;
  const caut  = aspects.filter(a => a.type === "caution").length;
  return Math.max(25, Math.min(80, base + (boost - caut) * 5));
}

function computeLuckyMarkets(
  aspects: TransitAspect[],
  sun: string | null,
  moon: string | null,
): Array<{ label: string; status: string; bg: string; text: string }> {
  const sunEl   = sun  ? SIGN_ELEMENTS[sun]?.element  : null;
  const moonEl  = moon ? SIGN_ELEMENTS[moon]?.element : null;
  const hasJup  = aspects.some(a => a.transitPlanet === "Jupiter" && a.type === "boost");
  const hasMerc = aspects.some(a => a.transitPlanet === "Mercury" && a.type === "boost");
  const hasMars = aspects.some(a => a.transitPlanet === "Mars"    && a.type === "boost");
  const moonTen = aspects.some(a => a.transitPlanet === "Moon"    && a.type === "caution");
  const satCaut = aspects.some(a => a.transitPlanet === "Saturn"  && a.type === "caution");

  const m: Array<{ label: string; status: string; bg: string; text: string }> = [];
  if (hasJup)  m.push({ label: "Parlays",  status: "Aligned",      bg: "bg-emerald-500/90", text: "text-white" });
  if (hasMerc) m.push({ label: "Props",    status: "Sharp",        bg: "bg-emerald-500/90", text: "text-white" });
  if (hasMars) m.push({ label: "Live",     status: "Hot",          bg: "bg-orange-500/90",  text: "text-white" });
  if (sunEl === "Fire")  m.push({ label: "PRA",     status: "Strong",  bg: "bg-emerald-500/90", text: "text-white" });
  if (sunEl === "Earth" || satCaut) m.push({ label: "Totals", status: "Steady", bg: "bg-sky-500/90", text: "text-white" });
  if (moonTen) m.push({ label: "Parlays",  status: "Avoid",        bg: "bg-red-500/90",     text: "text-white" });
  if (moonEl === "Water") m.push({ label: "H2H",   status: "Intuitive", bg: "bg-indigo-500/90", text: "text-white" });

  const defaults = [
    { label: "Spreads", status: "Neutral",  bg: "bg-zinc-500/70",  text: "text-white" },
    { label: "Props",   status: "Aligned",  bg: "bg-amber-500/90", text: "text-white" },
    { label: "Totals",  status: "Neutral",  bg: "bg-zinc-500/70",  text: "text-white" },
  ];
  while (m.length < 3) m.push(defaults[m.length]);
  return m.slice(0, 3);
}

interface DayOutlook {
  date: Date;
  moonSign: string;
  element: string;
  lean: string;
  leanColor: string;
  isToday: boolean;
}

function get7DayOutlook(ephemeris: PlanetPosition[]): DayOutlook[] {
  const moonPlanet = ephemeris.find(p => p.planet === "Moon");
  if (!moonPlanet) return [];

  const moonBaseLong = SIGNS_ORDERED.indexOf(moonPlanet.sign) * 30 + moonPlanet.degree;
  const retroCount   = ephemeris.filter(p => p.retrograde).length;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const date     = addDays(today, i);
    const advanced = ((moonBaseLong + 13.2 * i) % 360 + 360) % 360;
    const moonSign = SIGNS_ORDERED[Math.floor(advanced / 30)];
    const element  = ELEMENT_MAP[moonSign] || "Air";
    const isRetro  = retroCount >= 3;
    const lean =
      isRetro ? "Cautious" :
      element === "Fire"  ? "Aggressive"  :
      element === "Earth" ? "Conservative" :
      element === "Air"   ? "Sharp"        : "Intuitive";
    const leanColor =
      lean === "Aggressive"   ? "text-orange-400" :
      lean === "Conservative" ? "text-emerald-400" :
      lean === "Sharp"        ? "text-sky-400" :
      lean === "Cautious"     ? "text-amber-400" : "text-indigo-400";
    return { date, moonSign, element, lean, leanColor, isToday: i === 0 };
  });
}

function buildNarrative(aspects: TransitAspect[], sun: string | null, ephemeris: PlanetPosition[]): string {
  const boosts   = aspects.filter(a => a.type === "boost");
  const cautions = aspects.filter(a => a.type === "caution");
  const retros   = ephemeris.filter(p => p.retrograde).map(p => p.planet);

  if (!aspects.length) {
    const el = sun ? SIGN_ELEMENTS[sun]?.element : null;
    if (el === "Fire")  return "Fire-dominant chart — bold instincts are sharp. Lean into high-value player props.";
    if (el === "Earth") return "Earth-dominant chart — patient, methodical plays. Totals and spreads over parlays.";
    if (el === "Air")   return "Air-dominant chart — mental clarity peaks. Statistical edges and prop lines.";
    if (el === "Water") return "Water-dominant chart — trust matchup intuition. Individual performer reads are strong.";
    return "Balanced cosmic currents today — steady, calculated plays are favored.";
  }

  const keyBoost  = boosts.find(a => ["Jupiter", "Venus", "Sun"].includes(a.transitPlanet));
  const keyCaution = cautions.find(a => ["Saturn", "Mars", "Pluto"].includes(a.transitPlanet));
  const VERB: Record<AspectType, string> = {
    conjunction: "merges with", trine: "flows into", sextile: "lifts",
    square: "activates", opposition: "challenges",
  };
  const parts: string[] = [];
  if (keyBoost)   parts.push(`${keyBoost.transitPlanet} in ${keyBoost.transitSign} ${VERB[keyBoost.aspect]} your ${keyBoost.natalPoint}`);
  if (keyCaution) parts.push(`${keyCaution.transitPlanet} ${keyCaution.aspect === "square" ? "squares" : "opposes"} your ${keyCaution.natalPoint}`);
  if (retros.length) parts.push(`${retros.slice(0, 2).join(" & ")} retrograde adds review energy`);

  const prefix = boosts.length > cautions.length ? "Strong day for value plays. " :
    cautions.length > boosts.length ? "Proceed with discipline. " : "";
  return prefix + parts.slice(0, 2).join(". ") + ".";
}

// ── Component ─────────────────────────────────────────────────────────────────
const PersonalCosmicContent = () => {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["personal-cosmic-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("sun_sign, moon_sign, rising_sign, display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 300_000,
  });

  const { data: ephemeris = [] } = useCurrentEphemeris(new Date());
  const { data: lunarData }      = useLunarMetrics(new Date());

  if (!user) {
    return (
      <div className="px-4 py-12 text-center space-y-3">
        <Sparkles className="h-10 w-10 text-[#a78bda] mx-auto" />
        <p className="text-sm text-muted-foreground">Log in to see your personal cosmic profile.</p>
        <button onClick={() => navigate("/auth")} className="text-sm text-primary hover:underline">Sign In</button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-12 flex justify-center">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const sun    = profile?.sun_sign    ?? null;
  const moon   = profile?.moon_sign   ?? null;
  const rising = profile?.rising_sign ?? null;
  const hasChart = sun || moon || rising;

  const signs = [
    { label: "Sun",    icon: Sun,      sign: sun,    color: SIGN_ELEMENTS[sun    || ""]?.color || "text-orange-400" },
    { label: "Moon",   icon: Moon,     sign: moon,   color: SIGN_ELEMENTS[moon   || ""]?.color || "text-indigo-400" },
    { label: "Rising", icon: Sparkles, sign: rising, color: SIGN_ELEMENTS[rising || ""]?.color || "text-amber-400"  },
  ];

  const aspects     = computeTransitAspects(sun, moon, rising, ephemeris);
  const retroCount  = ephemeris.filter(p => p.retrograde).length;
  const vocRaw      = lunarData?.void_of_course || lunarData?.voc;
  const isVoC       = vocRaw === true || vocRaw?.is_voc;
  const intensity   = computeIntensity(aspects, retroCount, !!isVoC);
  const riskPct     = computeRiskPct(aspects, sun);
  const markets     = computeLuckyMarkets(aspects, sun, moon);
  const narrative   = buildNarrative(aspects, sun, ephemeris);
  const outlook     = get7DayOutlook(ephemeris);

  const intensityLabel = intensity >= 7.5 ? "High Alignment" : intensity >= 5 ? "Moderate Energy" : "Challenging Day";
  const intensityColor = intensity >= 7.5 ? "text-emerald-400" : intensity >= 5 ? "text-amber-400" : "text-red-400";
  const intensityRing  = intensity >= 7.5 ? "border-emerald-400/60" : intensity >= 5 ? "border-amber-400/60" : "border-red-400/60";

  if (!hasChart) {
    return (
      <div className="px-4 py-6 space-y-5 max-w-2xl mx-auto">
        <Card className={glassCard}>
          <CardContent className="pt-6 text-center space-y-4">
            <Sparkles className="h-10 w-10 text-[#a78bda] mx-auto" />
            <div>
              <p className={cn("text-sm font-semibold mb-1", labelColor)}>Set Up Your Cosmic Profile</p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                Add your Sun, Moon, and Rising signs in Settings to unlock personalized transit readings and betting insights.
              </p>
            </div>
            <button
              onClick={() => navigate("/settings")}
              className={cn("flex items-center gap-2 mx-auto text-xs font-semibold rounded-xl px-4 py-2.5 hover:opacity-90 transition-opacity", labelColor, innerCard)}
            >
              <Edit2 className="h-3.5 w-3.5" /> Add Your Birth Chart
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-5 max-w-2xl mx-auto">

      {/* Natal Chart Profile */}
      <Card className={glassCard}>
        <CardHeader className="pb-3">
          <CardTitle className={cn("text-lg flex items-center justify-between", labelColor)}>
            <span className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#a78bda]" />
              {profile?.display_name ? `${profile.display_name}'s Chart` : "Your Natal Chart"}
            </span>
            <button
              onClick={() => navigate("/settings")}
              className="p-1 text-muted-foreground hover:text-[#6b4c9a] dark:hover:text-[#c4a8f0] transition-colors"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {signs.map((s) => (
              <div key={s.label} className={cn("flex flex-col items-center gap-1.5 p-3", innerCard)}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
                {s.sign ? (
                  <>
                    <span className="text-2xl leading-none">{SIGN_SYMBOLS[s.sign] || "✦"}</span>
                    <span className={cn("text-sm font-semibold", labelColor)}>{s.sign}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground/50 italic">Not set</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cosmic Intensity Score + Today for You */}
      <Card className={glassCard}>
        <CardContent className="pt-5 pb-4 space-y-3">
          <div className="flex items-start gap-4">
            {/* Intensity gauge */}
            <div className={cn(
              "flex-shrink-0 h-16 w-16 rounded-full border-2 flex flex-col items-center justify-center",
              intensityRing, innerCard,
            )}>
              <span className={cn("text-xl font-bold font-mono leading-none", intensityColor)}>
                {intensity.toFixed(1)}
              </span>
              <span className="text-[8px] text-muted-foreground mt-0.5">/ 10</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Activity className={cn("h-3.5 w-3.5", intensityColor)} />
                <span className={cn("text-xs font-bold uppercase tracking-wide", intensityColor)}>
                  {intensityLabel}
                </span>
              </div>
              <p className="text-xs text-foreground/80 leading-relaxed">{narrative}</p>
            </div>
          </div>
          {isVoC && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-500 font-medium">
              ⚠ Void-of-Course Moon active — avoid initiating new bets
            </div>
          )}
          {retroCount > 0 && (
            <div className={cn("flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground", innerCard)}>
              ℞ {retroCount} planet{retroCount > 1 ? "s" : ""} retrograde — review and introspection energy is elevated
            </div>
          )}
        </CardContent>
      </Card>

      {/* 7-Day Cosmic Window */}
      {outlook.length > 0 && (
        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className={cn("text-base flex items-center gap-2", labelColor)}>
              <CalendarDays className="h-4 w-4 text-[#a78bda]" />
              7-Day Cosmic Window
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {outlook.map((day, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 min-w-[62px]",
                    innerCard,
                    day.isToday && "ring-1 ring-primary/30 border-primary/40",
                  )}
                >
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {day.isToday ? "Today" : format(day.date, "EEE")}
                  </span>
                  <span className="text-lg leading-none">{SIGN_SYMBOLS[day.moonSign] || "☽"}</span>
                  <span className="text-[10px] text-muted-foreground">{day.moonSign.slice(0, 3)}</span>
                  <span className={cn("text-[10px] font-semibold", day.leanColor)}>{day.lean}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 italic">
              ☽ Moon sign per day — sets the emotional and intuitive betting tone
            </p>
          </CardContent>
        </Card>
      )}

      {/* Your Markets Today */}
      <Card className={glassCard}>
        <CardHeader className="pb-3">
          <CardTitle className={cn("text-lg flex items-center gap-2", labelColor)}>
            <Zap className="h-5 w-5 text-[#a78bda]" />
            Your Markets Today
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {markets.map((m) => (
              <div key={m.label} className={cn("flex-1 flex flex-col items-center gap-1.5 p-3", innerCard)}>
                <span className={cn("text-sm font-semibold", labelColor)}>{m.label}</span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${m.bg} ${m.text}`}>
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cosmic Risk Level */}
      <Card className={glassCard}>
        <CardHeader className="pb-3">
          <CardTitle className={cn("text-lg flex items-center gap-2", labelColor)}>
            <Shield className="h-5 w-5 text-[#a78bda]" />
            Cosmic Risk Level
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="relative h-4 rounded-full overflow-hidden bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500">
              <div
                className="absolute top-0 h-full w-1.5 bg-white rounded-full shadow-md border border-[#6b4c9a]/40 transition-all"
                style={{ left: `${Math.min(Math.max(riskPct - 1, 2), 97)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Conservative</span>
              <span className={cn("font-medium", labelColor)}>
                {riskPct < 40 ? "Conservative" : riskPct < 60 ? "Moderate" : "Aggressive"}
              </span>
              <span>Aggressive</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transit Aspects to Your Chart */}
      {aspects.length > 0 && (
        <Card className={glassCard}>
          <CardHeader className="pb-3">
            <CardTitle className={cn("text-lg flex items-center gap-2", labelColor)}>
              <TrendingUp className="h-5 w-5 text-[#a78bda]" />
              Transits to Your Chart
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {aspects.map((t, i) => (
              <div key={i} className={cn("flex items-start gap-3 p-3", innerCard)}>
                <div className="mt-0.5 flex-shrink-0">
                  {t.type === "boost"
                    ? <TrendingUp  className="h-4 w-4 text-emerald-500" />
                    : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className={cn("text-sm font-semibold", labelColor)}>{t.transitPlanet}</span>
                    <span className="text-xs text-muted-foreground">in {t.transitSign}</span>
                    <span className="text-xs text-muted-foreground">→ your {t.natalPoint}</span>
                    <Badge
                      className={cn(
                        "ml-auto text-[10px] px-1.5 py-0 flex-shrink-0",
                        t.type === "boost"
                          ? "bg-emerald-500/90 text-white border-emerald-400/50"
                          : "bg-amber-500/90 text-white border-amber-400/50",
                      )}
                    >
                      {t.badge}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Precision upgrade CTA */}
      <div className={cn("flex items-center gap-3 p-3", innerCard)}>
        <Flame className="h-4 w-4 text-[#a78bda] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className={cn("text-xs font-semibold", labelColor)}>Unlock Precise Transits</p>
          <p className="text-[10px] text-muted-foreground">
            Add your birth date in Settings for exact degree transit calculations and house placements.
          </p>
        </div>
        <button
          onClick={() => navigate("/settings")}
          className={cn("text-[10px] font-semibold flex-shrink-0 px-2.5 py-1 rounded-lg", labelColor, innerCard)}
        >
          Add
        </button>
      </div>

    </div>
  );
};

export default PersonalCosmicContent;
