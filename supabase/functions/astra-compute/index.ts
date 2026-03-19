import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

/* ─── Team abbreviation normalization ─── */
const TEAM_ALIASES: Record<string, string> = {
  "portland": "POR", "trail blazers": "POR", "blazers": "POR",
  "philadelphia": "PHI", "76ers": "PHI", "sixers": "PHI", "philly": "PHI",
  "los angeles lakers": "LAL", "lakers": "LAL",
  "los angeles clippers": "LAC", "clippers": "LAC",
  "golden state": "GSW", "warriors": "GSW",
  "boston": "BOS", "celtics": "BOS",
  "milwaukee": "MIL", "bucks": "MIL",
  "denver": "DEN", "nuggets": "DEN",
  "phoenix": "PHX", "suns": "PHX",
  "dallas": "DAL", "mavericks": "DAL", "mavs": "DAL",
  "miami": "MIA", "heat": "MIA",
  "new york": "NYK", "knicks": "NYK",
  "cleveland": "CLE", "cavaliers": "CLE", "cavs": "CLE",
  "memphis": "MEM", "grizzlies": "MEM",
  "sacramento": "SAC", "kings": "SAC",
  "minnesota": "MIN", "timberwolves": "MIN", "wolves": "MIN",
  "oklahoma city": "OKC", "thunder": "OKC",
  "new orleans": "NOP", "pelicans": "NOP",
  "houston": "HOU", "rockets": "HOU",
  "atlanta": "ATL", "hawks": "ATL",
  "chicago": "CHI", "bulls": "CHI",
  "brooklyn": "BKN", "nets": "BKN",
  "charlotte": "CHA", "hornets": "CHA",
  "detroit": "DET", "pistons": "DET",
  "indiana": "IND", "pacers": "IND",
  "orlando": "ORL", "magic": "ORL",
  "toronto": "TOR", "raptors": "TOR",
  "washington": "WAS", "wizards": "WAS",
  "utah": "UTA", "jazz": "UTA",
  "san antonio": "SAS", "spurs": "SAS",
};

/* ─── Intent detection via AI tool-calling ─── */

const INTENT_TOOL = {
  type: "function",
  function: {
    name: "classify_intent",
    description: "Classify the user question intent and extract entities.",
    parameters: {
      type: "object",
      required: ["intent", "entities"],
      additionalProperties: false,
      properties: {
        intent: {
          type: "string",
          enum: [
            "formula_compute",    // needs formula + data → compute
            "stat_lookup",        // needs live data only
            "model_output",       // needs scorecard/model prediction
            "game_projection",    // projected score / totals for game(s)
            "glossary",           // documentation question
            "explanation",        // explain how something works
            "general_chat",       // general conversation
          ],
        },
        entities: {
          type: "object",
          additionalProperties: false,
          properties: {
            player_name: { type: "string" },
            team_abbr: { type: "string", description: "Team abbreviation or city name. For multiple teams, comma-separate: 'POR,PHI'" },
            stat_key: { type: "string", description: "One of: PTS, REB, AST, PRA, FG3M, STL, BLK, TOV, PR, PA, RA, PIE, PER, PACE, ORTG, DRTG, NET_RTG" },
            formula_slug: { type: "string", description: "Slug of the formula if identifiable, e.g. edge_score, pie, momentum_multiplier, pace" },
            game_context: { type: "string", description: "Any game/matchup context mentioned" },
          },
        },
        reasoning: { type: "string", description: "Brief explanation of why this intent was chosen" },
      },
    },
  },
};

