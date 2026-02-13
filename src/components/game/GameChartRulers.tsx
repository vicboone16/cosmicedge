import { Shield } from "lucide-react";
import {
  getTraditionalRuler,
  getEssentialDignity,
  getDignityColor,
  getHoraryVerdict,
  getOppositeSign,
  getSignAtHouse,
  ZODIAC_SIGNS,
} from "@/lib/horary-utils";

interface Props {
  startTime: string;
  homeAbbr: string;
  awayAbbr: string;
  homeML: number;
  awayML: number;
  venueLat: number | null;
}

const ZODIAC_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

export function GameChartRulers({ startTime, homeAbbr, awayAbbr, homeML, awayML, venueLat }: Props) {
  const gameDate = new Date(startTime);
  
  // Simplified ASC calculation based on hour
  const hour = gameDate.getHours();
  const signIndex = Math.floor((hour / 24) * 12);
  const ascSign = ZODIAC_SIGNS[signIndex % 12];
  const descSign = getOppositeSign(ascSign);
  const icSign = getSignAtHouse(ascSign, 3);
  const mcSign = getSignAtHouse(ascSign, 9);

  // Determine favorite/underdog
  const homeFavorite = homeML < 0 || (homeML > 0 && awayML > 0 && homeML < awayML);
  const favoriteLabel = homeFavorite ? homeAbbr : awayAbbr;
  const underdogLabel = homeFavorite ? awayAbbr : homeAbbr;
  const roleReversal = !homeFavorite;

  const houseData = [
    { house: 1, label: "1st House", team: homeAbbr, sign: ascSign, role: "Home / Querent" },
    { house: 7, label: "7th House", team: awayAbbr, sign: descSign, role: "Away / Opponent" },
    { house: 4, label: "4th House (IC)", team: null, sign: icSign, role: "End of Matter" },
    { house: 10, label: "10th House (MC)", team: null, sign: mcSign, role: "Prize / Outcome" },
  ];

  const homeLord = getTraditionalRuler(ascSign);
  const awayLord = getTraditionalRuler(descSign);
  const homeDignity = getEssentialDignity(homeLord, ascSign);
  const awayDignity = getEssentialDignity(awayLord, descSign);
  const verdict = getHoraryVerdict(homeDignity, awayDignity);

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Shield className="h-3.5 w-3.5" />
        Game Chart Rulers
      </h3>
      <div className="cosmic-card rounded-xl p-4 space-y-3">
        {roleReversal && (
          <p className="text-[9px] text-cosmic-gold italic">
            ⚠ Role reversal: Favorite ({favoriteLabel}) is the away team — mapped to 7th house (Descendant)
          </p>
        )}

        <div className="space-y-2">
          {houseData.map((h) => {
            const ruler = getTraditionalRuler(h.sign);
            const dignity = getEssentialDignity(ruler, h.sign);
            return (
              <div key={h.house} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{ZODIAC_SYMBOLS[h.sign]}</span>
                  <div>
                    <p className="text-[10px] font-semibold text-foreground">{h.label}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {h.team ? `${h.team} — ${h.role}` : h.role}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-foreground">{h.sign}</p>
                  <p className={`text-[10px] font-medium ${getDignityColor(dignity)}`}>
                    {ruler} · {dignity}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Verdict */}
        <div className="celestial-gradient rounded-lg p-3">
          <p className="text-[10px] font-semibold text-foreground mb-1">
            {verdict.favoredTeam === "home" ? `${homeAbbr} Favored` : verdict.favoredTeam === "away" ? `${awayAbbr} Favored` : "Even Match"}
            <span className="text-muted-foreground ml-1">({verdict.strength})</span>
          </p>
          <p className="text-[10px] text-muted-foreground italic">{verdict.reason}</p>
        </div>
      </div>
    </section>
  );
}
