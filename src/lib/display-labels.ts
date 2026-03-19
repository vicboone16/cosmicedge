/**
 * Canonical display label normalization for stat types, market types,
 * periods, entry types, and source labels.
 * 
 * Use these everywhere in user-facing UI to prevent raw/internal strings.
 */

/** Normalize stat/market type to clean display label */
const STAT_DISPLAY: Record<string, string> = {
  // Standard stats
  points: "Points",
  rebounds: "Rebounds",
  assists: "Assists",
  steals: "Steals",
  blocks: "Blocks",
  turnovers: "Turnovers",
  threes: "3-Pointers",
  three_made: "3-Pointers",
  "3pm": "3-Pointers",
  fg_made: "FG Made",
  "fg made": "FG Made",
  ft_made: "FT Made",
  "ft made": "FT Made",

  // Combos
  pra: "PTS+REB+AST",
  pts_reb_ast: "PTS+REB+AST",
  player_points_rebounds_assists: "PTS+REB+AST",
  "pts+reb+ast": "PTS+REB+AST",
  "pts+rebs+asts": "PTS+REB+AST",
  pts_reb: "PTS+REB",
  player_points_rebounds: "PTS+REB",
  "pts+reb": "PTS+REB",
  pts_ast: "PTS+AST",
  player_points_assists: "PTS+AST",
  "pts+ast": "PTS+AST",
  reb_ast: "REB+AST",
  player_rebounds_assists: "REB+AST",
  "reb+ast": "REB+AST",
  "rebs+asts": "REB+AST",
  stl_blk: "STL+BLK",
  player_steals_blocks: "STL+BLK",
  "stl+blk": "STL+BLK",
  "blks+stls": "STL+BLK",
  fouls: "Fouls",
  personal_fouls: "Fouls",
  fantasy_score: "Fantasy Score",
  "fantasy score": "Fantasy Score",
  fantasy_points: "Fantasy Points",

  // Player prop prefixed
  player_points: "Points",
  player_rebounds: "Rebounds",
  player_assists: "Assists",
  player_steals: "Steals",
  player_blocks: "Blocks",
  player_turnovers: "Turnovers",
  player_threes: "3-Pointers",

  // Game markets
  moneyline: "Moneyline",
  spread: "Spread",
  total: "Total",
  team_total: "Team Total",
  first_quarter: "1Q Total",
  first_half: "1H Total",
  second_half: "2H Total",
  player_prop: "Player Prop",

  // Entry types
  slip_entry: "Flex Play",
  power_play: "Power Play",
  flex_play: "Flex Play",
  parlay: "Parlay",
  straight: "Straight",
};

/** Period labels */
const PERIOD_DISPLAY: Record<string, string> = {
  q1: "Q1",
  q2: "Q2",
  q3: "Q3",
  q4: "Q4",
  "1h": "1H",
  "2h": "2H",
  full: "Full Game",
  first_half: "1st Half",
  second_half: "2nd Half",
  first3: "First 3 Min",
  first5: "First 5 Min",
  first10: "First 10 Min",
};

/**
 * Parse a raw stat string like "1h:pra" or "Q1:Points" into
 * { period: "1H", stat: "PTS+REB+AST", raw: "1h:pra" }
 */
export function parseStatLabel(raw: string): { period: string | null; stat: string; raw: string } {
  if (!raw) return { period: null, stat: raw, raw };
  const colonIdx = raw.indexOf(":");
  if (colonIdx > 0) {
    const prefix = raw.slice(0, colonIdx).toLowerCase();
    const suffix = raw.slice(colonIdx + 1).toLowerCase().trim();
    if (PERIOD_DISPLAY[prefix]) {
      return {
        period: PERIOD_DISPLAY[prefix],
        stat: STAT_DISPLAY[suffix] || titleCase(suffix),
        raw,
      };
    }
  }
  const lower = raw.toLowerCase().trim();
  return {
    period: null,
    stat: STAT_DISPLAY[lower] || titleCase(raw),
    raw,
  };
}

/** Get clean display name for a stat/market type */
export function displayStatName(raw: string): string {
  if (!raw) return raw;
  const { period, stat } = parseStatLabel(raw);
  return period ? `${period} ${stat}` : stat;
}

/** Get clean display name for an entry type */
export function displayEntryType(raw: string): string {
  if (!raw) return raw;
  const lower = raw.toLowerCase().trim();
  return STAT_DISPLAY[lower] || titleCase(raw.replace(/_/g, " "));
}

/** Get clean display name for a book/source */
export function displayBookName(raw: string): string {
  if (!raw) return raw;
  const lower = raw.toLowerCase().trim();
  const BOOK_MAP: Record<string, string> = {
    prizepicks: "PrizePicks",
    draftkings: "DraftKings",
    fanduel: "FanDuel",
    betmgm: "BetMGM",
    caesars: "Caesars",
    pointsbet: "PointsBet",
    bet365: "Bet365",
    manual: "Manual",
  };
  return BOOK_MAP[lower] || titleCase(raw);
}

/** Remove raw slip UUIDs and internal annotations from text */
export function cleanSourceLabel(text: string): string {
  if (!text) return text;
  // Remove [slip:uuid] patterns
  let cleaned = text.replace(/\[slip:[a-f0-9-]+\]/gi, "").trim();
  // Remove "From prizepicks slip" → "PrizePicks"
  cleaned = cleaned.replace(/from\s+prizepicks\s+slip/gi, "PrizePicks").trim();
  // Remove raw UUID-like strings
  cleaned = cleaned.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "").trim();
  // Clean double spaces
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

/** Strip markdown artifacts from AI output for structured rendering */
export function stripMarkdownArtifacts(text: string): string {
  if (!text) return text;
  return text
    // Remove heading markers (###, ####, etc.)
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bracket artifacts like [Full Game]
    .replace(/\[([^\]]+)\]/g, "$1")
    // Remove markdown bullet points (-, *, •) at start of lines — convert to clean text
    .replace(/^\s*[-*•]\s+/gm, "· ")
    // Remove numbered list markers (1. 2. etc.)
    .replace(/^\s*\d+\.\s+/gm, "")
    // Remove horizontal rules
    .replace(/^---+$/gm, "")
    // Remove backtick code markers
    .replace(/`([^`]+)`/g, "$1")
    // Remove > blockquote markers
    .replace(/^\s*>\s?/gm, "")
    // Clean up excessive newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleCase(str: string): string {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}
