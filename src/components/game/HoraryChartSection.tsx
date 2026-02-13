import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Star, Crown } from "lucide-react";
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
  const { data: horaryData, isLoading } = useQuery({
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

  // Fallback: compute from game start time using simplified method
  const gameDate = new Date(startTime);
  const month = gameDate.getMonth() + 1;
  const day = gameDate.getDate();
  const signs = [
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
    // Simple approximation based on time of day (not accurate, but visual placeholder)
    const hour = gameDate.getHours();
    const signIndex = Math.floor((hour / 24) * 12);
    const signNames = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
    ascSign = signNames[signIndex % 12];
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
  const verdict = getHoraryVerdict(homeDignity, awayDignity);

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Crown className="h-3.5 w-3.5" />
        Horary Chart Analysis
      </h3>
      <div className="cosmic-card rounded-xl p-4 space-y-3">
        {!chartFromAPI && (
          <p className="text-[9px] text-muted-foreground italic">
            ⚠ Approximate chart — connect AstroVisor for precise house cusps
          </p>
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

        {/* Verdict */}
        <div className="border-t border-border/50 pt-3">
          <div className="flex items-center gap-2 mb-1">
            <Star className="h-3 w-3 text-cosmic-gold" />
            <p className="text-[10px] font-semibold text-foreground">Horary Verdict</p>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed italic">
            ✦ {verdict.reason}
          </p>
        </div>
      </div>
    </section>
  );
}
