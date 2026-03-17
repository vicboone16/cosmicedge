import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

/* ── Decision labels ── */
const DECISION_LABELS = [
  "strong_yes", "yes_playable", "lean_yes", "neutral",
  "lean_no", "pass", "high_risk", "trap_watch", "better_alternative_available",
] as const;

const RISK_GRADES = ["low", "moderate", "elevated", "high", "extreme"] as const;
const CONFIDENCE_GRADES = ["elite", "high", "medium", "cautious", "fragile"] as const;

/* ── Team aliases ── */
const TEAM_ALIASES: Record<string, string> = {
  "lakers": "LAL", "celtics": "BOS", "knicks": "NYK", "warriors": "GSW",
  "bucks": "MIL", "nuggets": "DEN", "suns": "PHX", "heat": "MIA",
  "cavaliers": "CLE", "cavs": "CLE", "thunder": "OKC", "mavericks": "DAL",
  "mavs": "DAL", "grizzlies": "MEM", "kings": "SAC", "wolves": "MIN",
  "timberwolves": "MIN", "pelicans": "NOP", "rockets": "HOU", "hawks": "ATL",
  "bulls": "CHI", "nets": "BKN", "hornets": "CHA", "pistons": "DET",
  "pacers": "IND", "magic": "ORL", "raptors": "TOR", "wizards": "WAS",
  "jazz": "UTA", "spurs": "SAS", "clippers": "LAC", "blazers": "POR",
  "sixers": "PHI", "76ers": "PHI",
};

/* ── Parse tool for question classification ── */
const PARSE_TOOL = {
  type: "function",
  function: {
    name: "parse_betting_question",
    description: "Parse a betting question into structured parameters.",
    parameters: {
      type: "object",
      required: ["query_type"],
      additionalProperties: false,
      properties: {
        query_type: {
          type: "string",
          enum: ["player_prop", "moneyline", "spread", "total", "slip_advice", "comparison", "hedge", "general"],
        },
        player_name: { type: "string" },
        team_name: { type: "string" },
        stat_type: {
          type: "string",
          enum: ["points", "rebounds", "assists", "threes", "steals", "blocks", "turnovers", "pts_reb_ast", "pts_reb", "pts_ast", "reb_ast"],
        },
        direction: { type: "string", enum: ["over", "under"] },
        line_value: { type: "number" },
        market_type: { type: "string", enum: ["moneyline", "spread", "total", "player_prop", "team_total"] },
        is_live: { type: "boolean" },
      },
    },
  },
};

/* ── Resolve player ── */
async function resolvePlayer(sb: any, name: string) {
  if (!name) return null;
  const { data } = await sb.rpc("search_players_unaccent", { search_query: name, max_results: 1 });
  return data?.[0] ? { id: data[0].player_id, name: data[0].player_name, team: data[0].player_team } : null;
}

/* ── Fetch player context ── */
async function fetchPlayerContext(sb: any, playerId: string, statType?: string) {
  const [seasonRes, recentRes, projRes, scorecardRes] = await Promise.all([
    sb.from("player_season_stats").select("*").eq("player_id", playerId).eq("period", "full").order("season", { ascending: false }).limit(1).maybeSingle(),
    sb.from("player_game_stats").select("*, games!inner(start_time, home_abbr, away_abbr, status, league)").eq("player_id", playerId).eq("period", "full").order("games(start_time)", { ascending: false }).limit(10),
    sb.from("nebula_prop_predictions").select("*").eq("player_id", playerId).order("pred_ts", { ascending: false }).limit(5),
    sb.from("ce_scorecards_fast_v9").select("*").eq("player_id", playerId).limit(10),
  ]);

  // Compute hit rates if stat_type and line provided
  let features = null;
  if (statType) {
    const { data: feat } = await sb.rpc("np_build_prop_features", {
      p_player_id: playerId,
      p_prop_type: statType,
      p_line: 0,
    });
    features = feat?.[0] ?? null;
  }

  return {
    season: seasonRes.data,
    recent: recentRes.data ?? [],
    projections: projRes.data ?? [],
    scorecard: scorecardRes.data ?? [],
    features,
  };
}

/* ── Fetch game context ── */
async function fetchGameContext(sb: any, gameId?: string, teamAbbr?: string) {
  let game = null;
  if (gameId) {
    const { data } = await sb.from("games").select("*").eq("id", gameId).maybeSingle();
    game = data;
  } else if (teamAbbr) {
    const abbr = TEAM_ALIASES[teamAbbr.toLowerCase()] ?? teamAbbr.toUpperCase();
    const { data } = await sb.from("games").select("*")
      .or(`home_abbr.eq.${abbr},away_abbr.eq.${abbr}`)
      .gte("start_time", new Date().toISOString().split("T")[0])
      .order("start_time", { ascending: true }).limit(1).maybeSingle();
    game = data;
  }
  if (!game) return { game: null, pace: null, liveState: null, momentum: null };

  const [paceRes, liveRes] = await Promise.all([
    sb.rpc("np_build_pace_features", { p_game_id: game.id }),
    sb.from("live_game_visual_state").select("*").eq("game_id", game.id).maybeSingle(),
  ]);

  return {
    game,
    pace: paceRes.data?.[0] ?? null,
    liveState: liveRes.data,
  };
}

