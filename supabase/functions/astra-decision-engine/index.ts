import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

/* ── Decision labels ── */
const DECISION_LABELS = [
  "strong_yes", "yes_playable", "lean_yes", "neutral",
  "lean_no", "pass", "high_risk", "trap_watch", "better_alternative_available",
] as const;

/* ── Sanity limits (server-side mirror) ── */
const SANITY_LIMITS: Record<string, { min: number; max: number; label: string }> = {
  points: { min: 0, max: 80, label: "Points" },
  rebounds: { min: 0, max: 35, label: "Rebounds" },
  assists: { min: 0, max: 30, label: "Assists" },
  steals: { min: 0, max: 12, label: "Steals" },
  blocks: { min: 0, max: 15, label: "Blocks" },
  three_made: { min: 0, max: 16, label: "3PM" },
  turnovers: { min: 0, max: 15, label: "Turnovers" },
  minutes: { min: 0, max: 60, label: "Minutes" },
};

interface SanityViolation { key: string; value: number; reason: string }

function runSanityChecks(season: any, features: any): SanityViolation[] {
  const violations: SanityViolation[] = [];
  if (!season) return violations;
  const checks: [string, number | null | undefined][] = [
    ["points", season.points], ["rebounds", season.rebounds],
    ["assists", season.assists], ["steals", season.steals],
    ["blocks", season.blocks], ["minutes", season.minutes],
  ];
  for (const [key, val] of checks) {
    if (val == null) continue;
    const limit = SANITY_LIMITS[key];
    if (limit && (val < limit.min || val > limit.max)) {
      violations.push({ key, value: val, reason: `${limit.label} = ${val} outside [${limit.min}, ${limit.max}]` });
    }
  }
  // Check features
  if (features?.mu_l10 != null && (features.mu_l10 < 0 || features.mu_l10 > 80)) {
    violations.push({ key: "mu_l10", value: features.mu_l10, reason: `Rolling mean ${features.mu_l10} is outside [0, 80]` });
  }
  return violations;
}

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

/* ── Verify player is on active roster for game ── */
async function verifyPlayerGameParticipation(sb: any, playerId: string, gameId: string | null): Promise<{ valid: boolean; detail: string }> {
  if (!gameId) return { valid: true, detail: "No game to validate against" };
  
  // Check if player's team matches game participants
  const [playerRes, gameRes] = await Promise.all([
    sb.from("players").select("team").eq("id", playerId).maybeSingle(),
    sb.from("games").select("home_abbr, away_abbr").eq("id", gameId).maybeSingle(),
  ]);
  
  if (!playerRes.data || !gameRes.data) return { valid: false, detail: "Could not verify player/game" };
  
  const playerTeam = playerRes.data.team;
  const { home_abbr, away_abbr } = gameRes.data;
  
  if (playerTeam === home_abbr || playerTeam === away_abbr) {
    return { valid: true, detail: `${playerTeam} participates in ${home_abbr} vs ${away_abbr}` };
  }
  return { valid: false, detail: `Player team ${playerTeam} not in game ${home_abbr} vs ${away_abbr}` };
}