async function detectIntent(lovableKey: string, question: string) {
  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: `You classify user questions about sports analytics. Known stat keys: PTS, REB, AST, PRA (points+rebounds+assists), FG3M (3-pointers made), STL, BLK, TOV, PR (points+rebounds), PA (points+assists), RA (rebounds+assists), PIE (player impact estimate), PER (player efficiency rating).
Known formula slugs: edge_score, logistic_prob, momentum_multiplier, pie, per, pace, blowout_risk, defense_difficulty, usage_shift, streak_multiplier, injury_ripple, astro_multiplier, win_probability.
If the user asks for a specific computed value (PIE, edge score, momentum, projection, etc.), use formula_compute.
If asking for raw stats (points per game, recent stats), use stat_lookup.
If asking for model outputs (scorecard, prediction, edge), use model_output.
If asking what something means/is, use glossary or explanation.`,
        },
        { role: "user", content: question },
      ],
      tools: [INTENT_TOOL],
      tool_choice: { type: "function", function: { name: "classify_intent" } },
      max_tokens: 300,
      temperature: 0,
    }),
  });

  if (!resp.ok) throw new Error(`Intent detection failed: ${resp.status}`);
  const result = await resp.json();
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) throw new Error("No intent detected");

  return typeof toolCall.function.arguments === "string"
    ? JSON.parse(toolCall.function.arguments)
    : toolCall.function.arguments;
}

/* ─── Resolve player from DB ─── */

async function resolvePlayer(sb: any, name: string) {
  if (!name) return null;
  const { data } = await sb.rpc("search_players_unaccent", {
    search_query: name,
    max_results: 1,
  });
  if (data?.[0]) {
    return {
      id: data[0].player_id,
      name: data[0].player_name,
      team: data[0].player_team,
      position: data[0].player_position,
      league: data[0].player_league,
    };
  }
  return null;
}

/* ─── Resolve team abbreviations ─── */

