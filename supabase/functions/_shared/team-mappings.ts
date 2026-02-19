/**
 * Canonical team abbreviation mappings for all supported leagues.
 *
 * Rules:
 *  1. Always store teams using a league-scoped key to prevent collisions (e.g. "NFL:NYG" vs "NHL:NYR").
 *  2. Never auto-generate abbreviations — always look up from the appropriate league dictionary.
 *  3. If not found → throw an error.
 */

// ── League-scoped key helper ────────────────────────────────────────────────

export function teamKey(league: string, abbr: string): string {
  return `${league}:${abbr}`;
}

// ── Canonical name → abbreviation maps ──────────────────────────────────────

export const CANONICAL: Record<string, Record<string, string>> = {
  NBA: {
    "Atlanta Hawks": "ATL",
    "Boston Celtics": "BOS",
    "Brooklyn Nets": "BKN",
    "Charlotte Hornets": "CHA",
    "Chicago Bulls": "CHI",
    "Cleveland Cavaliers": "CLE",
    "Dallas Mavericks": "DAL",
    "Denver Nuggets": "DEN",
    "Detroit Pistons": "DET",
    "Golden State Warriors": "GSW",
    "Houston Rockets": "HOU",
    "Indiana Pacers": "IND",
    "Los Angeles Clippers": "LAC",
    "LA Clippers": "LAC",
    "Los Angeles Lakers": "LAL",
    "Memphis Grizzlies": "MEM",
    "Miami Heat": "MIA",
    "Milwaukee Bucks": "MIL",
    "Minnesota Timberwolves": "MIN",
    "New Orleans Pelicans": "NOP",
    "New York Knicks": "NYK",
    "Oklahoma City Thunder": "OKC",
    "Orlando Magic": "ORL",
    "Philadelphia 76ers": "PHI",
    "Phoenix Suns": "PHX",
    "Portland Trail Blazers": "POR",
    "Sacramento Kings": "SAC",
    "San Antonio Spurs": "SAS",
    "Toronto Raptors": "TOR",
    "Utah Jazz": "UTA",
    "Washington Wizards": "WAS",
  },

  MLB: {
    "Arizona Diamondbacks": "ARI",
    "Atlanta Braves": "ATL",
    "Baltimore Orioles": "BAL",
    "Boston Red Sox": "BOS",
    "Chicago Cubs": "CHC",
    "Chicago White Sox": "CHW",
    "Cincinnati Reds": "CIN",
    "Cleveland Guardians": "CLE",
    "Colorado Rockies": "COL",
    "Detroit Tigers": "DET",
    "Houston Astros": "HOU",
    "Kansas City Royals": "KCR",
    "Los Angeles Angels": "LAA",
    "Los Angeles Dodgers": "LAD",
    "Miami Marlins": "MIA",
    "Milwaukee Brewers": "MIL",
    "Minnesota Twins": "MIN",
    "New York Mets": "NYM",
    "New York Yankees": "NYY",
    "Oakland Athletics": "OAK",
    "Athletics": "OAK",           // TheSportsDB name after Oakland → Sacramento relocation
    "Sacramento Athletics": "OAK",// future-proof
    "Philadelphia Phillies": "PHI",
    "Pittsburgh Pirates": "PIT",
    "San Diego Padres": "SDP",
    "San Francisco Giants": "SFG",
    "Seattle Mariners": "SEA",
    "St. Louis Cardinals": "STL",
    "Tampa Bay Rays": "TBR",
    "Texas Rangers": "TEX",
    "Toronto Blue Jays": "TOR",
    "Washington Nationals": "WSN",
  },

  NFL: {
    "Arizona Cardinals": "ARI",
    "Atlanta Falcons": "ATL",
    "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF",
    "Carolina Panthers": "CAR",
    "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN",
    "Cleveland Browns": "CLE",
    "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN",
    "Detroit Lions": "DET",
    "Green Bay Packers": "GB",
    "Houston Texans": "HOU",
    "Indianapolis Colts": "IND",
    "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC",
    "Las Vegas Raiders": "LV",
    "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR",
    "Miami Dolphins": "MIA",
    "Minnesota Vikings": "MIN",
    "New England Patriots": "NE",
    "New Orleans Saints": "NO",
    "New York Giants": "NYG",
    "New York Jets": "NYJ",
    "Philadelphia Eagles": "PHI",
    "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA",
    "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN",
    "Washington Commanders": "WAS",
  },

  NHL: {
    "Anaheim Ducks": "ANA",
    "Boston Bruins": "BOS",
    "Buffalo Sabres": "BUF",
    "Calgary Flames": "CGY",
    "Carolina Hurricanes": "CAR",
    "Chicago Blackhawks": "CHI",
    "Colorado Avalanche": "COL",
    "Columbus Blue Jackets": "CBJ",
    "Dallas Stars": "DAL",
    "Detroit Red Wings": "DET",
    "Edmonton Oilers": "EDM",
    "Florida Panthers": "FLA",
    "Los Angeles Kings": "LAK",
    "Minnesota Wild": "MIN",
    "Montreal Canadiens": "MTL",
    "Nashville Predators": "NSH",
    "New Jersey Devils": "NJD",
    "New York Islanders": "NYI",
    "New York Rangers": "NYR",
    "Ottawa Senators": "OTT",
    "Philadelphia Flyers": "PHI",
    "Pittsburgh Penguins": "PIT",
    "San Jose Sharks": "SJS",
    "Seattle Kraken": "SEA",
    "St. Louis Blues": "STL",
    "Tampa Bay Lightning": "TBL",
    "Toronto Maple Leafs": "TOR",
    "Utah Mammoth": "UTA",
    "Utah Hockey Club": "UTA",   // prior name before 2025-26 rebrand
    "Vancouver Canucks": "VAN",
    "Vegas Golden Knights": "VGK",
    "Washington Capitals": "WSH",
    "Winnipeg Jets": "WPG",
  },
};

