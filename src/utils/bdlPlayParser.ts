/**
 * BallDontLie (BDL) Play-by-Play Parser
 *
 * Converts raw BDL PBP events into structured stat-credited events
 * with secondary participant inference and confidence flags.
 *
 * Join key: game_id + player_id (never player names).
 */

// ─── Types ───

export type BdlEventType =
  | "SHOT_MADE_3" | "SHOT_MISSED_3"
  | "SHOT_MADE_2" | "SHOT_MISSED_2"
  | "FT_MADE" | "FT_MISSED"
  | "REBOUND_OFF" | "REBOUND_DEF"
  | "TURNOVER" | "STEAL"
  | "BLOCK"
  | "ASSIST"
  | "FOUL" | "VIOLATION"
  | "TIMEOUT" | "SUBSTITUTION"
  | "JUMP_BALL" | "PERIOD_START" | "PERIOD_END"
  | "UNKNOWN";

export type BdlConfidence = "exact" | "inferred_high" | "inferred_low";

export interface BdlStatCredits {
  points: number;
  fga: number;
  fgm: number;
  three_pa: number;
  three_pm: number;
  fta: number;
  ftm: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
}

export interface BdlParsedEvent {
  game_id: string;
  event_id: string;
  raw_description: string;
  period: number;
  clock: string;
  clock_seconds: number | null;
  wallclock: string | null;
  event_type: BdlEventType;
  primary_player_id: string | null;
  primary_stats: BdlStatCredits;
  secondary_player_id: string | null;
  secondary_stats: BdlStatCredits;
  team_id: string | null;
  confidence: BdlConfidence;
  is_scoring: boolean;
  points_scored: number;
}

// ─── Helpers ───

function emptyStats(): BdlStatCredits {
  return {
    points: 0, fga: 0, fgm: 0, three_pa: 0, three_pm: 0,
    fta: 0, ftm: 0, oreb: 0, dreb: 0, reb: 0,
    ast: 0, stl: 0, blk: 0, to: 0,
  };
}

/**
 * Parse ISO 8601 duration (PT05M30.00S) to total seconds.
 * Returns null if unparseable.
 */
