import { Sun, Moon, Sparkles, TrendingUp, TrendingDown, Shield, Flame, Zap, AlertTriangle, Edit2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";

const glassCard = "backdrop-blur-xl bg-[#e8dff5]/40 border border-[#c4b0e0]/40 shadow-lg";

/* ─── Static astrological context ─── */
const SIGN_EMOJIS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

const ELEMENT: Record<string, string> = {
  Aries: "Fire", Leo: "Fire", Sagittarius: "Fire",
  Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth",
  Gemini: "Air", Libra: "Air", Aquarius: "Air",
  Cancer: "Water", Scorpio: "Water", Pisces: "Water",
};

const SIGN_BETTING_TRAIT: Record<string, string> = {
  Aries: "Bold, instinct-first bets — thrives on live plays.",
  Taurus: "Patient, value-driven — waits for the best line.",
  Gemini: "Data-hungry, multi-game spreader.",
  Cancer: "Intuition-led, excellent on player props.",
  Leo: "Confident parlay builder, loves bold calls.",
  Virgo: "Analytical, high hit-rate on under bets.",
  Libra: "Balanced bettor — strong on spread value.",
  Scorpio: "Contrarian edge, sharp fade instincts.",
  Sagittarius: "Risk-taker — loves exotic parlays.",
  Capricorn: "Disciplined bankroll manager, long-run ROI.",
  Aquarius: "Model-first bettor, trusts the data.",
  Pisces: "Intuitive, trend-chasing, great on momentum plays.",
};

const PLANET_BOOSTS: Record<string, { markets: string[]; desc: string }> = {
  Aries: { markets: ["PRA", "Points"], desc: "Mars rules → aggression markets are amplified today." },
  Taurus: { markets: ["Rebounds", "Blocks"], desc: "Venus rules → grounded stats like boards and defense." },
  Gemini: { markets: ["Assists", "Steals"], desc: "Mercury rules → quick hands, playmaking markets hot." },
  Cancer: { markets: ["PRA"], desc: "Moon rules → emotional depth in combo stats." },
  Leo: { markets: ["Points", "PRA"], desc: "Sun rules → star-player markets are lit up today." },
  Virgo: { markets: ["Rebounds", "Points"], desc: "Mercury rules → precise under-the-line opportunities." },
  Libra: { markets: ["Pts+Ast", "PRA"], desc: "Venus rules → balanced player combo stats." },
  Scorpio: { markets: ["Steals", "Blocks"], desc: "Pluto rules → defensive and disruptive plays." },
  Sagittarius: { markets: ["3PM", "PRA"], desc: "Jupiter rules → long-range, high-ceiling plays." },
  Capricorn: { markets: ["Rebounds", "Assists"], desc: "Saturn rules → workhorse stats at fair prices." },
  Aquarius: { markets: ["Assists", "Pts+Ast"], desc: "Uranus rules → playmaker anomalies and assists." },
  Pisces: { markets: ["PRA", "Points"], desc: "Neptune rules → momentum and flow-state players." },
};

/* ─── Today's transits (static but sign-contextual) ─── */
function getPersonalTransits(sunSign: string | null) {
  const base = [
    { planet: "Jupiter", aspect: "sextile the collective", badge: "BOOST", type: "boost" as const, detail: "Expansion energy — confidence in multi-leg plays." },
    { planet: "Saturn", aspect: "square the Moon", badge: "CAUTION", type: "caution" as const, detail: "Discipline check — avoid emotional over-betting." },
    { planet: "Mars", aspect: "trine Mercury", badge: "BOOST", type: "boost" as const, detail: "Sharp instincts — trust quick reads on player props." },
  ];
  if (sunSign === "Aries" || sunSign === "Leo" || sunSign === "Sagittarius") {
    return [
      { planet: "Sun", aspect: "fire grand trine", badge: "BOOST", type: "boost" as const, detail: "Blazing fire energy — bold plays and star-player bets are aligned." },
      ...base.slice(1),
    ];
  }
  return base;
}

/* ─── Skeleton loader ─── */
function SkeletonCard() {
  return (
    <Card className={glassCard}>
      <CardContent className="pt-6 space-y-3">
        <div className="h-4 w-1/2 bg-[#d4c4ec]/30 rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-[#d4c4ec]/20 rounded animate-pulse" />
        <div className="h-3 w-2/3 bg-[#d4c4ec]/20 rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

/* ─── Empty state ─── */
function NoBirthDataCard() {
  const navigate = useNavigate();
  return (
    <Card className={glassCard}>
      <CardContent className="pt-6 space-y-3 text-center">
        <Sparkles className="h-8 w-8 text-[#a78bda]/50 mx-auto" />
        <p className="text-sm font-semibold text-[#6b4c9a]">Your Cosmic Profile is Empty</p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
          Add your sun, moon, and rising sign in Profile Settings to unlock personalized cosmic betting insights.
        </p>
        <button
          onClick={() => navigate("/profile")}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#a78bda]/20 border border-[#d4c4ec]/50 text-xs font-semibold text-[#6b4c9a] hover:bg-[#a78bda]/30 transition-all"
        >
          <Edit2 className="h-3.5 w-3.5" />
          Update Profile
        </button>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════ */
const PersonalCosmicContent = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  /* Pull the real user profile — sun_sign, moon_sign, rising_sign */
  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile-cosmic", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await (supabase as any)
        .from("user_profiles")
        .select("sun_sign, moon_sign, rising_sign, display_name, birth_date")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="px-4 py-6 space-y-5 max-w-2xl mx-auto">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const sunSign = profile?.sun_sign ?? null;
  const moonSign = profile?.moon_sign ?? null;
  const risingSign = profile?.rising_sign ?? null;
  const hasData = !!(sunSign || moonSign || risingSign);

  if (!hasData) {
    return (
      <div className="px-4 py-6 max-w-2xl mx-auto">
        <NoBirthDataCard />
      </div>
    );
  }

  const signs = [
    { label: "Sun", icon: Sun, sign: sunSign, color: "text-orange-400" },
    { label: "Moon", icon: Moon, sign: moonSign, color: "text-indigo-400" },
    { label: "Rising", icon: Sparkles, sign: risingSign, color: "text-amber-400" },
  ].filter(s => !!s.sign);

  const sunEl = sunSign ? ELEMENT[sunSign] : null;
  const moonEl = moonSign ? ELEMENT[moonSign] : null;
  const risingEl = risingSign ? ELEMENT[risingSign] : null;
  const elementSummary = [sunEl, moonEl, risingEl].filter(Boolean).join("-");

  const sunBoost = sunSign ? PLANET_BOOSTS[sunSign] : null;
  const bettingTrait = sunSign ? SIGN_BETTING_TRAIT[sunSign] : null;
  const personalTransits = getPersonalTransits(sunSign);

  const luckyMarkets = sunBoost
    ? [
        { label: sunBoost.markets[0], status: "Strong", bg: "bg-emerald-500/90", text: "text-white" },
        { label: sunBoost.markets[1] ?? "PRA", status: "Aligned", bg: "bg-amber-500/90", text: "text-white" },
        { label: "3PM", status: risingSign === "Sagittarius" ? "Strong" : "Neutral", bg: risingSign === "Sagittarius" ? "bg-emerald-500/90" : "bg-zinc-500/60", text: "text-white" },
      ]
    : [];

  return (
    <div className="px-4 py-6 space-y-5 max-w-2xl mx-auto">

      {/* Cosmic Profile */}
      <Card className={glassCard}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2 text-[#6b4c9a]">
              <Sparkles className="h-5 w-5 text-[#a78bda]" />
              Your Cosmic Profile
            </CardTitle>
            <button
              onClick={() => navigate("/profile")}
              className="p-1.5 rounded-lg hover:bg-[#e8dff5]/60 transition-colors"
              title="Edit profile"
            >
              <Edit2 className="h-3.5 w-3.5 text-[#a78bda]" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`grid gap-3 ${signs.length === 3 ? "grid-cols-3" : signs.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {signs.map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1.5 rounded-xl bg-[#f3eef9]/60 p-3 border border-[#d4c4ec]/50">
                <s.icon className={`h-5 w-5 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className="text-2xl leading-none">{SIGN_EMOJIS[s.sign!] ?? "✦"}</span>
                <span className="text-sm font-semibold text-[#6b4c9a]">{s.sign}</span>
              </div>
            ))}
          </div>

          {elementSummary && (
            <div className="rounded-xl bg-[#f3eef9]/60 border border-[#d4c4ec]/50 p-3 space-y-1">
              <p className="text-xs font-medium text-[#8b6fbf]">Elemental Signature — {elementSummary}</p>
              <p className="text-sm text-foreground/80">{bettingTrait ?? "Cosmic signature unlocked."}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Betting Horoscope */}
      <Card className={glassCard}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-[#6b4c9a]">
            <Flame className="h-5 w-5 text-[#a78bda]" />
            Your Betting Horoscope
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {sunBoost?.desc ?? "Today's cosmic currents are active."}{" "}
            {moonSign && `Your ${moonSign} Moon adds emotional depth — watch for trap lines driven by public sentiment. `}
            {risingSign && `${risingSign} Rising amplifies your first read — trust early instincts on player matchups.`}
          </p>
        </CardContent>
      </Card>

      {/* Lucky Markets */}
      {luckyMarkets.length > 0 && (
        <Card className={glassCard}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-[#6b4c9a]">
              <Zap className="h-5 w-5 text-[#a78bda]" />
              Lucky Markets Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {luckyMarkets.map((m) => (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5 rounded-xl bg-[#f3eef9]/60 border border-[#d4c4ec]/50 p-3">
                  <span className="text-sm font-semibold text-[#6b4c9a]">{m.label}</span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${m.bg} ${m.text}`}>{m.status}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cosmic Risk Level */}
      <Card className={glassCard}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-[#6b4c9a]">
            <Shield className="h-5 w-5 text-[#a78bda]" />
            Cosmic Risk Level
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const riskEl = sunEl === "Fire" ? 0.72 : sunEl === "Air" ? 0.55 : sunEl === "Earth" ? 0.28 : 0.42;
            const riskLabel = riskEl > 0.65 ? "Aggressive" : riskEl > 0.4 ? "Moderate" : "Conservative";
            return (
              <div className="space-y-2">
                <div className="relative h-4 rounded-full overflow-hidden bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500">
                  <div
                    className="absolute top-0 h-full w-1.5 bg-white rounded-full shadow-md border border-[#6b4c9a]/40"
                    style={{ left: `${Math.round(riskEl * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Conservative</span>
                  <span className="font-semibold text-[#7c5dac]">{riskLabel}</span>
                  <span>Aggressive</span>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Personal Transits */}
      <Card className={glassCard}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-[#6b4c9a]">
            <TrendingUp className="h-5 w-5 text-[#a78bda]" />
            Personal Transits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {personalTransits.map((t, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl bg-[#f3eef9]/60 border border-[#d4c4ec]/50 p-3">
              <div className="mt-0.5">
                {t.type === "boost"
                  ? <TrendingUp className="h-4 w-4 text-emerald-500" />
                  : <AlertTriangle className="h-4 w-4 text-amber-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-[#6b4c9a]">{t.planet}</span>
                  <span className="text-xs text-muted-foreground">{t.aspect}</span>
                  <Badge className={`ml-auto text-[10px] px-1.5 py-0 ${
                    t.type === "boost"
                      ? "bg-emerald-500/90 text-white border-emerald-400/50"
                      : "bg-amber-500/90 text-white border-amber-400/50"
                  }`}>
                    {t.badge}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{t.detail}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default PersonalCosmicContent;