/* ── Compute risk grade ── */
function computeRiskGrade(ctx: any): string {
  let risk = 0;
  if (ctx.blowoutRisk > 0.3) risk += 2;
  if (ctx.foulTrouble) risk += 1;
  if (ctx.minutesInsecure) risk += 1;
  if (ctx.volatilityHigh) risk += 1;
  if (risk <= 0) return "low";
  if (risk <= 1) return "moderate";
  if (risk <= 2) return "elevated";
  if (risk <= 3) return "high";
  return "extreme";
}

/* ── Compute confidence grade ── */
function computeConfidenceGrade(hitProb: number, evPct: number, minutesSecure: boolean): string {
  const score = (hitProb * 40) + (Math.min(evPct, 15) * 2) + (minutesSecure ? 20 : 0);
  if (score >= 70) return "elite";
  if (score >= 55) return "high";
  if (score >= 40) return "medium";
  if (score >= 25) return "cautious";
  return "fragile";
}

/* ── Compute decision label ── */
function computeDecision(hitProb: number, ev: number, riskGrade: string, confGrade: string): string {
  if (riskGrade === "extreme") return "high_risk";
  if (riskGrade === "high" && ev < 3) return "trap_watch";
  if (hitProb >= 0.65 && ev >= 5 && confGrade !== "fragile") return "strong_yes";
  if (hitProb >= 0.55 && ev >= 3) return "yes_playable";
  if (hitProb >= 0.50 && ev >= 1) return "lean_yes";
  if (hitProb < 0.40 || ev < -5) return "pass";
  if (hitProb < 0.45) return "lean_no";
  return "neutral";
}

