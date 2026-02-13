/**
 * Traditional Horary Interpretation Utilities
 * Based on Frawley/Lilly rules for contest charts
 */

export interface HouseData {
  house: number;
  sign: string;
  degree: number;
  ruler: string;
  rulerSign?: string;
  rulerDegree?: number;
  dignity?: string;
}

export interface HoraryVerdict {
  favoredTeam: "home" | "away" | "neutral";
  strength: "strong" | "moderate" | "slight";
  reason: string;
}

// Traditional rulerships (Frawley/Lilly — no outer planets)
const TRADITIONAL_RULERS: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

const EXALTATIONS: Record<string, string> = {
  Aries: "Sun", Taurus: "Moon", Cancer: "Jupiter", Virgo: "Mercury",
  Libra: "Saturn", Scorpio: "", Capricorn: "Mars", Pisces: "Venus",
};

const DETRIMENTS: Record<string, string> = {
  Aries: "Venus", Taurus: "Mars", Gemini: "Jupiter", Cancer: "Saturn",
  Leo: "Saturn", Virgo: "Jupiter", Libra: "Mars", Scorpio: "Venus",
  Sagittarius: "Mercury", Capricorn: "Moon", Aquarius: "Sun", Pisces: "Mercury",
};

const FALLS: Record<string, string> = {
  Aries: "Saturn", Taurus: "", Gemini: "", Cancer: "Mars",
  Leo: "", Virgo: "Venus", Libra: "Sun", Scorpio: "Moon",
  Sagittarius: "", Capricorn: "Jupiter", Aquarius: "", Pisces: "Mercury",
};

export function getTraditionalRuler(sign: string): string {
  return TRADITIONAL_RULERS[sign] || "Unknown";
}

export function getEssentialDignity(planet: string, sign: string): string {
  if (TRADITIONAL_RULERS[sign] === planet) return "Domicile";
  if (EXALTATIONS[sign] === planet) return "Exaltation";
  if (DETRIMENTS[sign] === planet) return "Detriment";
  if (FALLS[sign] === planet) return "Fall";
  return "Peregrine";
}

export function getDignityColor(dignity: string): string {
  switch (dignity) {
    case "Domicile": return "text-cosmic-green";
    case "Exaltation": return "text-cosmic-gold";
    case "Detriment": case "Fall": return "text-destructive";
    default: return "text-muted-foreground";
  }
}

export function getDignityScore(dignity: string): number {
  switch (dignity) {
    case "Domicile": return 5;
    case "Exaltation": return 4;
    case "Peregrine": return 0;
    case "Detriment": return -4;
    case "Fall": return -5;
    default: return 0;
  }
}

/**
 * Produce a horary verdict comparing home (1st house) vs away (7th house).
 */
export function getHoraryVerdict(
  homeLordDignity: string,
  awayLordDignity: string,
  moonApplyingTo?: "home" | "away" | "neither"
): HoraryVerdict {
  const homeScore = getDignityScore(homeLordDignity) + (moonApplyingTo === "home" ? 2 : 0);
  const awayScore = getDignityScore(awayLordDignity) + (moonApplyingTo === "away" ? 2 : 0);
  const diff = homeScore - awayScore;

  if (Math.abs(diff) <= 1) {
    return { favoredTeam: "neutral", strength: "slight", reason: "Significators are nearly equal in strength — a toss-up." };
  }

  const favored = diff > 0 ? "home" : "away";
  const strength = Math.abs(diff) >= 6 ? "strong" : Math.abs(diff) >= 3 ? "moderate" : "slight";
  const winner = favored === "home" ? "Home" : "Away";
  const loser = favored === "home" ? "Away" : "Home";

  return {
    favoredTeam: favored,
    strength,
    reason: `${winner} Lord in ${favored === "home" ? homeLordDignity : awayLordDignity} vs ${loser} Lord in ${favored === "home" ? awayLordDignity : homeLordDignity}${moonApplyingTo === favored ? " + Moon applying" : ""} → ${strength} ${winner.toLowerCase()} advantage.`,
  };
}

/** Map the opposite sign (for finding Descendant from Ascendant) */
const OPPOSITE_SIGNS: Record<string, string> = {
  Aries: "Libra", Taurus: "Scorpio", Gemini: "Sagittarius",
  Cancer: "Capricorn", Leo: "Aquarius", Virgo: "Pisces",
  Libra: "Aries", Scorpio: "Taurus", Sagittarius: "Gemini",
  Capricorn: "Cancer", Aquarius: "Leo", Pisces: "Virgo",
};

export function getOppositeSign(sign: string): string {
  return OPPOSITE_SIGNS[sign] || sign;
}

/** Signs in zodiac order */
export const ZODIAC_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];

/** Get the sign N houses from a given sign (0-indexed from starting sign) */
export function getSignAtHouse(ascSign: string, houseOffset: number): string {
  const idx = ZODIAC_SIGNS.indexOf(ascSign);
  if (idx === -1) return ascSign;
  return ZODIAC_SIGNS[(idx + houseOffset) % 12];
}
