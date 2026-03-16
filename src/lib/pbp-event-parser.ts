/**
 * PBP Event Parser — Normalizes raw play-by-play text into structured events
 * for the Watch mode visualizer in Cosmic Edge.
 */

// ─── Event Types ───
export type PbpEventType =
  | "made_shot" | "missed_shot"
  | "free_throw_made" | "free_throw_missed"
  | "rebound_offensive" | "rebound_defensive"
  | "turnover" | "steal" | "block" | "assist"
  | "foul_personal" | "foul_shooting" | "foul_offensive" | "foul_technical" | "foul_loose_ball"
  | "violation" | "jump_ball" | "timeout" | "substitution"
  | "review" | "ejection" | "period_start" | "period_end"
  | "unknown";

export type ShotSubtype =
  | "2pt_paint" | "2pt_midrange" | "3pt_corner_left" | "3pt_corner_right"
  | "3pt_wing_left" | "3pt_wing_right" | "3pt_top"
  | "dunk" | "layup" | "tip_in" | "hook" | "fadeaway" | "pullup" | "stepback"
  | "free_throw" | null;

export type ZoneKey =
  | "paint" | "restricted_area" | "free_throw_line"
  | "midrange_left" | "midrange_center" | "midrange_right"
  | "corner_3_left" | "corner_3_right"
  | "wing_3_left" | "wing_3_right" | "top_3"
  | "backcourt" | "bench" | "sideline" | "unknown";

export type AnimationKey =
  | "made_2_basic" | "made_3_basic" | "dunk_finish" | "layup_finish"
  | "free_throw_make" | "free_throw_miss"
  | "miss_2_basic" | "miss_3_basic"
  | "def_rebound_secure" | "off_rebound_reset"
  | "turnover_flip" | "steal_flip"
  | "foul_whistle" | "timeout_pause" | "review_pause"
  | "sub_bench_swap"
  | "period_start_reset" | "period_end_freeze"
  | "jump_ball_start"
  | null;

export type PossessionResult = "change_possession" | "retain_possession" | "stoppage" | "unchanged" | null;

export interface NormalizedPbpEvent {
  sourceEventId: string;
  gameId: string;
  period: number;
  clockDisplay: string;
  clockSeconds: number | null;
  teamId: string | null;
  primaryPlayerId: string | null;
  secondaryPlayerId: string | null;
  eventType: PbpEventType;
  eventSubtype: ShotSubtype;
  pointsScored: number;
  scoreHomeAfter: number | null;
  scoreAwayAfter: number | null;
  possessionResult: PossessionResult;
  isScoringPlay: boolean;
  zoneKey: ZoneKey;
  animationKey: AnimationKey;
  rawDescription: string;
  parserConfidence: number;
}

export interface LiveGameVisualState {
  gameId: string;
  status: "live" | "waiting" | "final";
  period: number;
  clockDisplay: string;
  clockSeconds: number | null;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  possessionTeamId: string | null;
  lastEvent: NormalizedPbpEvent | null;
  recentRunHome: number;
  recentRunAway: number;
  updatedAt: string;
}

// ─── Parser ───

const LOWER_CACHE = new Map<string, string>();
function lower(s: string): string {
  let v = LOWER_CACHE.get(s);
  if (!v) { v = s.toLowerCase(); LOWER_CACHE.set(s, v); }
  return v;
}

function ilike(text: string, pattern: string): boolean {
  return lower(text).includes(pattern);
}

function inferShotPoints(text: string): 2 | 3 {
  const t = lower(text);
  if (t.includes("3-pt") || t.includes("three point") || t.includes("3pt") || t.includes("three-point")) return 3;
  // Distance-based: "27-foot" → likely 3
  const distMatch = t.match(/(\d+)-foot/);
  if (distMatch) {
    const dist = parseInt(distMatch[1], 10);
    if (dist >= 22) return 3;
  }
  return 2;
}