/* ── Fetch player context ── */
async function fetchPlayerContext(sb: any, playerId: string, statType?: string) {
  const [seasonRes, recentRes, projRes, scorecardRes] = await Promise.all([
    sb.from("player_season_stats").select("*").eq("player_id", playerId).eq("period", "full").order("season", { ascending: false }).limit(1).maybeSingle(),
    sb.from("player_game_stats").select("*, games!inner(start_time, home_abbr, away_abbr, status, league)").eq("player_id", playerId).eq("period", "full").order("games(start_time)", { ascending: false }).limit(10),
    sb.from("nebula_prop_predictions").select("*").eq("player_id", playerId).order("pred_ts", { ascending: false }).limit(5),
    sb.from("ce_scorecards_fast_v9").select("*").eq("player_id", playerId).limit(10),
  ]);

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
  if (!game) return { game: null, pace: null, liveState: null };

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

    const { data: { user } } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = user?.id;

    // ── Pipeline tracking ──
    const pipeline: { step: string; status: string; detail: string; data?: any }[] = [];

    // Step 0: Model activation verification
    const adminSb = createClient(supabaseUrl, serviceKey);
    const { data: activationState } = await adminSb
      .from("model_activation_state")
      .select("*")
      .eq("scope_type", "global")
      .eq("scope_key", "default")
      .maybeSingle();

    const modelInfo = activationState
      ? {
          id: activationState.active_model_id,
          version: activationState.active_model_version ?? "unknown",
          scope: `${activationState.scope_type}/${activationState.scope_key}`,
          runtime_status: activationState.runtime_status,
          cache_token: activationState.cache_bust_token,
          confirmed_at: activationState.runtime_confirmed_at,
        }
      : null;

    pipeline.push({
      step: "Model Activation",
      status: modelInfo?.runtime_status === "confirmed" ? "ok" : modelInfo ? "partial" : "skipped",
      detail: modelInfo
        ? `${modelInfo.id.slice(0, 8)}… v${modelInfo.version} [${modelInfo.runtime_status}]`
        : "No model activation state",
      data: modelInfo,
    });

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

    // Step 2: Entity resolution
    const resolvedPlayer = parsed.player_name ? await resolvePlayer(sb, parsed.player_name) : (player_id ? { id: player_id, name: "", team: "" } : null);
    
    const needsPlayer = ["player_prop", "comparison"].includes(parsed.query_type);
    if (needsPlayer && !resolvedPlayer) {
      pipeline.push({ step: "Entity Resolution", status: "failed", detail: `Player "${parsed.player_name}" not found` });
      
      // BLOCKED: Return structured failure, no narrative
      return new Response(JSON.stringify({
        success: false,
        compute_blocked: true,
        block_reason: `Player "${parsed.player_name}" could not be resolved`,
        pipeline,
        assessment: {
          decision_label: "neutral",
          confidence_grade: "fragile",
          risk_grade: "moderate",
          answer_summary: null,
          primary_reason: null,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    pipeline.push({ step: "Entity Resolution", status: resolvedPlayer ? "ok" : "skipped", detail: resolvedPlayer ? `${resolvedPlayer.name} (${resolvedPlayer.team})` : "Not required" });

    // Step 3: Game resolution + participation verification
    const [playerCtx, gameCtx] = await Promise.all([
      resolvedPlayer ? fetchPlayerContext(sb, resolvedPlayer.id, parsed.stat_type) : Promise.resolve(null),
      fetchGameContext(sb, game_id, parsed.team_name),
    ]);

    pipeline.push({
      step: "Game Resolution",
      status: gameCtx?.game ? "ok" : "partial",
      detail: gameCtx?.game ? `${gameCtx.game.home_abbr} vs ${gameCtx.game.away_abbr}` : "No game found",
    });

    // Verify player participates in resolved game
    if (resolvedPlayer && gameCtx?.game) {
      const participation = await verifyPlayerGameParticipation(sb, resolvedPlayer.id, gameCtx.game.id);
      pipeline.push({
        step: "Roster Verification",
        status: participation.valid ? "ok" : "failed",
        detail: participation.detail,
      });
      
      if (!participation.valid) {
        return new Response(JSON.stringify({
          success: false,
          compute_blocked: true,
          block_reason: `Player ${resolvedPlayer.name} (${resolvedPlayer.team}) does not participate in ${gameCtx.game.home_abbr} vs ${gameCtx.game.away_abbr}`,
          pipeline,
          assessment: {
            decision_label: "neutral",
            confidence_grade: "fragile",
            answer_summary: null,
          },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Step 4: Variable retrieval + sanity check + grain metadata
    const season = playerCtx?.season;
    const features = playerCtx?.features;
    const projections = playerCtx?.projections ?? [];

    // Build variable manifest with grain/source metadata
    const variableManifest: { key: string; value: any; source: string; grain: string; as_of: string }[] = [];
    if (season) {
      const asOf = season.updated_at ?? season.created_at ?? new Date().toISOString();
      for (const k of ["points", "rebounds", "assists", "steals", "blocks", "minutes", "three_made", "turnovers"]) {
        if (season[k] != null) variableManifest.push({ key: k, value: season[k], source: "player_season_stats", grain: "player_season", as_of: asOf });
      }
    }
    if (features) {
      const featureKeys = ["hit_l5", "hit_l10", "hit_l20", "mu_l10", "sigma_l10", "mu_season", "sigma_season", "coeff_of_var", "minutes_l5_avg", "minutes_season_avg", "usage_proxy_l10", "usage_proxy_season"];
      for (const k of featureKeys) {
        if (features[k] != null) variableManifest.push({ key: k, value: features[k], source: "np_build_prop_features", grain: "player_last_n", as_of: new Date().toISOString() });
      }
    }

    // Grain mismatch detection: team vars in player compute
    const grainMismatches: string[] = [];
    if (needsPlayer && gameCtx?.pace) {
      // Pace vars are team-level — flag but don't block (they're used correctly as environment context)
      // Only block if team-level vars were accidentally used AS player stat inputs
    }

    const varsRetrieved = [season, features, projections.length > 0].filter(Boolean).length;
    pipeline.push({
      step: "Variable Retrieval",
      status: varsRetrieved >= 2 ? "ok" : varsRetrieved >= 1 ? "partial" : "failed",
      detail: `season=${!!season}, features=${!!features}, projections=${projections.length}, manifest=${variableManifest.length} vars`,
      data: { variable_count: variableManifest.length, grain_mismatches: grainMismatches },
    });

    // Step 5: Sanity validation
    const sanityViolations = runSanityChecks(season, features);
    pipeline.push({
      step: "Sanity Validation",
      status: sanityViolations.length === 0 ? "ok" : "failed",
      detail: sanityViolations.length > 0 ? sanityViolations.map(v => v.reason).join("; ") : "All values in range",
    });

    if (sanityViolations.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        compute_blocked: true,
        block_reason: `Sanity check failed: ${sanityViolations.map(v => v.reason).join(", ")}`,
        pipeline,
        sanity_violations: sanityViolations,
        assessment: {
          decision_label: "neutral",
          confidence_grade: "fragile",
          risk_grade: "high",
          answer_summary: null,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 6: Deterministic compute
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

    pipeline.push({ step: "Deterministic Compute", status: "ok", detail: `decision=${decisionLabel}, conf=${confidenceGrade}` });

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

    // Step 7: AI synthesis (only if compute passed)
    pipeline.push({ step: "Narrative Generation", status: "ok", detail: "Compute passed, generating narrative" });
    const aiAnswer = await synthesizeAnswer(lovableKey, parsed, playerCtx, gameCtx, assessment);

    // Step 8: Persist assessment
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
      engine_inputs: {
        parsed,
        features: features ? { hit_l5: features.hit_l5, hit_l10: features.hit_l10, mu_l10: features.mu_l10, cv: features.coeff_of_var } : null,
        model_activation: modelInfo,
        variable_manifest_count: variableManifest.length,
      },
      engine_outputs: assessment,
    };

    if (userId) {
      const adminSb = createClient(supabaseUrl, serviceKey);
      await adminSb.from("astra_bet_assessment").insert(record);
    }

    return new Response(JSON.stringify({
      success: true,
      pipeline,
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
    return new Response(JSON.stringify({
      success: false,
      compute_blocked: true,
      block_reason: `Engine error: ${err.message}`,
      pipeline: [{ step: "Engine", status: "failed", detail: err.message }],
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
