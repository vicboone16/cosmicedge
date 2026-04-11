import { Sun, Moon, Sparkles, TrendingUp, TrendingDown, Shield, Flame, Zap, AlertTriangle, Edit2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const glassCard = "backdrop-blur-xl bg-[#e8dff5]/40 border border-[#c4b0e0]/40 shadow-lg";

const SIGN_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

const SIGN_ELEMENTS: Record<string, { element: string; color: string }> = {
  Aries: { element: "Fire", color: "text-orange-400" },
  Leo: { element: "Fire", color: "text-orange-400" },
  Sagittarius: { element: "Fire", color: "text-orange-400" },
  Taurus: { element: "Earth", color: "text-emerald-500" },
  Virgo: { element: "Earth", color: "text-emerald-500" },
  Capricorn: { element: "Earth", color: "text-emerald-500" },
  Gemini: { element: "Air", color: "text-sky-400" },
  Libra: { element: "Air", color: "text-sky-400" },
  Aquarius: { element: "Air", color: "text-sky-400" },
  Cancer: { element: "Water", color: "text-indigo-400" },
  Scorpio: { element: "Water", color: "text-indigo-400" },
  Pisces: { element: "Water", color: "text-indigo-400" },
};

// Derive today's cosmic advice from the user's chart
function deriveCosmicAdvice(sun: string | null, moon: string | null, rising: string | null) {
  const sunEl = sun ? SIGN_ELEMENTS[sun]?.element : null;
  const moonEl = moon ? SIGN_ELEMENTS[moon]?.element : null;

  const luckyMarkets: { label: string; status: string; bg: string; text: string }[] = [];
  const transits: { planet: string; aspect: string; badge: string; type: "boost" | "caution"; detail: string }[] = [];
  let energyDesc = "Balanced cosmic energy today — trust your analysis.";
  let riskPct = 50;

  if (sunEl === "Fire") {
    luckyMarkets.push({ label: "PRA", status: "Strong", bg: "bg-emerald-500/90", text: "text-white" });
    transits.push({ planet: "Mars", aspect: "activates your Sun", badge: "BOOST", type: "boost", detail: "Fire energy amplified — bold instincts on player props." });
    riskPct = 62;
    energyDesc = "Fire-dominant chart — bold instincts are sharp today. Lean into high-value player props.";
  } else if (sunEl === "Earth") {
    luckyMarkets.push({ label: "Totals", status: "Strong", bg: "bg-emerald-500/90", text: "text-white" });
    transits.push({ planet: "Saturn", aspect: "grounds your Sun", badge: "STEADY", type: "boost", detail: "Earth energy favors disciplined, value-based plays." });
    riskPct = 38;
    energyDesc = "Earth-dominant chart — patient, methodical plays. Totals and spreads over parlays.";
  } else if (sunEl === "Air") {
    luckyMarkets.push({ label: "Assists", status: "Aligned", bg: "bg-amber-500/90", text: "text-white" });
    transits.push({ planet: "Mercury", aspect: "conjuncts your Sun", badge: "SHARP", type: "boost", detail: "Air energy sharpens pattern recognition — trust statistical edges." });
    riskPct = 55;
    energyDesc = "Air-dominant chart — mental clarity is at its peak. Statistical edges and prop lines.";
  } else if (sunEl === "Water") {
    luckyMarkets.push({ label: "Points", status: "Aligned", bg: "bg-amber-500/90", text: "text-white" });
    transits.push({ planet: "Neptune", aspect: "trines your Moon", badge: "INTUITIVE", type: "boost", detail: "Water energy enhances intuition — trust gut reads on individual performers." });
    riskPct = 48;
    energyDesc = "Water-dominant chart — emotional reads are sharp. Trust matchup intuition.";
  }

  if (moonEl === "Fire" && sunEl !== "Fire") {
    luckyMarkets.push({ label: "Live Bets", status: "Hot", bg: "bg-orange-500/90", text: "text-white" });
    transits.push({ planet: "Mars", aspect: "energizes your Moon", badge: "LIVE", type: "boost", detail: "Live-game momentum is in your favor — watch for in-game swings." });
  } else if (moonEl === "Water") {
    luckyMarkets.push({ label: "3PM", status: "Avoid", bg: "bg-red-500/90", text: "text-white" });
    transits.push({ planet: "Saturn", aspect: "squares your Moon", badge: "CAUTION", type: "caution", detail: "Emotional bets may cloud judgement — stick to your model." });
  }

  // Ensure we always have 3 lucky markets
  const defaults = [
    { label: "Spreads", status: "Neutral", bg: "bg-zinc-500/70", text: "text-white" },
    { label: "Props", status: "Aligned", bg: "bg-amber-500/90", text: "text-white" },
    { label: "Parlays", status: "Avoid", bg: "bg-red-500/90", text: "text-white" },
  ];
  while (luckyMarkets.length < 3) luckyMarkets.push(defaults[luckyMarkets.length]);

  return { luckyMarkets: luckyMarkets.slice(0, 3), transits, energyDesc, riskPct };
}

const PersonalCosmicContent = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["personal-cosmic-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("sun_sign, moon_sign, rising_sign, display_name")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 300_000,
  });

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

  const sun = profile?.sun_sign ?? null;
  const moon = profile?.moon_sign ?? null;
  const rising = profile?.rising_sign ?? null;
  const hasChart = sun || moon || rising;

  const signs = [
    { label: "Sun", icon: Sun, sign: sun, color: SIGN_ELEMENTS[sun || ""]?.color || "text-orange-400" },
    { label: "Moon", icon: Moon, sign: moon, color: SIGN_ELEMENTS[moon || ""]?.color || "text-indigo-400" },
    { label: "Rising", icon: Sparkles, sign: rising, color: SIGN_ELEMENTS[rising || ""]?.color || "text-amber-400" },
  ];

  const { luckyMarkets, transits, energyDesc, riskPct } = deriveCosmicAdvice(sun, moon, rising);

  if (!hasChart) {
    return (
      <div className="px-4 py-6 space-y-5 max-w-2xl mx-auto">
        <Card className={glassCard}>
          <CardContent className="pt-6 text-center space-y-4">
            <Sparkles className="h-10 w-10 text-[#a78bda] mx-auto" />
            <div>
              <p className="text-sm font-semibold text-[#6b4c9a] mb-1">Set Up Your Cosmic Profile</p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                Add your Sun, Moon, and Rising signs in your profile settings to unlock personalized cosmic betting insights.
              </p>
            </div>
            <button
              onClick={() => navigate("/settings")}
              className="flex items-center gap-2 mx-auto text-xs font-semibold text-[#6b4c9a] bg-[#f3eef9] border border-[#d4c4ec]/60 rounded-xl px-4 py-2.5 hover:bg-[#e8dff5] transition-colors"
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
      {/* Cosmic Profile */}
      <Card className={glassCard}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between text-[#6b4c9a]">
            <span className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#a78bda]" />
              {profile?.display_name ? `${profile.display_name}'s Cosmic Profile` : "Your Cosmic Profile"}
            </span>
            <button onClick={() => navigate("/settings")} className="p-1 text-muted-foreground hover:text-[#6b4c9a] transition-colors">
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {signs.map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1.5 rounded-xl bg-[#f3eef9]/60 p-3 border border-[#d4c4ec]/50">
                <s.icon className={`h-5 w-5 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
                {s.sign ? (
                  <>
                    <span className="text-2xl leading-none">{SIGN_SYMBOLS[s.sign] || "✦"}</span>
                    <span className="text-sm font-semibold text-[#6b4c9a]">{s.sign}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground/50 italic">Not set</span>
                )}
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-[#f3eef9]/60 border border-[#d4c4ec]/50 p-3">
            <p className="text-xs font-medium text-[#8b6fbf] mb-1">Today's Energy</p>
            <p className="text-sm text-foreground/80">{energyDesc}</p>
          </div>
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
            {sun && `${sun} Sun`}{moon && ` · ${moon} Moon`} alignment today — lean into{" "}
            <span className="font-semibold text-[#7c5dac]">{luckyMarkets[0]?.label || "player props"}</span>.{" "}
            {transits[0]?.detail || "Trust statistical edges over gut instinct today."}{" "}
            Best window: <span className="font-semibold text-[#7c5dac]">
              {riskPct >= 55 ? "evening slate for prime-time edges" : "early slate with value lines"}
            </span>.
          </p>
        </CardContent>
      </Card>

      {/* Lucky Markets */}
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
          <CardTitle className="text-lg flex items-center gap-2 text-[#6b4c9a]">
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
              <span className="font-medium text-[#7c5dac]">
                {riskPct < 40 ? "Conservative" : riskPct < 60 ? "Moderate" : "Aggressive"}
              </span>
              <span>Aggressive</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Transits */}
      {transits.length > 0 && (
        <Card className={glassCard}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-[#6b4c9a]">
              <TrendingUp className="h-5 w-5 text-[#a78bda]" />
              Personal Transits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {transits.map((t, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl bg-[#f3eef9]/60 border border-[#d4c4ec]/50 p-3">
                <div className="mt-0.5">
                  {t.type === "boost" ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-[#6b4c9a]">{t.planet}</span>
                    <span className="text-xs text-muted-foreground">{t.aspect}</span>
                    <Badge
                      className={`ml-auto text-[10px] px-1.5 py-0 ${
                        t.type === "boost"
                          ? "bg-emerald-500/90 text-white border-emerald-400/50"
                          : "bg-amber-500/90 text-white border-amber-400/50"
                      }`}
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
    </div>
  );
};

export default PersonalCosmicContent;
