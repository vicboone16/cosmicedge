import { useQuery } from "@tanstack/react-query";
import { Star, Crown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getTraditionalRuler,
  getEssentialDignity,
  getDignityColor,
  getHoraryVerdict,
  getOppositeSign,
  getSignAtHouse,
} from "@/lib/horary-utils";

interface Props {
  gameId: string;
  startTime: string;
  venueLat: number | null;
  venueLng: number | null;
  homeAbbr: string;
  awayAbbr: string;
}

const ZODIAC_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

export function HoraryChartSection({ gameId, startTime, venueLat, venueLng, homeAbbr, awayAbbr }: Props) {
  // 1. AstroVisor base horary chart
  const { data: horaryData, isLoading: horaryLoading } = useQuery({
    queryKey: ["horary", gameId],
    queryFn: async () => {
      const params = new URLSearchParams({
        mode: "horary",
        entity_id: gameId,
        entity_type: "game",
        transit_date: startTime.slice(0, 10),
        lat: String(venueLat || 40.7),
        lng: String(venueLng || -74.0),
      });
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrovisor?${params}`,
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
    enabled: !!gameId,
    staleTime: 30 * 60 * 1000,
  });

  // 2. Astrology API enhanced horary analysis
  const { data: enhancedHorary } = useQuery({
    queryKey: ["horary-enhanced", gameId],
    queryFn: async () => {
      const params = new URLSearchParams({
        mode: "horary_analyze",
        entity_id: gameId,
        transit_date: startTime.slice(0, 10),
        lat: String(venueLat || 40.7),
        lng: String(venueLng || -74.0),
        question: `Will ${homeAbbr} (home) beat ${awayAbbr} (away)?`,
        category: "general",
      });
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrologyapi?${params}`,
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
    enabled: !!gameId,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  // 3. Astrology API dignities for game time
  const { data: lunarData } = useQuery({
    queryKey: ["horary-lunar", gameId],
    queryFn: async () => {
      const params = new URLSearchParams({
        mode: "lunar_metrics",
        transit_date: startTime.slice(0, 10),
        entity_id: gameId,
        lat: String(venueLat || 40.7),
        lng: String(venueLng || -74.0),
      });
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrologyapi?${params}`,
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
    enabled: !!gameId,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const gameDate = new Date(startTime);

  // Use API data if available, otherwise approximate
  let ascSign = "Aries";
  let chartFromAPI = false;

  if (horaryData?.result?.houses) {
    const h1 = horaryData.result.houses.find((h: any) => h.house === 1);
    if (h1?.sign) {
      ascSign = h1.sign;
      chartFromAPI = true;
    }
  }

  if (!chartFromAPI) {
    const hour = gameDate.getHours();
    const signNames = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
    ascSign = signNames[Math.floor((hour / 24) * 12) % 12];
  }

  const descSign = getOppositeSign(ascSign);
  const icSign = getSignAtHouse(ascSign, 3);
  const mcSign = getSignAtHouse(ascSign, 9);

  const houses = [
    { house: 1, label: "Ascendant", team: homeAbbr, role: "Home Team", sign: ascSign },
    { house: 7, label: "Descendant", team: awayAbbr, role: "Away Team", sign: descSign },
    { house: 4, label: "IC", team: null, role: "End of Matter", sign: icSign },
    { house: 10, label: "MC", team: null, role: "Outcome", sign: mcSign },
  ];

  const homeLord = getTraditionalRuler(ascSign);
  const awayLord = getTraditionalRuler(descSign);
  const homeDignity = getEssentialDignity(homeLord, ascSign);
  const awayDignity = getEssentialDignity(awayLord, descSign);

  // Enhanced analysis data — must be before verdict computation
  const enhancedResult = enhancedHorary?.result;
  const lunarResult = lunarData?.result;
  const voc = lunarResult?.void_of_course || lunarResult?.voc;
  const moonPhase = lunarResult?.moon_phase || lunarResult?.phase;

  // Determine moon sign from lunar data
  const moonSign = lunarResult?.moon_sign || lunarResult?.sign || null;
  const moonPhaseStr = moonPhase ? (typeof moonPhase === "string" ? moonPhase : moonPhase.name || moonPhase.phase || "") : undefined;
  const isVoc = voc === true || voc?.is_voc === true;

  const verdict = getHoraryVerdict(homeDignity, awayDignity, undefined, {
    homeLord,
    awayLord,
    homeLordSign: ascSign,
    awayLordSign: descSign,
    ascSign,
    descSign,
    mcSign,
    icSign,
    moonSign: moonSign || undefined,
    moonPhase: moonPhaseStr,
    voc: isVoc,
  });

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Crown className="h-3.5 w-3.5" />
        Horary Chart Analysis
        {horaryLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </h3>
      <div className="cosmic-card rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          {chartFromAPI && (
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-cosmic-green/20 text-cosmic-green font-medium">AstroVisor</span>
          )}
          {enhancedResult && (
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">Enhanced</span>
          )}
          {!chartFromAPI && (
            <p className="text-[9px] text-muted-foreground italic">
              ⚠ Approximate chart — connect AstroVisor for precise house cusps
            </p>
          )}
        </div>

        {/* Lunar status */}
        {(voc || moonPhase) && (
          <div className="flex items-center gap-3 text-[9px]">
            {moonPhase && (
              <span className="text-muted-foreground">🌙 {typeof moonPhase === "string" ? moonPhase : moonPhase.name || moonPhase.phase}</span>
            )}
            {voc && (
              <span className={cn(
                "px-1.5 py-0.5 rounded font-medium",
                (voc === true || voc?.is_voc) ? "bg-cosmic-red/15 text-cosmic-red" : "bg-cosmic-green/15 text-cosmic-green"
              )}>
                {(voc === true || voc?.is_voc) ? "⚠ Void of Course" : "✓ Moon Active"}
              </span>
            )}
          </div>
        )}

        {/* House Rulers Grid */}
        <div className="grid grid-cols-2 gap-2">
          {houses.map((h) => {
            const ruler = getTraditionalRuler(h.sign);
            const dignity = getEssentialDignity(ruler, h.sign);
            return (
              <div key={h.house} className="celestial-gradient rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-lg">{ZODIAC_SYMBOLS[h.sign] || "?"}</span>
                  <div>
                    <p className="text-[10px] font-semibold text-foreground">
                      {h.label} <span className="text-muted-foreground">({h.house}H)</span>
                    </p>
                    {h.team && (
                      <p className="text-[9px] text-primary font-bold">{h.team} — {h.role}</p>
                    )}
                    {!h.team && (
                      <p className="text-[9px] text-muted-foreground">{h.role}</p>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-foreground">{h.sign}</p>
                <p className={`text-[10px] font-medium ${getDignityColor(dignity)}`}>
                  Lord: {ruler} — {dignity}
                </p>
              </div>
            );
          })}
        </div>

        {/* Enhanced analysis from Astrology API */}
        {enhancedResult && (
          <div className="border-t border-border/50 pt-3 space-y-2">
            <p className="text-[9px] font-semibold text-primary uppercase tracking-wider">Enhanced Analysis</p>
            {enhancedResult.answer && (
              <p className="text-[10px] text-foreground leading-relaxed">{enhancedResult.answer}</p>
            )}
            {enhancedResult.judgment && (
              <p className="text-[10px] text-foreground leading-relaxed">{enhancedResult.judgment}</p>
            )}
            {enhancedResult.considerations && Array.isArray(enhancedResult.considerations) && (
              <div className="space-y-1">
                {enhancedResult.considerations.slice(0, 3).map((c: any, i: number) => (
                  <p key={i} className="text-[9px] text-muted-foreground">
                    • {typeof c === "string" ? c : c.description || c.name || JSON.stringify(c)}
                  </p>
                ))}
              </div>
            )}
            {enhancedResult.timing && (
              <p className="text-[9px] text-cosmic-gold">
                ⏱ Timing: {typeof enhancedResult.timing === "string" ? enhancedResult.timing : JSON.stringify(enhancedResult.timing)}
              </p>
            )}
          </div>
        )}

        {/* Verdict */}
        <div className="border-t border-border/50 pt-3">
          <div className="flex items-center gap-2 mb-1">
            <Star className="h-3 w-3 text-cosmic-gold" />
            <p className="text-[10px] font-semibold text-foreground">
              Horary Verdict — {verdict.strength === "strong" ? "🔥 Strong" : verdict.strength === "moderate" ? "⚡ Moderate" : "~ Slight"} {verdict.favoredTeam === "home" ? homeAbbr : verdict.favoredTeam === "away" ? awayAbbr : "Neutral"}
            </p>
          </div>
          <div className="space-y-1">
            {verdict.reason.split(". ").filter(Boolean).map((line, i) => (
              <p key={i} className="text-[9px] text-muted-foreground leading-relaxed">
                {i === 0 ? "✦ " : "• "}{line.replace(/\.$/, "")}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
