import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PARSER_VERSION = "pbp_parser_v1";

/* ─── Types ─── */
interface RawPbpEvent {
  game_id: string;
  source_event_id?: string | null;
  source_provider?: string | null;
  sport?: string | null;
  league?: string | null;
  period_number?: number | null;
  period_label?: string | null;
  clock_display?: string | null;
  event_index?: number | null;
  sequence_number?: number | null;
  team_id?: string | null;
  opponent_team_id?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  primary_player_id?: string | null;
  primary_player_name?: string | null;
  secondary_player_id?: string | null;
  secondary_player_name?: string | null;
  tertiary_player_id?: string | null;
  tertiary_player_name?: string | null;
  provider_event_type?: string | null;
  raw_description?: string | null;
  score_home_before?: number | null;
  score_away_before?: number | null;
  score_home_after?: number | null;
  score_away_after?: number | null;
  source_created_at?: string | null;
}

/* ─── Helpers ─── */
function normalizeText(input?: string | null): string {
  if (!input) return "";
  return input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/['']/g, "'")
    .replace(/three-point/gi, "three point")
    .replace(/3-point/gi, "3 point")
    .replace(/3-pt/gi, "3 pt")
    .toLowerCase();
}

function clockToSeconds(clock?: string | null): number | null {
  if (!clock) return null;
  const match = clock.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function inferPointsFromText(text: string): number {
  if (/free throw/.test(text) && /makes/.test(text)) return 1;
  if (/three point|3 point|3 pt/.test(text) && /makes/.test(text)) return 3;
  if (/makes/.test(text)) return 2;
  return 0;
}

/* ─── Zone Detection ─── */
function detectZone(text: string): string {
  if (/free throw/.test(text)) return "free_throw_line";
  if (/left corner/.test(text)) return "corner_3_left";
  if (/right corner/.test(text)) return "corner_3_right";
  if (/left wing/.test(text)) return "wing_3_left";
  if (/right wing/.test(text)) return "wing_3_right";
  if (/top/.test(text) && /three|3/.test(text)) return "top_3";
  if (/dunk|layup/.test(text)) return "restricted_area";
  if (/hook|paint|tip shot|tip-in|tip in/.test(text)) return "paint";
  if (/jumper|jump shot|fadeaway|pullup|stepback|step back/.test(text)) return "midrange_center";
  if (/timeout|official timeout/.test(text)) return "bench";
  if (/enters the game for|substitution/.test(text)) return "bench";
  if (/foul|review|challenge/.test(text)) return "sideline";
  return "unknown";
}

/* ─── Event Detection ─── */
interface DetectedEvent {
  event_type: string;
  event_subtype: string | null;
  animation_key: string;
  points_scored: number;
  possession_result: string | null;
  is_scoring_play: boolean;
  is_turnover: boolean;
  is_rebound: boolean;
  is_foul: boolean;
  is_timeout: boolean;
  is_substitution: boolean;
  parser_confidence: number;
}

function detectEvent(text: string): DetectedEvent {
  const base = {
    event_subtype: null as string | null,
    points_scored: 0,
    possession_result: null as string | null,
    is_scoring_play: false,
    is_turnover: false,
    is_rebound: false,
    is_foul: false,
    is_timeout: false,
    is_substitution: false,
  };

  if (/start of .*quarter|start of overtime/.test(text))
    return { ...base, event_type: "period_start", animation_key: "period_start_reset", parser_confidence: 0.99 };

  if (/end of .*quarter|end of overtime|end of game/.test(text))
    return { ...base, event_type: "period_end", animation_key: "period_end_freeze", parser_confidence: 0.99 };

  if (/enters the game for|substitution/.test(text))
    return { ...base, event_type: "substitution", animation_key: "sub_bench_swap", is_substitution: true, parser_confidence: 0.98 };

  if (/timeout|official timeout|full timeout|team timeout/.test(text))
    return { ...base, event_type: "timeout", animation_key: "timeout_pause", is_timeout: true, parser_confidence: 0.98 };

  if (/review|challenge|instant replay/.test(text))
    return { ...base, event_type: "review", animation_key: "review_pause", parser_confidence: 0.95 };

  if (/makes free throw/.test(text))
    return { ...base, event_type: "free_throw_made", animation_key: "free_throw_make", points_scored: 1, is_scoring_play: true, parser_confidence: 0.99 };

  if (/misses free throw/.test(text))
    return { ...base, event_type: "free_throw_missed", animation_key: "free_throw_miss", parser_confidence: 0.99 };

  if (/offensive rebound|team offensive rebound/.test(text))
    return { ...base, event_type: "rebound_offensive", animation_key: "off_rebound_reset", possession_result: "retain_possession", is_rebound: true, parser_confidence: 0.98 };

  if (/defensive rebound|team defensive rebound/.test(text))
    return { ...base, event_type: "rebound_defensive", animation_key: "def_rebound_secure", possession_result: "change_possession", is_rebound: true, parser_confidence: 0.98 };

  if (/offensive foul/.test(text))
    return { ...base, event_type: "foul_offensive", event_subtype: "offensive_foul", animation_key: "foul_whistle", possession_result: "change_possession", is_turnover: true, is_foul: true, parser_confidence: 0.96 };

  if (/shooting foul/.test(text))
    return { ...base, event_type: "foul_shooting", event_subtype: "shooting_foul", animation_key: "foul_whistle", is_foul: true, parser_confidence: 0.96 };

  if (/personal foul|loose ball foul|technical foul|flagrant foul|take foul/.test(text))
    return { ...base, event_type: "foul_personal", animation_key: "foul_whistle", is_foul: true, parser_confidence: 0.9 };

  if (/traveling|double dribble|8-second violation|5-second violation|lane violation|backcourt violation|shot clock violation/.test(text))
    return { ...base, event_type: "violation", animation_key: "turnover_flip", possession_result: "change_possession", is_turnover: true, parser_confidence: 0.92 };

  if (/turnover|bad pass|lost ball/.test(text))
    return { ...base, event_type: "turnover", animation_key: "turnover_flip", possession_result: "change_possession", is_turnover: true, parser_confidence: 0.97 };

  if (/jump ball|tip won by/.test(text))
    return { ...base, event_type: "jump_ball", animation_key: "jump_ball_start", possession_result: "change_possession", parser_confidence: 0.9 };

  if (/misses/.test(text)) {
    const isThree = /three point|3 point|3 pt/.test(text);
    return { ...base, event_type: "missed_shot", event_subtype: isThree ? "3pt_attempt" : "2pt_attempt", animation_key: isThree ? "miss_3_basic" : "miss_2_basic", parser_confidence: 0.91 };
  }

  if (/makes/.test(text)) {
    const points = inferPointsFromText(text);
    const isThree = points === 3;
    const subtype = /dunk/.test(text) ? "dunk" : /layup/.test(text) ? "layup" : isThree ? "3pt_attempt" : "2pt_attempt";
    const anim = /dunk/.test(text) ? "dunk_finish" : /layup/.test(text) ? "layup_finish" : isThree ? "made_3_basic" : "made_2_basic";
    return { ...base, event_type: "made_shot", event_subtype: subtype, animation_key: anim, points_scored: points, is_scoring_play: true, possession_result: "change_possession", parser_confidence: 0.92 };
  }

  return { ...base, event_type: "unknown", animation_key: "unknown", parser_confidence: 0.25 };
}

/* ─── Score Validation ─── */
function validateScore(raw: RawPbpEvent, parsedPoints: number): string {
  if (raw.score_home_before == null || raw.score_home_after == null ||
      raw.score_away_before == null || raw.score_away_after == null) return "missing_score_context";
  const delta = (raw.score_home_after - raw.score_home_before) + (raw.score_away_after - raw.score_away_before);
  return delta === parsedPoints ? "validated" : "mismatch";
}

/* ─── Main Handler ─── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const raw: RawPbpEvent = await req.json();

    if (!raw?.game_id) {
      return new Response(JSON.stringify({ error: "Missing game_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse
    const normalizedDescription = normalizeText(raw.raw_description);
    const clockSeconds = clockToSeconds(raw.clock_display);
    const detected = detectEvent(normalizedDescription);
    const zoneKey = detectZone(normalizedDescription);
    const scoreStatus = validateScore(raw, detected.points_scored);

    // Determine possession after
    let possessionAfter: string | null = null;
    if (detected.possession_result === "change_possession") possessionAfter = raw.opponent_team_id ?? null;
    else if (detected.possession_result === "retain_possession") possessionAfter = raw.team_id ?? null;

    // Adjust confidence on score mismatch
    const confidence = scoreStatus === "mismatch"
      ? Math.max(0.2, detected.parser_confidence - 0.15)
      : detected.parser_confidence;

    // Build normalized row (matching actual table columns)
    const normalizedRow = {
      game_id: raw.game_id,
      source_event_id: raw.source_event_id ?? null,
      source_provider: raw.source_provider ?? null,
      sport: raw.sport ?? null,
      league: raw.league ?? null,
      period_number: raw.period_number ?? null,
      clock_display: raw.clock_display ?? null,
      clock_seconds_remaining: clockSeconds,
      event_index: raw.event_index ?? null,
      sequence_number: raw.sequence_number ?? null,
      team_id: raw.team_id ?? null,
      opponent_team_id: raw.opponent_team_id ?? null,
      primary_player_id: raw.primary_player_id ?? null,
      primary_player_name: raw.primary_player_name ?? null,
      secondary_player_id: raw.secondary_player_id ?? null,
      secondary_player_name: raw.secondary_player_name ?? null,
      tertiary_player_id: raw.tertiary_player_id ?? null,
      event_type: detected.event_type,
      event_subtype: detected.event_subtype,
      points_scored: detected.points_scored,
      possession_result: detected.possession_result,
      score_home_after: raw.score_home_after ?? null,
      score_away_after: raw.score_away_after ?? null,
      is_scoring_play: detected.is_scoring_play,
      is_turnover: detected.is_turnover,
      is_rebound: detected.is_rebound,
      is_foul: detected.is_foul,
      is_timeout: detected.is_timeout,
      is_substitution: detected.is_substitution,
      zone_key: zoneKey,
      animation_key: detected.animation_key,
      raw_description: raw.raw_description ?? null,
      parser_confidence: confidence,
      parser_version: PARSER_VERSION,
    };

    // Insert normalized event
    const { data: insertedEvent, error: insertError } = await supabase
      .from("normalized_pbp_events")
      .upsert(normalizedRow, {
        onConflict: "game_id,source_event_id",
        ignoreDuplicates: false,
      })
      .select("id")
      .single();

    if (insertError) {
      await supabase.from("pbp_parser_errors").insert({
        game_id: raw.game_id,
        source_event_id: raw.source_event_id ?? null,
        source_provider: raw.source_provider ?? null,
        raw_description: raw.raw_description ?? null,
        error_stage: "insert_normalized_event",
        error_message: insertError.message,
        error_detail: JSON.stringify(insertError),
        parser_version: PARSER_VERSION,
      });
      console.error("insert_normalized_event failed:", insertError.message);
      return new Response(JSON.stringify({ error: "An internal error occurred" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const eventId = insertedEvent.id as string;

    // Update live visual state via RPC
    const { error: stateError } = await supabase.rpc("upsert_live_game_visual_state", {
      p_game_id: raw.game_id,
      p_home_team_id: raw.home_team_id ?? null,
      p_away_team_id: raw.away_team_id ?? null,
      p_period_number: raw.period_number ?? null,
      p_period_label: raw.period_label ?? null,
      p_clock_display: raw.clock_display ?? null,
      p_clock_seconds_remaining: clockSeconds,
      p_home_score: raw.score_home_after ?? null,
      p_away_score: raw.score_away_after ?? null,
      p_possession_team_id: possessionAfter,
      p_possession_confidence: possessionAfter ? 0.8 : 0.35,
      p_last_event_id: eventId,
      p_last_event_type: detected.event_type,
      p_last_event_subtype: detected.event_subtype,
      p_last_event_team_id: raw.team_id ?? null,
      p_last_event_player_name: raw.primary_player_name ?? null,
      p_last_event_text: raw.raw_description ?? null,
      p_last_source_event_id: raw.source_event_id ?? null,
      p_event_zone: zoneKey,
      p_animation_key: detected.animation_key,
      p_parser_version: PARSER_VERSION,
      p_sync_latency_ms: null,
      p_momentum_team_id: detected.is_scoring_play ? raw.team_id ?? null : null,
      p_momentum_score: detected.is_scoring_play ? detected.points_scored : 0,
    });

    if (stateError) {
      await supabase.from("pbp_parser_errors").insert({
        game_id: raw.game_id,
        source_event_id: raw.source_event_id ?? null,
        source_provider: raw.source_provider ?? null,
        raw_description: raw.raw_description ?? null,
        error_stage: "upsert_live_visual_state",
        error_message: stateError.message,
        error_detail: JSON.stringify(stateError),
        parser_version: PARSER_VERSION,
      });
      console.error("upsert_live_visual_state failed:", stateError.message);
    }

    // Enqueue visual event for animation
    const shouldEnqueue = detected.animation_key !== "unknown" && detected.event_type !== "unknown";

    if (shouldEnqueue) {
      const { error: queueError } = await supabase.rpc("enqueue_visual_event", {
        p_game_id: raw.game_id,
        p_normalized_event_id: eventId,
        p_event_type: detected.event_type,
        p_event_subtype: detected.event_subtype ?? null,
        p_team_id: raw.team_id ?? null,
        p_primary_player_id: raw.primary_player_id ?? null,
        p_primary_player_name: raw.primary_player_name ?? null,
        p_clock_display: raw.clock_display ?? null,
        p_zone_key: zoneKey,
        p_animation_key: detected.animation_key,
        p_display_text: raw.raw_description ?? null,
        p_priority: detected.is_scoring_play ? 50 : 100,
      });

      if (queueError) {
        await supabase.from("pbp_parser_errors").insert({
          game_id: raw.game_id,
          source_event_id: raw.source_event_id ?? null,
          source_provider: raw.source_provider ?? null,
          raw_description: raw.raw_description ?? null,
          error_stage: "enqueue_visual_event",
          error_message: queueError.message,
          error_detail: JSON.stringify(queueError),
          parser_version: PARSER_VERSION,
        });
        console.error("enqueue_visual_event failed:", queueError.message);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      normalized_event_id: eventId,
      event_type: detected.event_type,
      event_subtype: detected.event_subtype,
      animation_key: detected.animation_key,
      zone_key: zoneKey,
      parser_confidence: confidence,
      score_validation: scoreStatus,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("pbp-watch-sync error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
