import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Player {
  id: string;
  name: string;
  birth_date: string | null;
}

interface TransitModifiersProps {
  player: Player;
}

// ── Zodiac data ──
const ZODIAC_SIGNS = [
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

const SIGN_INDEX: Record<string, number> = {
  Aries: 0, Taurus: 1, Gemini: 2, Cancer: 3, Leo: 4, Virgo: 5,
  Libra: 6, Scorpio: 7, Sagittarius: 8, Capricorn: 9, Aquarius: 10, Pisces: 11,
};

const ELEMENT: Record<string, string> = {
  Aries: "Fire", Taurus: "Earth", Gemini: "Air", Cancer: "Water",
  Leo: "Fire", Virgo: "Earth", Libra: "Air", Scorpio: "Water",
  Sagittarius: "Fire", Capricorn: "Earth", Aquarius: "Air", Pisces: "Water",
};

function getSign(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  for (const s of ZODIAC_SIGNS) {
    if ((month === s.m1 && day >= s.d1) || (month === s.m2 && day <= s.d2)) return s.sign;
  }
  return "Capricorn";
}

// Current transit planets (Feb 2026 approximate positions)
const CURRENT_TRANSITS = [
  { planet: "Sun", sign: "Aquarius" },
  { planet: "Mercury", sign: "Aquarius" },
  { planet: "Venus", sign: "Pisces" },
  { planet: "Mars", sign: "Cancer" },
  { planet: "Jupiter", sign: "Cancer" },
  { planet: "Saturn", sign: "Pisces" },
];

interface TransitEffect {
  planet: string;
  aspect: string;
  effect: "boost" | "suppress" | "neutral";
  modifier: number; // percentage
  description: string;
}

function computeTransitEffects(natalSign: string): TransitEffect[] {
  const natalIdx = SIGN_INDEX[natalSign] ?? 0;
  const natalElement = ELEMENT[natalSign];
  const effects: TransitEffect[] = [];

  for (const transit of CURRENT_TRANSITS) {
    const transitIdx = SIGN_INDEX[transit.sign] ?? 0;
    const dist = Math.abs(natalIdx - transitIdx);
    const normalized = dist > 6 ? 12 - dist : dist;
    const transitElement = ELEMENT[transit.sign];

    let aspect = "";
    let effect: "boost" | "suppress" | "neutral" = "neutral";
    let modifier = 0;

    switch (normalized) {
      case 0: // Conjunction
        aspect = "☌ Conjunction";
        effect = "boost";
        modifier = transit.planet === "Jupiter" ? 12 : transit.planet === "Mars" ? 8 : 5;
        break;
      case 2: // Sextile
        aspect = "⚹ Sextile";
        effect = "boost";
        modifier = transit.planet === "Jupiter" ? 7 : 4;
        break;
      case 4: // Trine
        aspect = "△ Trine";
        effect = "boost";
        modifier = transit.planet === "Jupiter" ? 10 : transit.planet === "Venus" ? 6 : 5;
        break;
      case 3: // Square
        aspect = "□ Square";
        effect = "suppress";
        modifier = transit.planet === "Saturn" ? -8 : transit.planet === "Mars" ? -6 : -4;
        break;
      case 6: // Opposition
        aspect = "☍ Opposition";
        effect = "suppress";
        modifier = transit.planet === "Saturn" ? -10 : -5;
        break;
      default:
        continue; // Skip minor aspects
    }

    effects.push({
      planet: transit.planet,
      aspect,
      effect,
      modifier,
      description: effect === "boost"
        ? `${transit.planet} in ${transit.sign} ${aspect.split(" ")[1]} natal Sun — energy amplified`
        : `${transit.planet} in ${transit.sign} ${aspect.split(" ")[1]} natal Sun — resistance factor`,
    });
  }

  return effects;
}

export function TransitModifiers({ player }: TransitModifiersProps) {
  if (!player.birth_date) return null;

  const sign = getSign(player.birth_date);
  const effects = computeTransitEffects(sign);

  if (effects.length === 0) return null;

  const totalMod = effects.reduce((sum, e) => sum + e.modifier, 0);
  const boosts = effects.filter(e => e.effect === "boost");
  const suppresses = effects.filter(e => e.effect === "suppress");

  return (
    <div className="mt-1.5 space-y-1">
      {/* Net modifier badge */}
      <div className="flex items-center gap-1.5">
        {totalMod > 0 ? (
          <TrendingUp className="h-3 w-3 text-cosmic-green" />
        ) : totalMod < 0 ? (
          <TrendingDown className="h-3 w-3 text-cosmic-red" />
        ) : (
          <Minus className="h-3 w-3 text-muted-foreground" />
        )}
        <span className={cn(
          "text-[9px] font-bold tabular-nums",
          totalMod > 0 ? "text-cosmic-green" : totalMod < 0 ? "text-cosmic-red" : "text-muted-foreground"
        )}>
          {totalMod > 0 ? "+" : ""}{totalMod}% transit mod
        </span>
      </div>

      {/* Individual effects */}
      {effects.slice(0, 3).map((e, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className={cn(
            "text-[8px]",
            e.effect === "boost" ? "text-cosmic-green" : "text-cosmic-red"
          )}>
            {e.aspect.split(" ")[0]}
          </span>
          <span className="text-[8px] text-muted-foreground truncate">
            {e.planet} {e.modifier > 0 ? "+" : ""}{e.modifier}%
          </span>
        </div>
      ))}
    </div>
  );
}
