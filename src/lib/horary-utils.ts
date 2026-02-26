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

/** Triplicity rulers (day chart assumed for simplicity) */
const TRIPLICITY_DAY: Record<string, string> = {
  Aries: "Sun", Leo: "Sun", Sagittarius: "Sun",       // Fire
  Taurus: "Venus", Virgo: "Venus", Capricorn: "Venus", // Earth
  Gemini: "Saturn", Libra: "Saturn", Aquarius: "Saturn",// Air
  Cancer: "Mars", Scorpio: "Mars", Pisces: "Mars",      // Water
};

/** Check if planet has triplicity in the sign */
export function hasTriplicity(planet: string, sign: string): boolean {
  return TRIPLICITY_DAY[sign] === planet;
}

/** Mutual reception: two planets each in the other's domicile */
export function hasMutualReception(
  planet1: string, sign1: string,
  planet2: string, sign2: string
): boolean {
  return TRADITIONAL_RULERS[sign1] === planet2 && TRADITIONAL_RULERS[sign2] === planet1;
}

export function getDignityColor(dignity: string): string {
  switch (dignity) {
    case "Domicile": return "text-cosmic-green";
    case "Exaltation": return "text-cosmic-gold";
    case "Triplicity": return "text-cosmic-gold/80";
    case "Detriment": case "Fall": return "text-destructive";
    default: return "text-muted-foreground";
  }
}

export function getDignityScore(dignity: string): number {
  switch (dignity) {
    case "Domicile": return 5;
    case "Exaltation": return 4;
    case "Triplicity": return 3;
    case "Peregrine": return 0;
    case "Detriment": return -4;
    case "Fall": return -5;
    default: return 0;
  }
}

/**
 * Enhanced horary verdict with multiple factors beyond just dignity.
 */
export function getHoraryVerdict(
  homeLordDignity: string,
  awayLordDignity: string,
  moonApplyingTo?: "home" | "away" | "neither",
  extras?: {
    homeLord?: string;
    awayLord?: string;
    homeLordSign?: string;
    awayLordSign?: string;
    ascSign?: string;
    descSign?: string;
    mcSign?: string;
    icSign?: string;
    moonSign?: string;
    moonPhase?: string;
    voc?: boolean;
  }
): HoraryVerdict {
  let homeScore = getDignityScore(homeLordDignity);
  let awayScore = getDignityScore(awayLordDignity);
  const reasons: string[] = [];

  // 1. Base dignity
  reasons.push(`Home Lord in ${homeLordDignity} (${homeScore > 0 ? "+" : ""}${homeScore}), Away Lord in ${awayLordDignity} (${awayScore > 0 ? "+" : ""}${awayScore})`);

  // 2. Moon applying
  if (moonApplyingTo === "home") {
    homeScore += 2;
    reasons.push("Moon applying to Home Lord (+2 home)");
  } else if (moonApplyingTo === "away") {
    awayScore += 2;
    reasons.push("Moon applying to Away Lord (+2 away)");
  }

  if (extras) {
    const { homeLord, awayLord, homeLordSign, awayLordSign, ascSign, descSign, mcSign, icSign, moonSign, moonPhase, voc } = extras;

    // 3. Triplicity bonus
    if (homeLord && homeLordSign && hasTriplicity(homeLord, homeLordSign)) {
      homeScore += 2;
      reasons.push(`${homeLord} has triplicity in ${homeLordSign} (+2 home)`);
    }
    if (awayLord && awayLordSign && hasTriplicity(awayLord, awayLordSign)) {
      awayScore += 2;
      reasons.push(`${awayLord} has triplicity in ${awayLordSign} (+2 away)`);
    }

    // 4. Mutual reception
    if (homeLord && awayLord && homeLordSign && awayLordSign &&
        hasMutualReception(homeLord, homeLordSign, awayLord, awayLordSign)) {
      reasons.push("Mutual reception between Lords — game could go either way");
    }

    // 5. MC ruler affinity — which Lord rules the 10th (outcome)?
    if (mcSign) {
      const mcRuler = getTraditionalRuler(mcSign);
      if (mcRuler === homeLord) {
        homeScore += 2;
        reasons.push(`MC (outcome) ruled by ${mcRuler} = Home Lord (+2 home)`);
      } else if (mcRuler === awayLord) {
        awayScore += 2;
        reasons.push(`MC (outcome) ruled by ${mcRuler} = Away Lord (+2 away)`);
      }
    }

    // 6. IC ruler (end of matter)
    if (icSign) {
      const icRuler = getTraditionalRuler(icSign);
      if (icRuler === homeLord) {
        homeScore += 1;
        reasons.push(`IC (end of matter) aligns with Home Lord (+1 home)`);
      } else if (icRuler === awayLord) {
        awayScore += 1;
        reasons.push(`IC (end of matter) aligns with Away Lord (+1 away)`);
      }
    }

    // 7. Moon sign advantage — Moon in a sign ruled by one of the Lords
    if (moonSign) {
      const moonRuler = getTraditionalRuler(moonSign);
      if (moonRuler === homeLord) {
        homeScore += 1;
        reasons.push(`Moon in ${moonSign} (${moonRuler}'s sign) favors Home (+1)`);
      } else if (moonRuler === awayLord) {
        awayScore += 1;
        reasons.push(`Moon in ${moonSign} (${moonRuler}'s sign) favors Away (+1)`);
      }
    }

    // 8. Void of Course penalty
    if (voc) {
      reasons.push("⚠ Moon Void of Course — outcome uncertain, caution advised");
    }

    // 9. Moon phase context
    if (moonPhase) {
      reasons.push(`Moon phase: ${moonPhase}`);
    }
  }

  const diff = homeScore - awayScore;

  if (Math.abs(diff) <= 1) {
    return {
      favoredTeam: "neutral",
      strength: "slight",
      reason: reasons.join(". ") + ". Significators nearly balanced — lean caution.",
    };
  }

  const favored = diff > 0 ? "home" : "away";
  const strength = Math.abs(diff) >= 6 ? "strong" : Math.abs(diff) >= 3 ? "moderate" : "slight";
  const winner = favored === "home" ? "Home" : "Away";

  return {
    favoredTeam: favored,
    strength,
    reason: reasons.join(". ") + `. → ${strength} ${winner.toLowerCase()} advantage.`,
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
