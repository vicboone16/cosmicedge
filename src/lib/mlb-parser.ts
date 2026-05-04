export type MlbEventType =
  | "single" | "double" | "triple" | "home_run"
  | "strikeout" | "walk" | "hit_by_pitch" | "intentional_walk"
  | "fly_out" | "ground_out" | "line_out" | "pop_out"
  | "double_play" | "triple_play" | "fielders_choice"
  | "sacrifice_fly" | "sacrifice_bunt"
  | "stolen_base" | "caught_stealing" | "pickoff"
  | "wild_pitch" | "passed_ball" | "balk" | "error"
  | "pitching_change" | "substitution"
  | "inning_start" | "inning_end"
  | "unknown";

export type HitZone =
  | "left_field" | "left_center" | "center_field" | "right_center" | "right_field"
  | "infield_left" | "up_the_middle" | "infield_right"
  | "foul_left" | "foul_right"
  | "catcher" | "pitcher" | "beyond_fence" | "unknown";

export interface MlbGameState {
  inning: number;
  topBottom: "top" | "bottom";
  outs: number; // 0-2
  runners: { first: boolean; second: boolean; third: boolean };
  homeScore: number;
  awayScore: number;
  balls: number;
  strikes: number;
  pitcher: string | null;
  batter: string | null;
}

export interface MlbParsedEvent {
  sourceEventId: string;
  rawDescription: string;
  eventType: MlbEventType;
  hitZone: HitZone | null;
  isScoringPlay: boolean;
  runsScored: number;
  outs: number; // outs recorded by this play
  runnersAdvanced: string | null; // free-form note
  primaryPlayer: string | null;
  inning: number;
  topBottom: "top" | "bottom";
  homeScoreAfter: number | null;
  awayScoreAfter: number | null;
}

// SVG coordinate for each hit zone (viewBox 0 0 400 380)
export const MLB_ZONE_COORDS: Record<HitZone, { x: number; y: number }> = {
  left_field:    { x: 70,  y: 130 },
  left_center:   { x: 130, y: 90  },
  center_field:  { x: 200, y: 70  },
  right_center:  { x: 270, y: 90  },
  right_field:   { x: 330, y: 130 },
  infield_left:  { x: 140, y: 260 },
  up_the_middle: { x: 200, y: 210 },
  infield_right: { x: 260, y: 260 },
  foul_left:     { x: 30,  y: 210 },
  foul_right:    { x: 370, y: 210 },
  catcher:       { x: 200, y: 355 },
  pitcher:       { x: 200, y: 250 },
  beyond_fence:  { x: 200, y: 35  },
  unknown:       { x: 200, y: 200 },
};

// ─── Event type detection ──────────────────────────────────────────────────

export function parseMlbEventType(desc: string): MlbEventType {
  const d = desc.toLowerCase();

  if (/\bhome.?run\b/.test(d) || /\bhr\b/.test(d))               return "home_run";
  if (/\btriples?\b/.test(d) || /\btriple\b/.test(d))             return "triple";
  if (/\bdouble(?! play)\b/.test(d))                               return "double";
  if (/\bsingl(es?|ed)\b/.test(d))                                 return "single";
  if (/\bstrike.?out\b|strikeout|struck out\b/.test(d))            return "strikeout";
  if (/\bintentional(ly)? walk\b|ibb/.test(d))                     return "intentional_walk";
  if (/\bhit by pitch\b|hbp/.test(d))                              return "hit_by_pitch";
  if (/\bwalks?\b/.test(d))                                        return "walk";
  if (/\bsacrifice fly\b|sac fly/.test(d))                         return "sacrifice_fly";
  if (/\bsacrifice bunt\b|sac bunt/.test(d))                       return "sacrifice_bunt";
  if (/\btriple play\b/.test(d))                                   return "triple_play";
  if (/\bdouble play\b|DP/.test(d))                                return "double_play";
  if (/\bfielder.?s choice\b|fc/.test(d))                          return "fielders_choice";
  if (/\bflies? out\b|fly out|flyout/.test(d))                     return "fly_out";
  if (/\blines? out\b|line out|lineout/.test(d))                   return "line_out";
  if (/\bpops? out\b|pop out|popup/.test(d))                       return "pop_out";
  if (/\bgrounds? out\b|ground out|groundout/.test(d))             return "ground_out";
  if (/\bstolen base\b|steals? (second|third|home)\b/.test(d))    return "stolen_base";
  if (/\bcaught stealing\b|cs\b/.test(d))                          return "caught_stealing";
  if (/\bpickoff\b|pick(ed)? off/.test(d))                         return "pickoff";
  if (/\bwild pitch\b|wp\b/.test(d))                               return "wild_pitch";
  if (/\bpassed ball\b|pb\b/.test(d))                              return "passed_ball";
  if (/\bbalk\b/.test(d))                                          return "balk";
  if (/\berror\b|e\d/.test(d))                                     return "error";
  if (/\bpitching change\b|pitching substitution|pitcher/.test(d)) return "pitching_change";
  if (/\bsubstitut/.test(d))                                       return "substitution";
  if (/\btop of the\b|top \d/i.test(d))                            return "inning_start";
  if (/\bend of (the )?\d|side retired|inning over/i.test(d))      return "inning_end";

  return "unknown";
}