function inferShotSubtype(text: string, pts: number): ShotSubtype {
  const t = lower(text);
  if (t.includes("dunk") || t.includes("slam")) return "dunk";
  if (t.includes("layup") || t.includes("lay-up") || t.includes("finger roll")) return "layup";
  if (t.includes("tip") || t.includes("putback") || t.includes("put-back")) return "tip_in";
  if (t.includes("hook")) return "hook";
  if (t.includes("fadeaway") || t.includes("fade away")) return "fadeaway";
  if (t.includes("pullup") || t.includes("pull-up") || t.includes("pull up")) return "pullup";
  if (t.includes("step back") || t.includes("stepback") || t.includes("step-back")) return "stepback";
  if (pts === 3) {
    if (t.includes("corner") && (t.includes("left") || t.includes("right"))) {
      return t.includes("left") ? "3pt_corner_left" : "3pt_corner_right";
    }
    if (t.includes("wing")) {
      return t.includes("left") ? "3pt_wing_left" : "3pt_wing_right";
    }
    return "3pt_top";
  }
  // 2pt
  if (t.includes("paint") || t.includes("lane") || t.includes("in the paint")) return "2pt_paint";
  return "2pt_midrange";
}

function inferZone(subtype: ShotSubtype, eventType: PbpEventType, text: string): ZoneKey {
  // Shot-based zones
  if (subtype) {
    switch (subtype) {
      case "dunk": case "layup": case "tip_in": case "2pt_paint": return "restricted_area";
      case "hook": return "paint";
      case "fadeaway": case "pullup": case "stepback": case "2pt_midrange": return "midrange_center";
      case "3pt_corner_left": return "corner_3_left";
      case "3pt_corner_right": return "corner_3_right";
      case "3pt_wing_left": return "wing_3_left";
      case "3pt_wing_right": return "wing_3_right";
      case "3pt_top": return "top_3";
      case "free_throw": return "free_throw_line";
    }
  }
  // Event-type based
  switch (eventType) {
    case "rebound_offensive": case "rebound_defensive": return "paint";
    case "free_throw_made": case "free_throw_missed": return "free_throw_line";
    case "timeout": case "substitution": return "bench";
    case "foul_personal": case "foul_shooting": case "foul_offensive":
    case "foul_technical": case "foul_loose_ball": case "review": return "sideline";
    case "jump_ball": return "midrange_center";
    default: return "unknown";
  }
}

function inferAnimation(eventType: PbpEventType, subtype: ShotSubtype, pts: number): AnimationKey {
  switch (eventType) {
    case "made_shot":
      if (subtype === "dunk") return "dunk_finish";
      if (subtype === "layup" || subtype === "tip_in") return "layup_finish";
      return pts === 3 ? "made_3_basic" : "made_2_basic";
    case "missed_shot":
      return pts === 3 || (subtype && subtype.startsWith("3pt")) ? "miss_3_basic" : "miss_2_basic";
    case "free_throw_made": return "free_throw_make";
    case "free_throw_missed": return "free_throw_miss";
    case "rebound_defensive": return "def_rebound_secure";
    case "rebound_offensive": return "off_rebound_reset";
    case "turnover": return "turnover_flip";
    case "steal": return "steal_flip";
    case "foul_personal": case "foul_shooting": case "foul_offensive":
    case "foul_technical": case "foul_loose_ball": return "foul_whistle";
    case "timeout": return "timeout_pause";
    case "review": return "review_pause";
    case "substitution": return "sub_bench_swap";
    case "period_start": return "period_start_reset";
    case "period_end": return "period_end_freeze";
    case "jump_ball": return "jump_ball_start";
    default: return null;
  }
}

function inferPossession(eventType: PbpEventType): PossessionResult {
  switch (eventType) {
    case "made_shot": return "change_possession";
    case "rebound_defensive": return "change_possession";
    case "turnover": case "steal": case "foul_offensive": return "change_possession";
    case "rebound_offensive": return "retain_possession";
    case "free_throw_made": case "free_throw_missed": return "stoppage";
    case "foul_personal": case "foul_shooting": case "foul_technical":
    case "foul_loose_ball": return "stoppage";
    case "timeout": return "stoppage";
    case "period_start": case "period_end": return "unchanged";
    default: return null;
  }
}

