import { Sun, Moon, Sparkles, TrendingUp, TrendingDown, Shield, Flame, Zap, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const glassCard = "backdrop-blur-xl bg-[#e8dff5]/40 border border-[#c4b0e0]/40 shadow-lg";

const signs = [
  { label: "Sun", icon: Sun, sign: "Aries", emoji: "♈", color: "text-orange-400" },
  { label: "Moon", icon: Moon, sign: "Scorpio", emoji: "♏", color: "text-indigo-400" },
  { label: "Rising", icon: Sparkles, sign: "Leo", emoji: "♌", color: "text-amber-400" },
];

const luckyMarkets = [
  { label: "PRA", status: "Strong", bg: "bg-emerald-500/90", text: "text-white" },
  { label: "Points", status: "Aligned", bg: "bg-amber-500/90", text: "text-white" },
  { label: "3PM", status: "Avoid", bg: "bg-red-500/90", text: "text-white" },
];

const personalTransits = [
  { planet: "Jupiter", aspect: "trine your Sun", badge: "BOOST", type: "boost" as const, detail: "Confidence & risk-taking amplified today" },
  { planet: "Saturn", aspect: "square your Moon", badge: "CAUTION", type: "caution" as const, detail: "Emotional bets may cloud judgement" },
  { planet: "Venus", aspect: "conjunct your Rising", badge: "BOOST", type: "boost" as const, detail: "Charm factor — trust gut reads on player props" },
];

const PersonalCosmicContent = () => {
  return (
    <div className="px-4 py-6 space-y-5 max-w-2xl mx-auto">
      {/* Cosmic Profile */}
      <Card className={glassCard}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-[#6b4c9a]">
            <Sparkles className="h-5 w-5 text-[#a78bda]" />
            Your Cosmic Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {signs.map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1.5 rounded-xl bg-[#f3eef9]/60 p-3 border border-[#d4c4ec]/50">
                <s.icon className={`h-5 w-5 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className="text-2xl leading-none">{s.emoji}</span>
                <span className="text-sm font-semibold text-[#6b4c9a]">{s.sign}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-[#f3eef9]/60 border border-[#d4c4ec]/50 p-3">
            <p className="text-xs font-medium text-[#8b6fbf] mb-1">Today's Energy</p>
            <p className="text-sm text-foreground/80">
              Fire-Water-Fire trine — bold instincts tempered by deep emotional reads. Trust first impressions on player matchups today.
            </p>
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
            Mars activates your risk sector today — lean into <span className="font-semibold text-[#7c5dac]">player props over spreads</span>. 
            Jupiter's trine to your Sun amplifies confidence, but Saturn's square warns against emotional doubles-down. 
            Best window: <span className="font-semibold text-[#7c5dac]">evening slate after 7 PM</span> when the Moon enters your 5th house of speculation.
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
                className="absolute top-0 h-full w-1.5 bg-white rounded-full shadow-md border border-[#6b4c9a]/40"
                style={{ left: "42%" }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Conservative</span>
              <span className="font-medium text-[#7c5dac]">Moderate</span>
              <span>Aggressive</span>
            </div>
          </div>
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
    </div>
  );
};

export default PersonalCosmicContent;
