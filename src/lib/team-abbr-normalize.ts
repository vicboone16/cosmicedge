/**
 * Client-side team abbreviation normalizer.
 * Ensures queries and comparisons use canonical abbreviations.
 * Mirrors the server-side ALIASES in supabase/functions/_shared/team-mappings.ts.
 */

const NBA_ALIASES: Record<string, string> = {
  GS: "GSW", PHO: "PHX", NO: "NOP", NOH: "NOP", NOK: "NOP",
  SA: "SAS", BRK: "BKN", CHO: "CHA",
};

const NHL_ALIASES: Record<string, string> = {
  TB: "TBL", LA: "LAK", SJ: "SJS", NJ: "NJD",
  MON: "MTL", WAS: "WSH", VEG: "VGK", VGS: "VGK",
};

const NFL_ALIASES: Record<string, string> = {
  JAC: "JAX", WFT: "WAS", ARZ: "ARI",
};

const MLB_ALIASES: Record<string, string> = {
  CWS: "CHW", SD: "SDP", SF: "SFG", TB: "TBR", WSH: "WSN", WAS: "WSN",
};

const LEAGUE_ALIASES: Record<string, Record<string, string>> = {
  NBA: NBA_ALIASES,
  NHL: NHL_ALIASES,
  NFL: NFL_ALIASES,
  MLB: MLB_ALIASES,
};

/** Normalize a team abbreviation to its canonical form for a given league. */
export function normalizeTeamAbbr(abbr: string, league?: string): string {
  if (!abbr) return abbr;
  const upper = abbr.trim().toUpperCase();

  // League-specific first
  if (league) {
    const leagueMap = LEAGUE_ALIASES[league.toUpperCase()];
    if (leagueMap?.[upper]) return leagueMap[upper];
  }

  // Fallback: check all leagues (NBA most common)
  for (const map of Object.values(LEAGUE_ALIASES)) {
    if (map[upper]) return map[upper];
  }

  return upper;
}

/**
 * Given a list of canonical team abbreviations, return an expanded list
 * that includes known aliases. Useful for DB queries that may have stale data.
 */
export function expandTeamAbbrForQuery(abbrs: string[], league?: string): string[] {
  const expanded = new Set(abbrs.map(a => a.toUpperCase()));

  // For each canonical abbr, add known aliases that map TO it
  const leagueMaps = league
    ? [LEAGUE_ALIASES[league.toUpperCase()]].filter(Boolean)
    : Object.values(LEAGUE_ALIASES);

  for (const map of leagueMaps) {
    for (const [alias, canonical] of Object.entries(map)) {
      if (expanded.has(canonical)) {
        expanded.add(alias);
      }
    }
  }

  return [...expanded];
}