/**
 * Parse a single raw PBP event into a normalized structure.
 */
export function parsePbpEvent(raw: {
  id?: string;
  game_id?: string;
  description?: string;
  text?: string;
  period?: number;
  clock?: string;
  clockDisplay?: string;
  team?: string;
  team_abbr?: string;
  player?: string;
  player_name?: string;
  home_score?: number | null;
  away_score?: number | null;
  event_type?: string;
}): NormalizedPbpEvent {
  const desc = raw.description || raw.text || "";
  const t = lower(desc);
  const sourceId = raw.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const team = raw.team_abbr || raw.team || null;
  const player = raw.player_name || raw.player || null;
  let confidence = 0.5;

  // ── Classify event type ──
  let eventType: PbpEventType = "unknown";
  let subtype: ShotSubtype = null;
  let pts = 0;

  // Period boundaries
  if (/start.*(period|quarter|half|overtime)/i.test(desc) || /^(1st|2nd|3rd|4th|ot).*(period|quarter).*start/i.test(desc)) {
    eventType = "period_start"; confidence = 0.95;
  } else if (/end.*(period|quarter|half|game)|period.*end|end of/i.test(desc)) {
    eventType = "period_end"; confidence = 0.95;
  }
  // Substitution
  else if (ilike(desc, "enters the game") || ilike(desc, "substitution") || ilike(desc, " in for ")) {
    eventType = "substitution"; confidence = 0.9;
  }
  // Timeout
  else if (ilike(desc, "timeout")) {
    eventType = "timeout"; confidence = 0.95;
  }
  // Free throws
  else if (ilike(desc, "free throw")) {
    if (ilike(desc, "makes") || ilike(desc, "made")) {
      eventType = "free_throw_made"; pts = 1; confidence = 0.95;
    } else {
      eventType = "free_throw_missed"; confidence = 0.95;
    }
    subtype = "free_throw";
  }
  // Made shots (check before missed to handle "makes" first)
  else if (ilike(desc, "makes") || ilike(desc, "made")) {
    eventType = "made_shot";
    pts = inferShotPoints(desc);
    subtype = inferShotSubtype(desc, pts);
    confidence = 0.9;
  }
  // Missed shots
  else if (ilike(desc, "misses") || ilike(desc, "missed") || ilike(desc, "miss ")) {
    eventType = "missed_shot";
    pts = 0;
    const shotPts = inferShotPoints(desc);
    subtype = inferShotSubtype(desc, shotPts);
    confidence = 0.85;
  }
  // Rebounds
  else if (ilike(desc, "offensive rebound") || ilike(desc, "off rebound") || ilike(desc, "off. rebound")) {
    eventType = "rebound_offensive"; confidence = 0.9;
  } else if (ilike(desc, "defensive rebound") || ilike(desc, "def rebound") || ilike(desc, "def. rebound")) {
    eventType = "rebound_defensive"; confidence = 0.9;
  } else if (ilike(desc, "rebound")) {
    // Generic rebound, assume defensive
    eventType = "rebound_defensive"; confidence = 0.6;
  }
  // Steal
  else if (ilike(desc, "steal")) {
    eventType = "steal"; confidence = 0.85;
  }
  // Block
  else if (ilike(desc, "block")) {
    eventType = "block"; confidence = 0.8;
  }
  // Turnovers
  else if (ilike(desc, "turnover") || ilike(desc, "bad pass") || ilike(desc, "lost ball") || ilike(desc, "traveling") || ilike(desc, "travel")) {
    eventType = "turnover"; confidence = 0.85;
  }
  // Fouls
  else if (ilike(desc, "offensive foul")) {
    eventType = "foul_offensive"; confidence = 0.9;
  } else if (ilike(desc, "shooting foul")) {
    eventType = "foul_shooting"; confidence = 0.9;
  } else if (ilike(desc, "technical foul")) {
    eventType = "foul_technical"; confidence = 0.9;
  } else if (ilike(desc, "loose ball foul")) {
    eventType = "foul_loose_ball"; confidence = 0.85;
  } else if (ilike(desc, "foul")) {
    eventType = "foul_personal"; confidence = 0.7;
  }
  // Jump ball
  else if (ilike(desc, "jump ball")) {
    eventType = "jump_ball"; confidence = 0.9;
  }
  // Violation
  else if (ilike(desc, "violation") || ilike(desc, "goaltending") || ilike(desc, "kick ball")) {
    eventType = "violation"; confidence = 0.8;
  }
  // Review
  else if (ilike(desc, "review") || ilike(desc, "replay") || ilike(desc, "challenge")) {
    eventType = "review"; confidence = 0.8;
  }

  // Use provider event_type as fallback/boost
  if (raw.event_type && eventType === "unknown") {
    const pe = lower(raw.event_type);
    if (pe.includes("made") || pe === "fg" || pe === "2pt" || pe === "3pt") { eventType = "made_shot"; confidence = 0.6; }
    else if (pe.includes("miss")) { eventType = "missed_shot"; confidence = 0.6; }
    else if (pe.includes("reb")) { eventType = "rebound_defensive"; confidence = 0.5; }
    else if (pe.includes("tov") || pe.includes("turnover")) { eventType = "turnover"; confidence = 0.5; }
    else if (pe.includes("foul")) { eventType = "foul_personal"; confidence = 0.5; }
  }

  const zone = inferZone(subtype, eventType, desc);
  const animation = inferAnimation(eventType, subtype, pts);
  const possession = inferPossession(eventType);

  return {
    sourceEventId: sourceId,
    gameId: raw.game_id || "",
    period: raw.period || 1,
    clockDisplay: raw.clockDisplay || raw.clock || "",
    clockSeconds: null, // caller should set this
    teamId: team,
    primaryPlayerId: player,
    secondaryPlayerId: null,
    eventType,
    eventSubtype: subtype,
    pointsScored: pts,
    scoreHomeAfter: raw.home_score ?? null,
    scoreAwayAfter: raw.away_score ?? null,
    possessionResult: possession,
    isScoringPlay: pts > 0,
    zoneKey: zone,
    animationKey: animation,
    rawDescription: desc,
    parserConfidence: confidence,
  };
}