function resolveTeamAbbrs(raw: string | undefined): string[] {
  if (!raw) return [];
  // Could be comma-separated or a single value
  const parts = raw.split(/[,;\/]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const resolved: string[] = [];
  for (const part of parts) {
    // Check if already a 3-letter abbreviation
    if (part.length <= 3 && part === part.toUpperCase()) {
      resolved.push(part.toUpperCase());
    } else {
      const mapped = TEAM_ALIASES[part];
      if (mapped) {
        resolved.push(mapped);
      } else {
        // Try partial match
        const match = Object.entries(TEAM_ALIASES).find(([k]) => k.includes(part) || part.includes(k));
        if (match) resolved.push(match[1]);
        else resolved.push(part.toUpperCase().slice(0, 3)); // fallback
      }
    }
  }
  return [...new Set(resolved)];
}

/* ─── Team data retrieval ─── */

async function fetchTeamData(sb: any, teamAbbrs: string[]) {
  if (teamAbbrs.length === 0) return [];
  
  const season = new Date().getMonth() >= 9
    ? new Date().getFullYear()
    : new Date().getFullYear() - 1;
  
  const { data, error } = await sb
    .from("team_season_pace")
    .select("*")
    .in("team_abbr", teamAbbrs)
    .eq("season", season);
  
  if (error) {
    console.warn("team_season_pace query error:", error.message);
    // Try without season filter
    const { data: fallback } = await sb
      .from("team_season_pace")
      .select("*")
      .in("team_abbr", teamAbbrs)
      .order("season", { ascending: false })
      .limit(teamAbbrs.length);
    return fallback || [];
  }
  
  return data || [];
}

/* ─── Formula retrieval ─── */

async function fetchFormula(sb: any, slug: string | null, statKey: string | null) {
  if (slug) {
    const { data } = await sb
      .from("ce_formulas")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (data) return data;
  }

  // Try matching by category or name
  const searchTerms = [slug, statKey].filter(Boolean);
  for (const term of searchTerms) {
    const { data } = await sb
      .from("ce_formulas")
      .select("*")
      .or(`slug.ilike.%${term}%,formula_name.ilike.%${term}%,category.ilike.%${term}%`)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

/* ─── Glossary retrieval ─── */

async function fetchGlossaryTerm(sb: any, question: string) {
  // Extract likely term from question
  const { data } = await sb
    .from("ce_glossary")
    .select("term, short_definition, full_definition, category")
    .or(`term.ilike.%${question}%,slug.ilike.%${question}%`)
    .limit(3);
  return data || [];
}

/* ─── Scorecard / model data retrieval ─── */

async function fetchScorecardData(sb: any, playerId: string, statKey: string | null) {
  // Try ce_scorecards_fast_v9 (supermodel) first, then fall back through chain
  const viewChain = ["ce_scorecards_fast_v9", "ce_scorecards_fast_v6", "ce_scorecards_fast_v2", "ce_scorecards_fast"];
  
  for (const viewName of viewChain) {
    let query = sb.from(viewName).select("*").eq("player_id", playerId);
    if (statKey) query = query.eq("stat_key", statKey);
    
    const { data, error } = await query.limit(10);
    if (!error && data?.length > 0) {
      return { source: viewName, data };
    }
    if (error) {
      console.warn(`${viewName} query failed:`, error.message);
    }
  }
  
  return { source: "", data: [] };
}

/* ─── Player stats retrieval ─── */

async function fetchPlayerStats(sb: any, playerId: string) {
  const { data: seasonStats } = await sb
    .from("player_season_stats")
    .select("*")
    .eq("player_id", playerId)
    .eq("period", "full")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: recentGames } = await sb
    .from("player_game_stats")
    .select("*, games!inner(start_time, home_abbr, away_abbr, status)")
    .eq("player_id", playerId)
    .eq("period", "full")
    .order("games(start_time)", { ascending: false })
    .limit(10);

  return { seasonStats, recentGames: recentGames || [] };
}

/* ─── Model predictions retrieval ─── */

async function fetchModelPredictions(sb: any, playerId: string, statKey: string | null) {
  let query = sb
    .from("model_predictions")
    .select("*")
    .eq("player_id", playerId)
    .order("snapshot_ts", { ascending: false })
    .limit(5);

  if (statKey) {
    const propMap: Record<string, string> = {
      PTS: "points", REB: "rebounds", AST: "assists", PRA: "pts_reb_ast",
      FG3M: "threes", STL: "steals", BLK: "blocks", TOV: "turnovers",
      PR: "pts_reb", PA: "pts_ast", RA: "reb_ast",
    };
    query = query.eq("prop_type", propMap[statKey] || statKey.toLowerCase());
  }

  const { data } = await query;
  return data || [];
}

/* ─── Deterministic computation ─── */

/* ─── Sanity limits for player stats ─── */
const SANITY_LIMITS: Record<string, [number, number]> = {
  points_per_game: [0, 60], points_l10_avg: [0, 60],
  rebounds_per_game: [0, 30], rebounds_l10_avg: [0, 30],
  assists_per_game: [0, 20], assists_l10_avg: [0, 20],
  minutes_l10_avg: [0, 48], fg_pct: [0, 100], three_pct: [0, 100],
  usage_rate: [0, 50], mu: [0, 80], sigma: [0.1, 30],
  projection_mean: [0, 80], adjusted_projection: [0, 80],
};

function validateAndSanitize(vars: Record<string, number>): { cleaned: Record<string, number>; violations: string[]; blocked: boolean } {
  const cleaned: Record<string, number> = {};
  const violations: string[] = [];
  let blocked = false;

  for (const [key, value] of Object.entries(vars)) {
    if (value == null || typeof value !== "number" || isNaN(value)) continue;
    const limits = SANITY_LIMITS[key];
    if (limits) {
      if (value < limits[0] || value > limits[1]) {
        violations.push(`${key}=${value} outside [${limits[0]}, ${limits[1]}]`);
        // Critical vars being insane blocks compute
        if (["mu", "sigma", "projection_mean"].includes(key)) blocked = true;
        continue; // Don't include insane values
      }
    }
    cleaned[key] = value;
  }
  return { cleaned, violations, blocked };
}

/* ─── Deterministic computation ─── */

function computeFromFormula(formula: any, variables: Record<string, number>): { result: number | null; computation: string; missingVars: string[] } {
  const missingVars: string[] = [];
  const formulaVars = formula.variables as any;

  // Check for missing required variables
  if (Array.isArray(formulaVars)) {
    for (const v of formulaVars) {
      const key = typeof v === "string" ? v : v.key || v.name;
      if (key && variables[key] === undefined) missingVars.push(key);
    }
  }

  if (missingVars.length > 0) {
    return { result: null, computation: "Missing variables", missingVars };
  }

  // Common formula computations
  const slug = formula.slug || formula.formula_name?.toLowerCase().replace(/\s+/g, "_");
  let result: number | null = null;
  let computation = "";

  try {
    switch (slug) {
      case "edge_score": {
        const mu = variables.mu ?? variables.projection_mean ?? variables.adjusted_projection;
        const line = variables.line ?? variables.line_value;
        const sigma = variables.sigma ?? variables.std_dev;
        if (mu != null && line != null && sigma != null && sigma > 0) {
          result = Math.round((1 / (1 + Math.exp(-1.6 * ((mu - line) / sigma)))) * 100);
          computation = `1/(1+e^(-1.6×((${mu.toFixed(2)}-${line.toFixed(2)})/${sigma.toFixed(2)}))) × 100 = ${result}`;
        }
        break;
      }
      case "logistic_prob":
      case "logistic_probability": {
        const mu = variables.mu ?? variables.projection_mean;
        const line = variables.line ?? variables.line_value;
        const sigma = variables.sigma ?? variables.std_dev;
        if (mu != null && line != null && sigma != null && sigma > 0) {
          result = Number((1 / (1 + Math.exp(-((mu - line) / sigma)))).toFixed(4));
          computation = `P(over) = 1/(1+e^(-((${mu}-${line})/${sigma}))) = ${result}`;
        }
        break;
      }
      case "momentum_multiplier": {
        const momentum_score = variables.momentum_score ?? 0;
        result = Number(Math.max(0.90, Math.min(1.10, 1 + momentum_score * 0.02)).toFixed(4));
        computation = `max(0.90, min(1.10, 1 + ${momentum_score} × 0.02)) = ${result}`;
        break;
      }
      case "pie":
      case "player_impact_estimate": {
        const { points, fg_made, ft_made, fg_attempted, ft_attempted, def_rebounds, off_rebounds, assists, steals, blocks, fouls, turnovers } = variables as any;
        if (points != null) {
          const playerPie = (points || 0) + (fg_made || 0) + (ft_made || 0) - (fg_attempted || 0) - (ft_attempted || 0) + (def_rebounds || 0) + 0.5 * (off_rebounds || 0) + (assists || 0) + (steals || 0) + 0.5 * (blocks || 0) - (fouls || 0) - (turnovers || 0);
          result = Number(playerPie.toFixed(3));
          computation = `PIE components sum = ${result} (note: divide by game totals for percentage)`;
        }
        break;
      }
      case "streak_multiplier": {
        const streak_flag = variables.streak_flag ?? 0;
        const base = streak_flag > 0 ? 1.05 : streak_flag < 0 ? 0.95 : 1.0;
        result = Number(base.toFixed(4));
        computation = `streak_flag=${streak_flag} → multiplier=${result}`;
        break;
      }
      default: {
        computation = `Formula '${slug}' not yet implemented for deterministic computation`;
        break;
      }
    }
  } catch (e) {
    computation = `Computation error: ${e instanceof Error ? e.message : "unknown"}`;
  }

  return { result, computation, missingVars };
}

/* ─── Extract variables from scorecard/stats data ─── */

function extractVariables(scorecardData: any[], playerStats: any, modelPredictions: any[]): Record<string, number> {
  const vars: Record<string, number> = {};

  // From scorecard
  if (scorecardData.length > 0) {
    const sc = scorecardData[0];
    if (sc.projection_mean != null) vars.projection_mean = sc.projection_mean;
    if (sc.adjusted_projection != null) vars.adjusted_projection = sc.adjusted_projection;
    if (sc.adjusted_projection_v2 != null) vars.adjusted_projection_v2 = sc.adjusted_projection_v2;
    if (sc.adjusted_projection_v6 != null) vars.adjusted_projection_v6 = sc.adjusted_projection_v6;
    if (sc.adjusted_projection_v9 != null) vars.adjusted_projection_v9 = sc.adjusted_projection_v9;
    if (sc.line_value != null) vars.line_value = sc.line_value;
    if (sc.std_dev != null) vars.std_dev = sc.std_dev;
    if (sc.momentum_score != null) vars.momentum_score = sc.momentum_score;
    if (sc.momentum_multiplier != null) vars.momentum_multiplier = sc.momentum_multiplier;
    if (sc.edge_score_v9 != null) vars.edge_score_v9 = sc.edge_score_v9;
    if (sc.edge_score_v6 != null) vars.edge_score_v6 = sc.edge_score_v6;
    if (sc.pie_mean != null) vars.pie_mean = sc.pie_mean;
    if (sc.pie_multiplier != null) vars.pie_multiplier = sc.pie_multiplier;
    if (sc.plus_minus_mean != null) vars.plus_minus_mean = sc.plus_minus_mean;
    if (sc.injury_multiplier != null) vars.injury_multiplier = sc.injury_multiplier;
    if (sc.matchup_multiplier != null) vars.matchup_multiplier = sc.matchup_multiplier;
    if (sc.defense_difficulty_multiplier != null) vars.defense_difficulty_multiplier = sc.defense_difficulty_multiplier;
    if (sc.usage_shift_multiplier != null) vars.usage_shift_multiplier = sc.usage_shift_multiplier;
    if (sc.streak_flag != null) vars.streak_flag = sc.streak_flag;
    if (sc.streak_multiplier != null) vars.streak_multiplier = sc.streak_multiplier;
    if (sc.confidence_tier != null) vars.confidence_tier_raw = sc.confidence_tier;
    if (sc.supermodel_lean != null) vars.supermodel_lean = sc.supermodel_lean;
    // Correlation flags
    if (sc.pts_ast_correlated != null) vars.pts_ast_correlated = sc.pts_ast_correlated ? 1 : 0;
    if (sc.pts_reb_correlated != null) vars.pts_reb_correlated = sc.pts_reb_correlated ? 1 : 0;
    if (sc.reb_ast_correlated != null) vars.reb_ast_correlated = sc.reb_ast_correlated ? 1 : 0;
    // Map for formula convenience — prefer v9 supermodel projection
    vars.mu = sc.adjusted_projection_v9 ?? sc.adjusted_projection_v6 ?? sc.adjusted_projection_v2 ?? sc.adjusted_projection ?? sc.projection_mean ?? 0;
    vars.line = sc.line_value ?? 0;
    vars.sigma = sc.std_dev ?? 1;
  }

  // From season stats
  if (playerStats?.seasonStats) {
    const ss = playerStats.seasonStats;
    if (ss.points_per_game != null) vars.points_per_game = ss.points_per_game;
    if (ss.rebounds_per_game != null) vars.rebounds_per_game = ss.rebounds_per_game;
    if (ss.assists_per_game != null) vars.assists_per_game = ss.assists_per_game;
    if (ss.fg_pct != null) vars.fg_pct = ss.fg_pct;
    if (ss.three_pct != null) vars.three_pct = ss.three_pct;
    if (ss.usage_rate != null) vars.usage_rate = ss.usage_rate;
    if (ss.per != null) vars.per = ss.per;
  }

  // From recent games (compute L10 averages)
  if (playerStats?.recentGames?.length > 0) {
    const games = playerStats.recentGames.slice(0, 10);
    const avg = (key: string) => {
      const vals = games.map((g: any) => g[key]).filter((v: any) => v != null);
      return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
    };
    const ptsL10 = avg("points");
    if (ptsL10 != null) vars.points_l10_avg = Number(ptsL10.toFixed(1));
    const rebL10 = avg("rebounds");
    if (rebL10 != null) vars.rebounds_l10_avg = Number(rebL10.toFixed(1));
    const astL10 = avg("assists");
    if (astL10 != null) vars.assists_l10_avg = Number(astL10.toFixed(1));
    const minL10 = avg("minutes");
    if (minL10 != null) vars.minutes_l10_avg = Number(minL10.toFixed(1));
  }

  // From model predictions
  if (modelPredictions.length > 0) {
    const mp = modelPredictions[0];
    if (mp.mu_final != null) vars.mu_model = mp.mu_final;
    if (mp.sigma_final != null) vars.sigma_model = mp.sigma_final;
    if (mp.edge_score != null) vars.edge_score_model = mp.edge_score;
    if (mp.p_over_final != null) vars.p_over = mp.p_over_final;
    if (mp.confidence_tier != null) vars.confidence_tier_raw = mp.confidence_tier;
  }

  return vars;
}

/* ─── Generate narrative via AI ─── */

async function generateNarrative(
  lovableKey: string,
  question: string,
  intent: any,
  formula: any | null,
  computeResult: any | null,
  variables: Record<string, number>,
  scorecardData: any[],
  player: any | null,
  glossaryTerms: any[],
  teamData: any[] = [],
): Promise<string> {
  const parts: string[] = [];

  if (computeResult?.result != null) {
    parts.push(`COMPUTED RESULT: ${computeResult.result}`);
    parts.push(`COMPUTATION: ${computeResult.computation}`);
  }
  if (computeResult?.missingVars?.length) {
    parts.push(`MISSING VARIABLES: ${computeResult.missingVars.join(", ")}`);
  }
  if (formula) {
    parts.push(`FORMULA USED: ${formula.formula_name}`);
    if (formula.formula_text) parts.push(`FORMULA TEXT: ${formula.formula_text}`);
    if (formula.plain_english) parts.push(`PLAIN ENGLISH: ${formula.plain_english}`);
  }
  if (player) {
    parts.push(`PLAYER: ${player.name} (${player.team}, ${player.position}, ${player.league})`);
  }
  if (Object.keys(variables).length > 0) {
    const keyVars = Object.entries(variables)
      .filter(([_, v]) => v != null)
      .slice(0, 20)
      .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(2) : v}`)
      .join(", ");
    parts.push(`VARIABLES USED: ${keyVars}`);
  }
  if (scorecardData.length > 0) {
    parts.push(`DATA SOURCE: scorecard (${scorecardData.length} rows)`);
  }
  if (glossaryTerms.length > 0) {
    parts.push(`GLOSSARY MATCHES:\n${glossaryTerms.map(t => `  ${t.term}: ${t.short_definition || t.full_definition}`).join("\n")}`);
  }
  if (teamData.length > 0) {
    const teamLines = teamData.map(t =>
      `  ${t.team_abbr}: Pace=${t.avg_pace}, ORtg=${t.off_rating}, DRtg=${t.def_rating}, NetRtg=${t.net_rating}, PPG=${t.avg_points}, Opp PPG=${t.avg_points_allowed}, Games=${t.games_played}`
    ).join("\n");
    parts.push(`TEAM DATA (from team_season_pace):\n${teamLines}`);
  }

  const context = parts.join("\n");

  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are Astra, a sports analytics AI. You've just computed a result for the user.

Present the answer clearly with:
1. The computed value prominently
2. The input values used
3. The formula applied (in plain English)
4. A brief explanation of what this means

Be concise but thorough. Use markdown formatting sparingly.
If data is missing, say EXACTLY what is missing — never guess or fabricate.
If no formula was computed, answer from the data available.
Do NOT reveal internal view names or database table names.`,
        },
        {
          role: "user",
          content: `Question: ${question}\n\nContext:\n${context}`,
        },
      ],
      max_tokens: 800,
      temperature: 0.3,
    }),
  });

  if (!resp.ok) throw new Error("Narrative generation failed");
  const result = await resp.json();
  return result.choices?.[0]?.message?.content || "Unable to generate response.";
}