// ── Reverse maps: abbreviation → full name (per league) ─────────────────────

const _abbrToNameCache: Record<string, Record<string, string>> = {};

export function getAbbrToName(league: string): Record<string, string> {
  if (!_abbrToNameCache[league]) {
    const dict = CANONICAL[league];
    if (!dict) throw new Error(`Unknown league: ${league}`);
    const reverse: Record<string, string> = {};
    for (const [name, abbr] of Object.entries(dict)) {
      // First entry wins (avoids "LA Clippers" overwriting "Los Angeles Clippers")
      if (!reverse[abbr]) reverse[abbr] = name;
    }
    _abbrToNameCache[league] = reverse;
  }
  return _abbrToNameCache[league];
}

// ── Provider alias maps (incoming → canonical) ─────────────────────────────

export const ALIASES: Record<string, Record<string, string>> = {
  // Shared / legacy / ESPN / generic feeds
  GENERIC: {
    // NBA
    GS: "GSW", SA: "SAS", NOH: "NOP", NOK: "NOP",
    // Basketball Reference specific
    BRK: "BKN", CHO: "CHA", PHO: "PHX",

    // MLB common alternates
    CWS: "CHW", CHISOX: "CHW", CUBS: "CHC",
    SD: "SDP", SF: "SFG",

    // NFL common alternates
    JAC: "JAX", WFT: "WAS",

    // NHL common alternates
    LA: "LAK", SJ: "SJS", NJ: "NJD", MON: "MTL",
    VEG: "VGK", VGS: "VGK",
  },

  // NFL GSIS / Rulebook style (official partner codes)
  NFL_GSIS: {
    ARZ: "ARI",
    BLT: "BAL",
    CLV: "CLE",
    HST: "HOU",
  },

  // NHL "short" alternates
  NHL_SHORT: {
    TB: "TBL",
    LA: "LAK",
    SJ: "SJS",
    NJ: "NJD",
    MON: "MTL",
    WAS: "WSH",
    VEG: "VGK",
  },

  // MLB alternates from various historical/stat sources
  MLB_ALT: {
    CWS: "CHW",
    SD: "SDP",
    SF: "SFG",
    TB: "TBR",
    WSH: "WSN",
    WAS: "WSN",
  },
};

// ── Normalize any incoming abbreviation to canonical ────────────────────────

export function normalizeAbbr(
  league: string,
  abbr: string,
  provider: string | null = null,
): string {
  if (!abbr) throw new Error("Missing team abbreviation");
  const raw = String(abbr).trim().toUpperCase();

  // provider-specific first
  if (provider && ALIASES[provider] && ALIASES[provider][raw]) {
    return ALIASES[provider][raw];
  }

  // generic fallback
  if (ALIASES.GENERIC[raw]) return ALIASES.GENERIC[raw];

  return raw;
}

// ── Get canonical abbreviation from full team name ──────────────────────────

export function getCanonicalAbbrFromName(
  league: string,
  teamName: string,
): string {
  const dict = CANONICAL[league];
  if (!dict) throw new Error(`Unknown league: ${league}`);
  const abbr = dict[teamName];
  if (!abbr)
    throw new Error(`Unknown team name for ${league}: ${teamName}`);
  return abbr;
}

// ── Global-safe key from any source ─────────────────────────────────────────

export function getTeamGlobalKey(opts: {
  league: string;
  teamName?: string | null;
  abbr?: string | null;
  provider?: string | null;
}): string {
  const canonicalAbbr = opts.abbr
    ? normalizeAbbr(opts.league, opts.abbr, opts.provider ?? null)
    : getCanonicalAbbrFromName(opts.league, opts.teamName!);

  return teamKey(opts.league, canonicalAbbr);
}