/**
 * Derive a visual game state from the most recent normalized events.
 */
export function deriveVisualState(
  gameId: string,
  homeAbbr: string,
  awayAbbr: string,
  events: NormalizedPbpEvent[],
  currentHomeScore: number,
  currentAwayScore: number,
  currentPeriod: number,
  currentClock: string,
  currentClockSeconds: number | null,
): LiveGameVisualState {
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  // Possession inference from last few events
  let possessionTeam: string | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.possessionResult === "change_possession" && ev.teamId) {
      // Ball goes to opposing team
      possessionTeam = ev.teamId === homeAbbr ? awayAbbr : homeAbbr;
      break;
    } else if (ev.possessionResult === "retain_possession" && ev.teamId) {
      possessionTeam = ev.teamId;
      break;
    }
  }

  // Calculate recent runs (last ~10 scoring events)
  let runHome = 0, runAway = 0;
  let runIdx = events.length - 1;
  let scoringCount = 0;
  while (runIdx >= 0 && scoringCount < 10) {
    const ev = events[runIdx];
    if (ev.isScoringPlay && ev.pointsScored > 0) {
      if (ev.teamId === homeAbbr) runHome += ev.pointsScored;
      else if (ev.teamId === awayAbbr) runAway += ev.pointsScored;
      scoringCount++;
    }
    runIdx--;
  }

  return {
    gameId,
    status: "live",
    period: currentPeriod,
    clockDisplay: currentClock,
    clockSeconds: currentClockSeconds,
    homeTeamId: homeAbbr,
    awayTeamId: awayAbbr,
    homeScore: currentHomeScore,
    awayScore: currentAwayScore,
    possessionTeamId: possessionTeam,
    lastEvent,
    recentRunHome: runHome,
    recentRunAway: runAway,
    updatedAt: new Date().toISOString(),
  };
}