/* ── Build the assessment via AI synthesis ── */
async function synthesizeAnswer(lovableKey: string, parsed: any, playerCtx: any, gameCtx: any, assessment: any) {
  const systemPrompt = `You are Astra, the CosmicEdge AI betting analyst. You combine mathematical models with cosmic intelligence to deliver sharp, actionable betting verdicts.

Your response MUST be a JSON object with these fields:
- verdict: one of [${DECISION_LABELS.join(",")}]
- answer_summary: 2-3 sentence verdict with projection data
- primary_reason: main supporting factor
- secondary_reason: secondary factor
- warning_note: key risk (or null)
- alternative_suggestion: better play if applicable (or null)

Use the engine data provided. Be specific with numbers. Reference hit probability, EV, momentum, minutes security. Mention astro signals only as secondary context.

Engine assessment: ${JSON.stringify(assessment)}
Player context: ${JSON.stringify(playerCtx?.season ?? {})}
Recent games: ${JSON.stringify((playerCtx?.recent ?? []).slice(0, 3).map((g: any) => ({ pts: g.points, reb: g.rebounds, ast: g.assists, min: g.minutes })))}
Game context: ${JSON.stringify(gameCtx?.game ? { home: gameCtx.game.home_abbr, away: gameCtx.game.away_abbr, status: gameCtx.game.status } : {})}
Pace: ${JSON.stringify(gameCtx?.pace ?? {})}`;

  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Question: "${parsed.originalQuestion}"\nQuery type: ${parsed.query_type}\nPlayer: ${parsed.player_name ?? "N/A"}\nStat: ${parsed.stat_type ?? "N/A"}\nLine: ${parsed.line_value ?? "N/A"}\nDirection: ${parsed.direction ?? "N/A"}` },
      ],
      max_tokens: 600,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) throw new Error(`AI synthesis failed: ${resp.status}`);
  const result = await resp.json();
  const content = result.choices?.[0]?.message?.content;
  try {
    return JSON.parse(content);
  } catch {
    return { verdict: "neutral", answer_summary: content, primary_reason: null, secondary_reason: null, warning_note: null, alternative_suggestion: null };
  }
}

/* ── Main handler ── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { question, game_id, player_id } = await req.json();
    if (!question) return new Response(JSON.stringify({ error: "question required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const lovableKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";

    const sb = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user
    const { data: { user } } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = user?.id;

    // Step 1: Parse the question
    const parseResp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Parse betting questions. Extract player name, stat type, line, direction, team, and query type." },
          { role: "user", content: question },
        ],
        tools: [PARSE_TOOL],
        tool_choice: { type: "function", function: { name: "parse_betting_question" } },
        max_tokens: 300,
        temperature: 0,
      }),
    });

    if (!parseResp.ok) throw new Error(`Parse failed: ${parseResp.status}`);
    const parseResult = await parseResp.json();
    const toolCall = parseResult.choices?.[0]?.message?.tool_calls?.[0];
    const parsed = toolCall?.function?.arguments
      ? (typeof toolCall.function.arguments === "string" ? JSON.parse(toolCall.function.arguments) : toolCall.function.arguments)
      : { query_type: "general" };
    parsed.originalQuestion = question;

    // Step 2: Gather context in parallel
    const resolvedPlayer = parsed.player_name ? await resolvePlayer(sb, parsed.player_name) : (player_id ? { id: player_id, name: "", team: "" } : null);

    const [playerCtx, gameCtx] = await Promise.all([
      resolvedPlayer ? fetchPlayerContext(sb, resolvedPlayer.id, parsed.stat_type) : Promise.resolve(null),
      fetchGameContext(sb, game_id, parsed.team_name),
    ]);

    // Step 3: Compute assessment metrics
    const season = playerCtx?.season;
    const features = playerCtx?.features;
    const projections = playerCtx?.projections ?? [];

    // Hit probability from features or projection
    const latestProj = projections[0];
    const hitProb = features?.hit_l10 ?? latestProj?.hit_prob_l10 ?? 0.5;
    const projectedFinal = features?.mu_l10 ?? latestProj?.mu ?? season?.points ?? 0;
    const lineValue = parsed.line_value ?? 0;
    const ev = latestProj?.edge_score ?? ((hitProb - 0.5) * 100);

    const minutesSecure = (features?.delta_minutes ?? 0) >= -2;
    const blowoutRisk = gameCtx?.pace?.blowout_risk ?? 0;

    const riskGrade = computeRiskGrade({
      blowoutRisk,
      foulTrouble: false,
      minutesInsecure: !minutesSecure,
      volatilityHigh: (features?.coeff_of_var ?? 0) > 0.35,
    });
    const confidenceGrade = computeConfidenceGrade(hitProb, Math.max(ev, 0), minutesSecure);
    const decisionLabel = computeDecision(hitProb, ev, riskGrade, confidenceGrade);

    const assessment = {
      hit_probability: Math.round(hitProb * 1000) / 10,
      projected_final: Math.round(projectedFinal * 10) / 10,
      line_value: lineValue,
      expected_value: Math.round(ev * 10) / 10,
      risk_grade: riskGrade,
      confidence_grade: confidenceGrade,
      decision_label: decisionLabel,
      minutes_secure: minutesSecure,
      blowout_risk: Math.round(blowoutRisk * 100),
      recent_hit_rate_l5: features?.hit_l5 ?? null,
      recent_hit_rate_l10: features?.hit_l10 ?? null,
      volatility_cv: features?.coeff_of_var ?? null,
      player_name: resolvedPlayer?.name ?? parsed.player_name,
      player_team: resolvedPlayer?.team,
    };

    // Step 4: AI synthesis
    const aiAnswer = await synthesizeAnswer(lovableKey, parsed, playerCtx, gameCtx, assessment);

    // Step 5: Persist assessment
    const record = {
      user_id: userId,
      query_text: question,
      query_type: parsed.query_type,
      bet_type: parsed.market_type ?? parsed.query_type,
      player_id: resolvedPlayer?.id ?? null,
      game_id: gameCtx?.game?.id ?? game_id ?? null,
      team_id: resolvedPlayer?.team ?? parsed.team_name ?? null,
      market_type: parsed.market_type ?? null,
      direction: parsed.direction ?? null,
      line_value: parsed.line_value ?? null,
      current_stat: null,
      projected_final: projectedFinal,
      hit_probability: hitProb,
      implied_probability: null,
      expected_value: ev,
      minutes_security_score: minutesSecure ? 0.8 : 0.4,
      foul_risk_level: "low",
      blowout_risk_level: blowoutRisk > 0.3 ? "high" : blowoutRisk > 0.15 ? "moderate" : "low",
      game_momentum_state: gameCtx?.liveState?.momentum_label ?? null,
      player_momentum_state: null,
      astro_signal: null,
      risk_grade: riskGrade,
      confidence_grade: confidenceGrade,
      decision_label: aiAnswer.verdict ?? decisionLabel,
      decision_score: hitProb * 50 + Math.min(ev, 10) * 3,
      primary_reason: aiAnswer.primary_reason,
      secondary_reason: aiAnswer.secondary_reason,
      warning_note: aiAnswer.warning_note,
      alternative_suggestion: aiAnswer.alternative_suggestion,
      answer_summary: aiAnswer.answer_summary,
      engine_inputs: { parsed, features: features ? { hit_l5: features.hit_l5, hit_l10: features.hit_l10, mu_l10: features.mu_l10, cv: features.coeff_of_var } : null },
      engine_outputs: assessment,
    };

    if (userId) {
      // Use service role to insert (bypasses RLS for the insert, user_id is verified)
      const adminSb = createClient(supabaseUrl, serviceKey);
      await adminSb.from("astra_bet_assessment").insert(record);
    }

    return new Response(JSON.stringify({
      success: true,
      assessment: {
        ...assessment,
        verdict: aiAnswer.verdict ?? decisionLabel,
        answer_summary: aiAnswer.answer_summary,
        primary_reason: aiAnswer.primary_reason,
        secondary_reason: aiAnswer.secondary_reason,
        warning_note: aiAnswer.warning_note,
        alternative_suggestion: aiAnswer.alternative_suggestion,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Astra Decision Engine error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