// ─── Hit zone detection ────────────────────────────────────────────────────

export function extractHitZone(desc: string): HitZone {
  const d = desc.toLowerCase();

  if (/\bleft.?cent(er|re)\b/.test(d))     return "left_center";
  if (/\bright.?cent(er|re)\b/.test(d))    return "right_center";
  if (/\bcent(er|re).?field\b|cf\b/.test(d)) return "center_field";
  if (/\bleft.?field\b|lf\b/.test(d))     return "left_field";
  if (/\bright.?field\b|rf\b/.test(d))    return "right_field";
  if (/\bshortsto?p\b|ss\b/.test(d))      return "infield_left";
  if (/\bthird base\b|3b\b/.test(d))      return "infield_left";
  if (/\bsecond base\b|2b\b|up the middle\b/.test(d)) return "up_the_middle";
  if (/\bfirst base\b|1b\b/.test(d))      return "infield_right";
  if (/\bfoul (line |territory )?(left|third)/.test(d)) return "foul_left";
  if (/\bfoul (line |territory )?(right|first)/.test(d)) return "foul_right";
  if (/\bcatch(er|es)\b/.test(d))         return "catcher";
  if (/\bpitcher|mound/.test(d))          return "pitcher";
  if (/\bover the (wall|fence)|grand slam/.test(d)) return "beyond_fence";

  // Home run implied zones
  if (/home.?run|hr\b/.test(d)) return "beyond_fence";

  return "unknown";
}

// ─── Score parsing ─────────────────────────────────────────────────────────

function parseScoreFromDesc(desc: string): { away: number; home: number } | null {
  // Format: "Away 3, Home 2" or "3-2" after known signals
  const m = desc.match(/(\d+)[,\s\-]+(\d+)\s*(?:$|[A-Z])/);
  if (m) return { away: Number(m[1]), home: Number(m[2]) };
  return null;
}

function countRunsScored(desc: string, eventType: MlbEventType): number {
  const d = desc.toLowerCase();
  // Grand slam = 4 RBI
  if (/grand slam/.test(d)) return 4;
  // Look for "X score" or "scores"
  const scoreMatch = d.match(/(\w+)\s+score/g) ?? [];
  if (scoreMatch.length) return scoreMatch.length;
  // Sacrifice fly typically 1 run
  if (eventType === "sacrifice_fly") return 1;
  return 0;
}

// ─── Primary player extraction ─────────────────────────────────────────────

export function extractPrimaryPlayer(desc: string): string | null {
  // Strip leading team references (all-caps 2-4 char abbreviations) and grab first name chunk
  const m = desc.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:-[A-Z][a-z]+)?)/);
  return m ? m[1] : null;
}

// ─── Main parse function ───────────────────────────────────────────────────

export function parseMlbEvent(
  rawDescription: string,
  sourceEventId: string,
  inning: number,
  topBottom: "top" | "bottom",
  homeScoreAfter?: number | null,
  awayScoreAfter?: number | null,
): MlbParsedEvent {
  const eventType = parseMlbEventType(rawDescription);
  const isBattedBall = [
    "single", "double", "triple", "home_run",
    "fly_out", "ground_out", "line_out", "pop_out",
    "double_play", "triple_play", "sacrifice_fly", "sacrifice_bunt",
    "fielders_choice",
  ].includes(eventType);

  const hitZone = isBattedBall ? extractHitZone(rawDescription) : null;
  const runsScored = countRunsScored(rawDescription, eventType);
  const isScoringPlay = runsScored > 0 || /score[sd]|run[s]? (score|in)/i.test(rawDescription);

  // Outs recorded by this play
  let outs = 0;
  if (["strikeout","fly_out","ground_out","line_out","pop_out","sacrifice_fly","sacrifice_bunt"].includes(eventType)) outs = 1;
  if (eventType === "double_play") outs = 2;
  if (eventType === "triple_play") outs = 3;

  return {
    sourceEventId,
    rawDescription,
    eventType,
    hitZone,
    isScoringPlay,
    runsScored,
    outs,
    runnersAdvanced: null,
    primaryPlayer: extractPrimaryPlayer(rawDescription),
    inning,
    topBottom,
    homeScoreAfter: homeScoreAfter ?? null,
    awayScoreAfter: awayScoreAfter ?? null,
  };
}

// ─── Game state deriver ────────────────────────────────────────────────────