/* ─── Main handler ─── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { question, debug = false } = await req.json();
    if (!question?.trim()) throw new Error("Missing question");

    const debugLog: any = { question, steps: [] };

    // Step 1: Intent detection
    debugLog.steps.push({ step: "intent_detection", status: "running" });
    const intent = await detectIntent(lovableKey, question);
    debugLog.intent = intent;
    debugLog.steps[debugLog.steps.length - 1].status = "done";
    debugLog.steps[debugLog.steps.length - 1].result = intent;

    // Step 2: Entity resolution
    debugLog.steps.push({ step: "entity_resolution", status: "running" });
    const player = await resolvePlayer(sb, intent.entities?.player_name);
    debugLog.player = player;
    debugLog.steps[debugLog.steps.length - 1].status = "done";
    debugLog.steps[debugLog.steps.length - 1].result = player;

    // Step 3: Formula retrieval
    let formula: any = null;
    if (["formula_compute", "explanation", "model_output"].includes(intent.intent)) {
      debugLog.steps.push({ step: "formula_retrieval", status: "running" });
      formula = await fetchFormula(sb, intent.entities?.formula_slug, intent.entities?.stat_key);
      debugLog.formula = formula;
      debugLog.steps[debugLog.steps.length - 1].status = "done";
      debugLog.steps[debugLog.steps.length - 1].result = formula ? { slug: formula.slug, name: formula.formula_name } : null;
    }

    // Step 4: Data retrieval
    let scorecardResult = { source: "", data: [] as any[] };
    let playerStats: any = null;
    let modelPredictions: any[] = [];
    let glossaryTerms: any[] = [];
    let teamData: any[] = [];

    // Team data retrieval (for pace, ratings, etc.)
    const teamAbbrs = resolveTeamAbbrs(intent.entities?.team_abbr);
    if (teamAbbrs.length > 0) {
      debugLog.steps.push({ step: "team_data_retrieval", status: "running" });
      teamData = await fetchTeamData(sb, teamAbbrs);
      debugLog.steps[debugLog.steps.length - 1].status = "done";
      debugLog.steps[debugLog.steps.length - 1].result = { teams: teamAbbrs, rows: teamData.length };
      debugLog.teamData = teamData;
    }

    if (player?.id) {
      if (["formula_compute", "stat_lookup", "model_output"].includes(intent.intent)) {
        debugLog.steps.push({ step: "scorecard_retrieval", status: "running" });
        scorecardResult = await fetchScorecardData(sb, player.id, intent.entities?.stat_key || null);
        debugLog.steps[debugLog.steps.length - 1].status = "done";
        debugLog.steps[debugLog.steps.length - 1].result = { source: scorecardResult.source, rows: scorecardResult.data.length };

        debugLog.steps.push({ step: "player_stats_retrieval", status: "running" });
        playerStats = await fetchPlayerStats(sb, player.id);
        debugLog.steps[debugLog.steps.length - 1].status = "done";
        debugLog.steps[debugLog.steps.length - 1].result = {
          hasSeason: !!playerStats.seasonStats,
          recentGames: playerStats.recentGames.length,
        };

        debugLog.steps.push({ step: "model_predictions_retrieval", status: "running" });
        modelPredictions = await fetchModelPredictions(sb, player.id, intent.entities?.stat_key || null);
        debugLog.steps[debugLog.steps.length - 1].status = "done";
        debugLog.steps[debugLog.steps.length - 1].result = { count: modelPredictions.length };
      }
    }

    if (intent.intent === "glossary") {
      debugLog.steps.push({ step: "glossary_retrieval", status: "running" });
      glossaryTerms = await fetchGlossaryTerm(sb, question);
      debugLog.steps[debugLog.steps.length - 1].status = "done";
      debugLog.steps[debugLog.steps.length - 1].result = { count: glossaryTerms.length };
    }

    // Step 5: Extract variables, sanitize, and compute
    const rawVariables = extractVariables(scorecardResult.data, playerStats, modelPredictions);
    const { cleaned: variables, violations: sanityViolations, blocked: sanityBlocked } = validateAndSanitize(rawVariables);
    debugLog.variables = variables;
    debugLog.sanity_violations = sanityViolations;
    debugLog.sanity_blocked = sanityBlocked;

    let computeResult: any = null;
    let narrativeBlocked = false;
    let blockReason = "";

    // Gate: entity resolution required for player queries
    if (["formula_compute", "stat_lookup", "model_output"].includes(intent.intent) && intent.entities?.player_name && !player) {
      narrativeBlocked = true;
      blockReason = `Player "${intent.entities.player_name}" could not be resolved`;
    }

    // Gate: sanity blocked
    if (sanityBlocked) {
      narrativeBlocked = true;
      blockReason = `Sanity validation failed: ${sanityViolations.join("; ")}`;
    }

    if (formula && intent.intent === "formula_compute" && !narrativeBlocked) {
      debugLog.steps.push({ step: "computation", status: "running" });
      computeResult = computeFromFormula(formula, variables);
      debugLog.computeResult = computeResult;
      debugLog.steps[debugLog.steps.length - 1].status = "done";
      debugLog.steps[debugLog.steps.length - 1].result = computeResult;
    }

    // For model_output intent without explicit formula, surface scorecard values directly
    if (intent.intent === "model_output" && !computeResult && scorecardResult.data.length > 0 && !narrativeBlocked) {
      const sc = scorecardResult.data[0];
      computeResult = {
        result: sc.edge_score_v9 ?? sc.edge_score_v6 ?? sc.edge_score_v5 ?? sc.edge_score_v4 ?? sc.adjusted_projection_v9 ?? sc.adjusted_projection_v6 ?? sc.adjusted_projection,
        computation: `Direct from ${scorecardResult.source} (Supermodel v9)`,
        missingVars: [],
        confidence_tier: sc.confidence_tier ?? null,
        supermodel_lean: sc.supermodel_lean ?? null,
      };
      debugLog.computeResult = computeResult;
    }

    // Step 6: Generate narrative (only if NOT blocked)
    let narrative: string;
    if (narrativeBlocked) {
      debugLog.steps.push({ step: "narrative_generation", status: "blocked", result: { reason: blockReason } });
      narrative = `⚠️ **Compute Blocked**\n\n${blockReason}\n\n` +
        (sanityViolations.length > 0 ? `**Sanity violations:** ${sanityViolations.join(", ")}\n\n` : "") +
        (player ? `**Resolved player:** ${player.name} (${player.team})\n` : `**Player:** Not resolved\n`) +
        `**Intent:** ${intent.intent}\n` +
        `**Variables available:** ${Object.keys(variables).length}`;
    } else {
      debugLog.steps.push({ step: "narrative_generation", status: "running" });
      narrative = await generateNarrative(
        lovableKey, question, intent, formula, computeResult,
        variables, scorecardResult.data, player, glossaryTerms, teamData,
      );
      debugLog.steps[debugLog.steps.length - 1].status = "done";
    }

    // Build fallback info
    const fallbackInfo: string[] = [];
    if (!player && intent.entities?.player_name) {
      fallbackInfo.push(`Player "${intent.entities.player_name}" not found in database`);
    }
    if (!formula && intent.intent === "formula_compute") {
      fallbackInfo.push(`No matching formula found for "${intent.entities?.formula_slug || intent.entities?.stat_key || "unknown"}"`);
    }
    if (player && scorecardResult.data.length === 0 && ["formula_compute", "model_output"].includes(intent.intent)) {
      fallbackInfo.push(`No scorecard data found for ${player.name}${intent.entities?.stat_key ? ` (${intent.entities.stat_key})` : ""} — model may not have run yet for today's games`);
    }
    if (sanityViolations.length > 0) {
      fallbackInfo.push(`Sanity violations detected: ${sanityViolations.join("; ")}`);
    }

    const response: any = {
      success: !narrativeBlocked,
      compute_blocked: narrativeBlocked,
      block_reason: blockReason || null,
      answer: narrative,
      computed_value: computeResult?.result ?? null,
      formula_used: formula ? {
        name: formula.formula_name,
        slug: formula.slug,
        text: formula.formula_text,
        plain_english: formula.plain_english,
      } : null,
      variables_used: variables,
      sanity_violations: sanityViolations,
      data_source: scorecardResult.source || null,
      data_rows: scorecardResult.data.length,
      intent: intent.intent,
      player: player ? { name: player.name, team: player.team, id: player.id } : null,
      fallback_info: fallbackInfo.length > 0 ? fallbackInfo : null,
    };

    if (debug) {
      response.debug = debugLog;
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("astra-compute error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        fallback: true,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