function clockToSeconds(clock: string | null | undefined): number | null {
  if (!clock) return null;
  const m = clock.match(/^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (m) {
    const mins = Number(m[1] ?? 0);
    const secs = Math.floor(Number(m[2] ?? 0));
    return mins * 60 + secs;
  }
  // Fallback: "5:30" format
  const colonMatch = clock.match(/^(\d+):(\d+)$/);
  if (colonMatch) {
    return Number(colonMatch[1]) * 60 + Number(colonMatch[2]);
  }
  return null;
}

function formatClockDisplay(clock: string | null | undefined): string {
  if (!clock) return "";
  const secs = clockToSeconds(clock);
  if (secs == null) return clock;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Core description matchers ───

function isThreePointer(desc: string): boolean {
  return /3-pt|3pt|three[- ]point/i.test(desc);
}

function isFreeThrow(desc: string): boolean {
  return /free throw/i.test(desc);
}

function isMade(desc: string): boolean {
  return /\bmakes?\b|\bmade\b/i.test(desc);
}

function isMissed(desc: string): boolean {
  return /\bmisses?\b|\bmissed\b/i.test(desc);
}

/**
 * Extract secondary participant info from description.
 * BDL descriptions often include patterns like:
 *   "J. Doe makes 3-pt shot (assist by A. Smith)"
 *   "J. Doe turnover (steal by A. Smith)"
 *   "J. Doe misses shot (block by A. Smith)"
 */
function extractSecondaryAction(desc: string): {
  action: "assist" | "steal" | "block" | null;
} {
  if (/\bassist\b/i.test(desc)) return { action: "assist" };
  if (/\bsteal\b/i.test(desc)) return { action: "steal" };
  if (/\bblock\b/i.test(desc)) return { action: "block" };
  return { action: null };
}

// ─── Raw BDL event shape ───

export interface BdlRawEvent {
  id?: string | number;
  game_id?: string | number;
  description?: string;
  period?: number;
  clock?: string;
  time?: string;
  wallclock?: string;
  created_at?: string;
  team_id?: string | number | null;
  team?: { id?: string | number } | null;
  player_id?: string | number | null;
  player?: { id?: string | number } | null;
  secondary_player_id?: string | number | null;
  secondary_player?: { id?: string | number } | null;
  // BDL sometimes provides structured participants
  participants?: Array<{
    player_id?: string | number;
    role?: string;
  }>;
}

// ─── Main Parser ───

export function parseBdlEvent(raw: BdlRawEvent): BdlParsedEvent {
  const desc = raw.description ?? "";
  const descLower = desc.toLowerCase();

  const gameId = String(raw.game_id ?? "");
  const eventId = String(raw.id ?? `bdl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const period = raw.period ?? 1;
  const rawClock = raw.clock ?? raw.time ?? null;
  const clockSec = clockToSeconds(rawClock);
  const clockDisp = formatClockDisplay(rawClock);
  const wallclock = raw.wallclock ?? raw.created_at ?? null;

  // Resolve player IDs (prefer explicit fields, fallback to nested objects)
  const primaryPlayerId = raw.player_id != null
    ? String(raw.player_id)
    : raw.player?.id != null ? String(raw.player.id) : null;

  let secondaryPlayerId = raw.secondary_player_id != null
    ? String(raw.secondary_player_id)
    : raw.secondary_player?.id != null ? String(raw.secondary_player.id) : null;

  const teamId = raw.team_id != null
    ? String(raw.team_id)
    : raw.team?.id != null ? String(raw.team.id) : null;

  // Check if BDL provided role metadata for confidence
  const hasRoleMetadata = raw.participants != null && raw.participants.length > 0;

  // Resolve secondary from participants array if not already set
  if (!secondaryPlayerId && raw.participants) {
    for (const p of raw.participants) {
      if (p.player_id != null && String(p.player_id) !== primaryPlayerId) {
        secondaryPlayerId = String(p.player_id);
        break;
      }
    }
  }

  const primary = emptyStats();
  const secondary = emptyStats();
  let eventType: BdlEventType = "UNKNOWN";
  let isScoring = false;
  let pointsScored = 0;
  let confidence: BdlConfidence = "inferred_low";

  // ── Free throws (check BEFORE generic makes/misses) ──
  if (isFreeThrow(desc)) {
    if (isMade(desc)) {
      eventType = "FT_MADE";
      primary.fta = 1;
      primary.ftm = 1;
      primary.points = 1;
      isScoring = true;
      pointsScored = 1;
    } else {
      eventType = "FT_MISSED";
      primary.fta = 1;
    }
    confidence = hasRoleMetadata ? "exact" : "inferred_high";
  }
  // ── 3-point shots ──
  else if (isThreePointer(desc)) {
    if (isMade(desc)) {
      eventType = "SHOT_MADE_3";
      primary.fga = 1;
      primary.fgm = 1;
      primary.three_pa = 1;
      primary.three_pm = 1;
      primary.points = 3;
      isScoring = true;
      pointsScored = 3;
    } else if (isMissed(desc)) {
      eventType = "SHOT_MISSED_3";
      primary.fga = 1;
      primary.three_pa = 1;
    }
    confidence = hasRoleMetadata ? "exact" : "inferred_high";
  }
  // ── 2-point shots ──
  else if (isMade(desc)) {
    eventType = "SHOT_MADE_2";
    primary.fga = 1;
    primary.fgm = 1;
    primary.points = 2;
    isScoring = true;
    pointsScored = 2;
    confidence = hasRoleMetadata ? "exact" : "inferred_high";
  }
  else if (isMissed(desc)) {
    eventType = "SHOT_MISSED_2";
    primary.fga = 1;
    confidence = hasRoleMetadata ? "exact" : "inferred_high";
  }
  // ── Rebounds ──
  else if (/offensive rebound|off\.?\s*rebound/i.test(desc)) {
    eventType = "REBOUND_OFF";
    if (primaryPlayerId) {
      primary.oreb = 1;
      primary.reb = 1;
    }
    confidence = primaryPlayerId ? (hasRoleMetadata ? "exact" : "inferred_high") : "inferred_low";
  }
  else if (/defensive rebound|def\.?\s*rebound/i.test(desc)) {
    eventType = "REBOUND_DEF";
    if (primaryPlayerId) {
      primary.dreb = 1;
      primary.reb = 1;
    }
    confidence = primaryPlayerId ? (hasRoleMetadata ? "exact" : "inferred_high") : "inferred_low";
  }
  else if (/\brebound\b/i.test(desc)) {
    // Generic rebound — default defensive
    eventType = "REBOUND_DEF";
    if (primaryPlayerId) {
      primary.dreb = 1;
      primary.reb = 1;
    }
    confidence = "inferred_low";
  }
  // ── Turnovers ──
  else if (/\bturnover\b|bad pass|lost ball|traveling|travel\b|palming|double dribble|backcourt/i.test(desc)) {
    eventType = "TURNOVER";
    primary.to = 1;
    confidence = hasRoleMetadata ? "exact" : "inferred_high";
  }
  // ── Steals (standalone, not as secondary) ──
  else if (/\bsteal\b/i.test(desc) && !/turnover/i.test(desc)) {
    eventType = "STEAL";
    primary.stl = 1;
    confidence = hasRoleMetadata ? "exact" : "inferred_high";
  }
  // ── Blocks (standalone) ──
  else if (/\bblock\b/i.test(desc) && !/miss/i.test(desc)) {
    eventType = "BLOCK";
    primary.blk = 1;
    confidence = hasRoleMetadata ? "exact" : "inferred_high";
  }
  // ── Fouls ──
  else if (/\bfoul\b/i.test(desc)) {
    eventType = "FOUL";
    confidence = "inferred_high";
  }
  // ── Timeouts ──
  else if (/\btimeout\b/i.test(desc)) {
    eventType = "TIMEOUT";
    confidence = "inferred_high";
  }
  // ── Substitutions ──
  else if (/\bsubstitution\b|enters the game|in for\b/i.test(desc)) {
    eventType = "SUBSTITUTION";
    confidence = "inferred_high";
  }
  // ── Jump ball ──
  else if (/\bjump ball\b/i.test(desc)) {
    eventType = "JUMP_BALL";
    confidence = "inferred_high";
  }
  // ── Period boundaries ──
  else if (/start.*(period|quarter|half|overtime)/i.test(desc)) {
    eventType = "PERIOD_START";
    confidence = "exact";
  }
  else if (/end.*(period|quarter|half|game)|period.*end|end of/i.test(desc)) {
    eventType = "PERIOD_END";
    confidence = "exact";
  }
  // ── Violations ──
  else if (/\bviolation\b|kick ball|lane violation|delay of game|goaltend/i.test(desc)) {
    eventType = "VIOLATION";
    confidence = "inferred_low";
  }

  // ── Secondary participant inference ──
  const secondaryAction = extractSecondaryAction(desc);

  if (secondaryAction.action === "assist" && isScoring) {
    // Made shot + "assist" => secondary gets assist credit
    if (secondaryPlayerId) {
      secondary.ast = 1;
    }
    confidence = secondaryPlayerId
      ? (hasRoleMetadata ? "exact" : "inferred_high")
      : "inferred_low";
  }
  else if (secondaryAction.action === "steal" && eventType === "TURNOVER") {
    // Turnover + "steal" => secondary gets steal credit
    if (secondaryPlayerId) {
      secondary.stl = 1;
    }
    confidence = secondaryPlayerId
      ? (hasRoleMetadata ? "exact" : "inferred_high")
      : "inferred_low";
  }
  else if (secondaryAction.action === "block" && (eventType === "SHOT_MISSED_2" || eventType === "SHOT_MISSED_3")) {
    // Missed shot + "block" => secondary gets block credit
    if (secondaryPlayerId) {
      secondary.blk = 1;
    }
    confidence = secondaryPlayerId
      ? (hasRoleMetadata ? "exact" : "inferred_high")
      : "inferred_low";
  }

  return {
    game_id: gameId,
    event_id: eventId,
    raw_description: desc,
    period,
    clock: clockDisp,
    clock_seconds: clockSec,
    wallclock,
    event_type: eventType,
    primary_player_id: primaryPlayerId,
    primary_stats: primary,
    secondary_player_id: secondaryPlayerId,
    secondary_stats: secondary,
    team_id: teamId,
    confidence,
    is_scoring: isScoring,
    points_scored: pointsScored,
  };
}

/**
 * Parse an array of raw BDL PBP events.
 * Sorts by period ASC, clock DESC (start of period → end).
 */
export function parseBdlEvents(rawEvents: BdlRawEvent[]): BdlParsedEvent[] {
  const parsed = rawEvents.map(parseBdlEvent);

  parsed.sort((a, b) => {
    if (a.period !== b.period) return a.period - b.period;
    // Higher clock seconds = earlier in the period
    const aSec = a.clock_seconds ?? 0;
    const bSec = b.clock_seconds ?? 0;
    return bSec - aSec;
  });

  return parsed;
}

/**
 * Aggregate stat credits for a player across parsed events.
 * Uses game_id + player_id as join key.
 */
export function aggregatePlayerStats(
  events: BdlParsedEvent[],
  gameId: string,
  playerId: string,
): BdlStatCredits {
  const totals = emptyStats();

  for (const ev of events) {
    if (ev.game_id !== gameId) continue;

    // Primary credits
    if (ev.primary_player_id === playerId) {
      totals.points += ev.primary_stats.points;
      totals.fga += ev.primary_stats.fga;
      totals.fgm += ev.primary_stats.fgm;
      totals.three_pa += ev.primary_stats.three_pa;
      totals.three_pm += ev.primary_stats.three_pm;
      totals.fta += ev.primary_stats.fta;
      totals.ftm += ev.primary_stats.ftm;
      totals.oreb += ev.primary_stats.oreb;
      totals.dreb += ev.primary_stats.dreb;
      totals.reb += ev.primary_stats.reb;
      totals.ast += ev.primary_stats.ast;
      totals.stl += ev.primary_stats.stl;
      totals.blk += ev.primary_stats.blk;
      totals.to += ev.primary_stats.to;
    }

    // Secondary credits
    if (ev.secondary_player_id === playerId) {
      totals.ast += ev.secondary_stats.ast;
      totals.stl += ev.secondary_stats.stl;
      totals.blk += ev.secondary_stats.blk;
    }
  }

  return totals;
}