export function deriveMLBGameState(events: MlbParsedEvent[]): MlbGameState {
  const state: MlbGameState = {
    inning: 1,
    topBottom: "top",
    outs: 0,
    runners: { first: false, second: false, third: false },
    homeScore: 0,
    awayScore: 0,
    balls: 0,
    strikes: 0,
    pitcher: null,
    batter: null,
  };

  for (const ev of events) {
    state.inning = ev.inning;
    state.topBottom = ev.topBottom;

    if (ev.homeScoreAfter != null) state.homeScore = ev.homeScoreAfter;
    if (ev.awayScoreAfter != null) state.awayScore = ev.awayScoreAfter;

    switch (ev.eventType) {
      case "single":
        state.runners.third = state.runners.second;
        state.runners.second = state.runners.first;
        state.runners.first = true;
        break;
      case "double":
        state.runners.third = state.runners.second;
        state.runners.second = false;
        state.runners.first = false;
        state.runners.second = true;
        break;
      case "triple":
        state.runners = { first: false, second: false, third: true };
        break;
      case "home_run":
        state.runners = { first: false, second: false, third: false };
        break;
      case "walk": case "hit_by_pitch": case "intentional_walk":
        if (state.runners.first && state.runners.second) state.runners.third = true;
        if (state.runners.first) state.runners.second = true;
        state.runners.first = true;
        break;
      case "stolen_base": {
        const d = ev.rawDescription.toLowerCase();
        if (/steals? third/.test(d)) { state.runners.third = true; state.runners.second = false; }
        else if (/steals? second/.test(d)) { state.runners.second = true; state.runners.first = false; }
        else if (/steals? home/.test(d)) { state.runners.third = false; }
        break;
      }
      case "caught_stealing": case "pickoff":
        if (state.runners.third) state.runners.third = false;
        else if (state.runners.second) state.runners.second = false;
        else state.runners.first = false;
        state.outs = Math.min(3, state.outs + 1);
        break;
      case "strikeout": case "fly_out": case "ground_out":
      case "line_out": case "pop_out":
        state.outs = Math.min(3, state.outs + ev.outs);
        break;
      case "double_play":
        state.outs = Math.min(3, state.outs + 2);
        if (state.runners.third) state.runners.third = false;
        else if (state.runners.second) state.runners.second = false;
        else state.runners.first = false;
        break;
      case "sacrifice_fly": case "sacrifice_bunt":
        state.outs = Math.min(3, state.outs + 1);
        if (ev.eventType === "sacrifice_fly" && state.runners.third) state.runners.third = false;
        break;
      case "inning_end":
        state.outs = 0;
        state.runners = { first: false, second: false, third: false };
        break;
    }

    if (state.outs >= 3) {
      state.outs = 0;
      state.runners = { first: false, second: false, third: false };
    }

    if (ev.eventType === "pitching_change") state.pitcher = ev.primaryPlayer;
    else state.batter = ev.primaryPlayer;
  }

  return state;
}

// ─── Display helpers ───────────────────────────────────────────────────────

export const MLB_EVENT_LABELS: Record<MlbEventType, string> = {
  single: "Single",
  double: "Double",
  triple: "Triple",
  home_run: "Home Run",
  strikeout: "Strikeout",
  walk: "Walk",
  hit_by_pitch: "HBP",
  intentional_walk: "IBB",
  fly_out: "Fly Out",
  ground_out: "Groundout",
  line_out: "Lineout",
  pop_out: "Pop Out",
  double_play: "Double Play",
  triple_play: "Triple Play",
  fielders_choice: "Fielder's Choice",
  sacrifice_fly: "Sac Fly",
  sacrifice_bunt: "Sac Bunt",
  stolen_base: "Stolen Base",
  caught_stealing: "CS",
  pickoff: "Pickoff",
  wild_pitch: "Wild Pitch",
  passed_ball: "Passed Ball",
  balk: "Balk",
  error: "Error",
  pitching_change: "Pitching Change",
  substitution: "Substitution",
  inning_start: "Inning Start",
  inning_end: "Inning End",
  unknown: "Play",
};

export const MLB_EVENT_COLORS: Record<string, string> = {
  single:          "text-cosmic-green border-cosmic-green/30",
  double:          "text-cosmic-cyan border-cosmic-cyan/30",
  triple:          "text-cosmic-gold border-cosmic-gold/30",
  home_run:        "text-cosmic-gold border-cosmic-gold/60",
  strikeout:       "text-cosmic-red border-cosmic-red/30",
  walk:            "text-primary border-primary/30",
  hit_by_pitch:    "text-primary border-primary/30",
  intentional_walk:"text-primary border-primary/30",
  fly_out:         "text-muted-foreground border-border",
  ground_out:      "text-muted-foreground border-border",
  line_out:        "text-muted-foreground border-border",
  pop_out:         "text-muted-foreground border-border",
  double_play:     "text-cosmic-red border-cosmic-red/30",
  stolen_base:     "text-cosmic-cyan border-cosmic-cyan/30",
  error:           "text-cosmic-gold border-cosmic-gold/30",
};
