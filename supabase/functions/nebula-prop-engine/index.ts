import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ──────────── Math helpers ──────────── */

function normCdf(z: number): number {
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
  const poly =
    ((((1.330274429 * t - 1.821255978) * t + 1.781477937) * t - 0.356563782) *
      t +
      0.319381530) *
    t;
  const approx = 1.0 - 0.3989422804014327 * Math.exp(-0.5 * z * z) * poly;
  return z < 0 ? 1.0 - approx : approx;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* ──────────── market_key → prop_type mapping ──────────── */

const MARKET_TO_PROP: Record<string, string> = {
  player_points: "points",
  player_rebounds: "rebounds",
  player_assists: "assists",
  player_steals: "steals",
  player_blocks: "blocks",
  player_threes: "threes",
  player_three_pointers_made: "threes",
  player_turnovers: "turnovers",
  player_pts_reb_ast: "pts_reb_ast",
  player_pts_reb: "pts_reb",
  player_pts_ast: "pts_ast",
  player_reb_ast: "reb_ast",
  // Alternative formats from some providers
  "points+rebounds+assists": "pts_reb_ast",
  "points+rebounds": "pts_reb",
  "points+assists": "pts_ast",
  "rebounds+assists": "reb_ast",
};

/* ──────────── EdgeScore v1 computation (legacy) ──────────── */

interface Features {
  hit_l5: number;
  hit_l10: number;
  hit_l20: number;
  std_dev_l10: number;
  coeff_of_var: number;
  minutes_l5_avg: number;
  minutes_season_avg: number;
  delta_minutes: number;
  role_up: boolean;
  mu_rolling_l10: number;
  sigma_rolling_l10: number;
  mu_season: number;
  sigma_season: number;
  games_count: number;
}

function computeEdgeScore(
  f: Features,
  lineMoveDelta: number | null,
  astroBoost: number,
): { edge_score: number; components: Record<string, number> } {
  const hitRateScore = (f.hit_l10 ?? 0) * 100;
  const minutesTrendScore = clamp(50 + (f.delta_minutes ?? 0) * (50 / 3), 0, 100);
  const matchupScore = 50;
  const lmDelta = lineMoveDelta ?? 0;
  const lineMovementScore = clamp(50 + lmDelta * 10, 0, 100);
  const seasonHitRateScore = (f.hit_l20 ?? f.hit_l10 ?? 0) * 100;
  const volatilityPenalty = clamp((f.coeff_of_var ?? 0) * 100, 0, 100);
  const astroScore = clamp(50 + astroBoost * 50, 0, 100);

  const raw =
    hitRateScore * 0.35 +
    minutesTrendScore * 0.15 +
    matchupScore * 0.15 +
    lineMovementScore * 0.15 +
    seasonHitRateScore * 0.10 +
    volatilityPenalty * -0.10 +
    astroScore * 0.10;

  return {
    edge_score: clamp(Math.round(raw * 10) / 10, 0, 100),
    components: {
      edge_hitl10: +(hitRateScore * 0.35).toFixed(2),
      edge_minutes: +(minutesTrendScore * 0.15).toFixed(2),
      edge_matchup: +(matchupScore * 0.15).toFixed(2),
      edge_line_move: +(lineMovementScore * 0.15).toFixed(2),
      edge_season: +(seasonHitRateScore * 0.10).toFixed(2),
      edge_vol_penalty: +(volatilityPenalty * -0.10).toFixed(2),
      edge_astro: +(astroScore * 0.10).toFixed(2),
    },
  };
}

/* ──────────── PacePulse Adjustments (exact user formulas) ──────────── */
// α = 0.6 (pace impacts mean), β = 0.25 (blowout suppresses mean), γ = 0.35 (minutes vol bumps variance)
const PACE_ALPHA = 0.6;
const PACE_BETA = 0.25;
const PACE_GAMMA = 0.35;

interface PaceAdjustments {
  mu_adjusted: number;
  sigma_adjusted: number;
  pace_mu_adjust: number;
  pace_sigma_adjust: number;
}

function applyPacePulse(
  mu0: number,
  sigma0: number,
  teamPaceDelta: number | null,
  blowoutRisk: number | null,
  minutesVolatility: number | null,
): PaceAdjustments {
  const paceDelta = (teamPaceDelta ?? 0) / 100; // convert percentage
  const blowout = blowoutRisk ?? 0;
  const minVol = minutesVolatility ?? 0;

  // μ₁ = μ₀ · (1 + α·pace_delta) · (1 - β·blowout_risk)
  const mu1 = mu0 * (1 + PACE_ALPHA * paceDelta) * (1 - PACE_BETA * blowout);
  // σ₁ = σ₀ · (1 + γ·minutes_volatility)
  const sigma1 = sigma0 * (1 + PACE_GAMMA * minVol);

  return {
    mu_adjusted: mu1,
    sigma_adjusted: Math.max(sigma1, 0.5),
    pace_mu_adjust: +(mu1 - mu0).toFixed(6),
    pace_sigma_adjust: +(sigma1 - sigma0).toFixed(6),
  };
}

/* ──────────── TransitLift (Phase 1E) ──────────── */

interface TransitLiftResult {
  astro_mu_adjust: number;
  astro_sigma_adjust: number;
  astro_boost: number;
  transit_boost_factor: number;   // [-0.03, +0.03]
  volatility_shift: number;      // [-0.08, +0.12]
  confidence_adjustment: number; // [-0.10, +0.10]
  astro_summary: Record<string, any> | null;
}

function computeTransitLift(
  transits: Array<{ aspect: string; planet: string; natal_planet?: string; orb?: number }>,
): TransitLiftResult {
  const empty: TransitLiftResult = {
    astro_mu_adjust: 0, astro_sigma_adjust: 0, astro_boost: 0,
    transit_boost_factor: 0, volatility_shift: 0, confidence_adjustment: 0,
    astro_summary: null,
  };
  if (!transits || transits.length === 0) return empty;

  const ASPECT_WEIGHTS: Record<string, number> = {
    conjunction: 0.6, trine: 0.5, sextile: 0.3,
    square: -0.4, opposition: -0.3, quincunx: -0.15,
  };
  const PLANET_WEIGHTS: Record<string, number> = {
    mars: 1.0, jupiter: 0.8, sun: 0.7, moon: 0.5, venus: 0.3,
    mercury: 0.4, saturn: -0.6, neptune: -0.3, uranus: 0.2, pluto: 0.4,
  };

  let muSignal = 0;
  let sigmaSignal = 0;
  let confSignal = 0;

  for (const t of transits) {
    const aspectKey = (t.aspect || "").toLowerCase().replace(/\s+/g, "");
    const planetKey = (t.planet || "").toLowerCase();
    const aspectW = ASPECT_WEIGHTS[aspectKey] ?? 0;
    const planetW = PLANET_WEIGHTS[planetKey] ?? 0;
    const orbDecay = t.orb != null ? Math.max(0, 1 - t.orb / 10) : 0.7;

    const signal = aspectW * planetW * orbDecay;
    muSignal += signal;

    // Confidence: positive aspects boost confidence, negative drag it
    confSignal += signal * 0.3;

    if (planetKey === "uranus") sigmaSignal += Math.abs(aspectW) * orbDecay * 0.5;
    if (planetKey === "saturn" && aspectW < 0) sigmaSignal += Math.abs(aspectW) * orbDecay * 0.3;
  }

  // Exact bounds from spec:
  // transit_boost_factor: [-0.03, +0.03]
  const transit_boost_factor = clamp(muSignal * 0.01, -0.03, 0.03);
  // volatility_shift: [-0.08, +0.12]
  const volatility_shift = clamp(sigmaSignal * 0.05 - 0.02, -0.08, 0.12);
  // confidence_adjustment: [-0.10, +0.10]
  const confidence_adjustment = clamp(confSignal * 0.05, -0.10, 0.10);

  const astro_boost = clamp(0.5 + muSignal * 0.1, 0, 1);

  return {
    astro_mu_adjust: transit_boost_factor,  // fractional, applied as μ₂ = μ₁ · (1 + transit_boost_factor)
    astro_sigma_adjust: volatility_shift,   // fractional, applied as σ₂ = σ₁ · (1 + volatility_shift)
    astro_boost,
    transit_boost_factor,
    volatility_shift,
    confidence_adjustment,
    astro_summary: {
      transit_count: transits.length,
      mu_signal: +muSignal.toFixed(4),
      sigma_signal: +sigmaSignal.toFixed(4),
      conf_signal: +confSignal.toFixed(4),
    },
  };
}

/* ──────────── EdgeScore v2.0 (EV-based) ──────────── */

function americanToImplied(odds: number | null): number | null {
  if (odds == null) return null;
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

interface EdgeScoreV2Result {
  edge_score_v20: number;
  confidence_tier: string;
  p_model: number;
  p_implied: number | null;
  edge_raw: number;
}

function computeEdgeScoreV2(
  pModel: number,
  odds: number | null,
  blowoutRisk: number,
  minutesVolatility: number,
  teamPaceDelta: number,
  confidenceAdjustment: number,
  sigma2: number,
  volatilityShift: number,
): EdgeScoreV2Result {
  // Step 1: implied probability
  const pImp = americanToImplied(odds);

  // Step 2: raw edge
  const edgeRaw = pImp != null ? pModel - pImp : pModel - 0.5;

  // Step 3: environment penalty multiplier [0.6, 1.05]
  const mEnvRaw = 1 - 0.25 * blowoutRisk - 0.15 * minutesVolatility + 0.05 * (teamPaceDelta / 100);
  const mEnv = clamp(mEnvRaw, 0.6, 1.05);
  const edgeAdj = edgeRaw * mEnv;

  // Step 4: cosmic confidence boost [0.9, 1.1]
  const mAstro = clamp(1 + confidenceAdjustment, 0.9, 1.1);

  // Step 5: EdgeScore = 100 · edge_adj · m_astro
  const edgeScore = 100 * edgeAdj * mAstro;

  // Step 6: confidence tiers
  let tier = "No Bet";
  if (blowoutRisk > 0.65) {
    tier = "No Bet";
  } else if (edgeScore >= 6 && volatilityShift < 0.08) {
    tier = "S";
  } else if (edgeScore >= 4) {
    tier = "A";
  } else if (edgeScore >= 2) {
    tier = "B";
  } else if (edgeScore >= 1) {
    tier = "C";
  }

  return {
    edge_score_v20: +edgeScore.toFixed(4),
    confidence_tier: tier,
    p_model: +pModel.toFixed(6),
    p_implied: pImp != null ? +pImp.toFixed(6) : null,
    edge_raw: +edgeRaw.toFixed(6),
  };
}

function determineSide(pOver: number): string {
  return pOver >= 0.5 ? "over" : "under";
}

function computeConfidence(pOver: number): number {
  return clamp(Math.abs(pOver - 0.5) * 2, 0, 1);
}

function computeRisk(cv: number, sigma: number): number {
  const cvPart = clamp(cv / 0.5, 0, 1) * 0.6;
  const sigmaPart = clamp(sigma / 10, 0, 1) * 0.4;
  return clamp(cvPart + sigmaPart, 0, 1);
}

function computeStreak(hits: boolean[]): number {
  if (!hits.length) return 0;
  const first = hits[0];
  let count = 0;
  for (const h of hits) {
    if (h === first) count++;
    else break;
  }
  return first ? count : -count;
}

/* ──────────── Counting prop types (pace-sensitive) ──────────── */
const COUNTING_PROPS = new Set([
  "points", "rebounds", "assists", "threes", "steals", "blocks",
  "pts_reb_ast", "pts_reb", "pts_ast", "reb_ast", "turnovers",
]);

/* ──────────── NBA default sigmas for sparse-data fallback ──────────── */
const NBA_DEFAULT_SIGMA: Record<string, number> = {
  points: 6.0,
  rebounds: 2.5,
  assists: 2.0,
  threes: 1.5,
  steals: 0.9,
  blocks: 0.9,
  turnovers: 1.2,
  pts_reb_ast: 7.5,
  pts_reb: 7.0,
  pts_ast: 6.5,
  reb_ast: 3.0,
};

/* ──────────── Main handler ──────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const gameId: string | undefined = body.game_id;
    const modelKey = "nebula_v1";

    if (!gameId) {
      return new Response(JSON.stringify({ error: "game_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch game info
    const { data: game, error: gameErr } = await sb
      .from("games")
      .select("id, league, home_abbr, away_abbr, start_time, status")
      .eq("id", gameId)
      .single();

    if (gameErr || !game) {
      return new Response(
        JSON.stringify({ error: "Game not found", detail: gameErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Fetch props — try legacy player_props first, fall back to nba_player_props_live
    interface MappedProp {
      player_name: string;
      prop_type: string;
      line: number;
      over_price: number | null;
      under_price: number | null;
      bookmaker: string;
    }

    const seenKeys = new Set<string>();
    const mappedProps: MappedProp[] = [];

    // 2a. Legacy player_props table
    const { data: rawProps } = await sb
      .from("player_props")
      .select("id, game_id, player_name, market_key, line, over_price, under_price, bookmaker")
      .eq("game_id", gameId)
      .order("bookmaker", { ascending: true });

    if (rawProps && rawProps.length > 0) {
      for (const p of rawProps) {
        const propType = MARKET_TO_PROP[p.market_key];
        if (!propType) continue;
        const key = `${p.player_name}:${propType}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        mappedProps.push({
          player_name: p.player_name,
          prop_type: propType,
          line: p.line ?? 0,
          over_price: p.over_price,
          under_price: p.under_price,
          bookmaker: p.bookmaker ?? "consensus",
        });
      }
    }

    // 2b. If legacy empty, try nba_player_props_live (BDL pipeline target)
    if (mappedProps.length === 0) {
      const { data: liveProps } = await sb
        .from("nba_player_props_live")
        .select("id, game_key, player_name, prop_type, line_value, over_odds, under_odds, vendor")
        .eq("game_key", gameId)
        .limit(1000);

      if (liveProps && liveProps.length > 0) {
        for (const p of liveProps) {
          // prop_type in nba_player_props_live may already be canonical or market-style
          const propType = MARKET_TO_PROP[p.prop_type] ?? p.prop_type;
          if (!COUNTING_PROPS.has(propType)) continue;
          const pName = p.player_name ?? "Unknown";
          const key = `${pName}:${propType}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          mappedProps.push({
            player_name: pName,
            prop_type: propType,
            line: p.line_value ?? 0,
            over_price: p.over_odds,
            under_price: p.under_odds,
            bookmaker: p.vendor ?? "balldontlie",
          });
        }
      }
    }

    if (mappedProps.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No props found for game", predictions: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Resolve player names → player IDs
    const uniqueNames = [...new Set(mappedProps.map((p) => p.player_name))];
    const playerMap: Record<string, { id: string; team: string }> = {};

    // 4a. Direct name match — prefer players on game teams to avoid same-name collisions
    const gameTeams = [game.home_abbr, game.away_abbr];
    for (let i = 0; i < uniqueNames.length; i += 50) {
      const batch = uniqueNames.slice(i, i + 50);
      const { data: players } = await sb
        .from("players")
        .select("id, name, team")
        .eq("league", game.league || "NBA")
        .in("name", batch);
      if (players) {
        // Group by name to detect collisions
        const byName = new Map<string, typeof players>();
        for (const pl of players) {
          if (!byName.has(pl.name)) byName.set(pl.name, []);
          byName.get(pl.name)!.push(pl);
        }
        for (const [name, matches] of byName) {
          if (matches.length === 1) {
            playerMap[name] = { id: matches[0].id, team: matches[0].team };
          } else {
            // Prefer player on one of the game's teams
            const gamePlayer = matches.find(m => gameTeams.includes(m.team));
            if (gamePlayer) {
              playerMap[name] = { id: gamePlayer.id, team: gamePlayer.team };
            } else {
              playerMap[name] = { id: matches[0].id, team: matches[0].team };
            }
          }
        }
      }
    }

    // 4b. For "Player {bdlId}" names, resolve via bdl_player_cache → players
    const unresolvedBdlNames = uniqueNames.filter(n => n.startsWith("Player ") && !playerMap[n]);
    if (unresolvedBdlNames.length > 0) {
      const bdlIds = unresolvedBdlNames.map(n => n.replace("Player ", ""));
      const { data: cached } = await sb
        .from("bdl_player_cache")
        .select("bdl_id, full_name, first_name, last_name")
        .in("bdl_id", bdlIds);

      if (cached && cached.length > 0) {
        const resolvedNames = cached
          .map(c => c.full_name || `${c.first_name || ""} ${c.last_name || ""}`.trim())
          .filter(n => n && !n.startsWith("Player "));

        if (resolvedNames.length > 0) {
          const { data: players2 } = await sb
            .from("players")
            .select("id, name, team")
            .in("name", resolvedNames);

          if (players2) {
            for (const c of cached) {
              const fullName = c.full_name || `${c.first_name || ""} ${c.last_name || ""}`.trim();
              const pl = players2.find(p => p.name === fullName);
              if (pl) {
                const origName = `Player ${c.bdl_id}`;
                playerMap[origName] = { id: pl.id, team: pl.team };
              }
            }
          }
        }
      }

      // 4c. For still-unresolved, try BDL API directly (max 20)
      const stillUnresolved = unresolvedBdlNames.filter(n => !playerMap[n]).slice(0, 20);
      const BDL_KEY = Deno.env.get("BALLDONTLIE_KEY")?.trim()?.replace(/^Bearer\s+/i, "") ?? "";
      if (BDL_KEY && stillUnresolved.length > 0) {
        for (const name of stillUnresolved) {
          const bdlId = name.replace("Player ", "");
          try {
            const res = await fetch(`https://api.balldontlie.io/v2/players/${bdlId}`, {
              headers: { Authorization: `Bearer ${BDL_KEY}`, "X-Api-Key": BDL_KEY },
            });
            if (res.ok) {
              const pData = (await res.json()).data || await res.json();
              const fn = pData.first_name || "";
              const ln = pData.last_name || "";
              const fullName = `${fn} ${ln}`.trim();
              if (fullName) {
                // Cache it
                await sb.from("bdl_player_cache").upsert({
                  bdl_id: bdlId, first_name: fn, last_name: ln,
                  team: pData.team?.abbreviation || null,
                }, { onConflict: "bdl_id" });

                // Match to players table
                const { data: pl } = await sb
                  .from("players")
                  .select("id, name, team")
                  .eq("name", fullName)
                  .limit(1);
                if (pl && pl.length > 0) {
                  playerMap[name] = { id: pl[0].id, team: pl[0].team };
                }
              }
            }
          } catch { /* skip */ }
        }
      }
    }

    // 5. Create a model_run entry
    const runId = crypto.randomUUID();
    const snapshotTs = new Date().toISOString();

    await sb.from("model_runs").insert({
      id: runId,
      model_key: modelKey,
      snapshot_ts: snapshotTs,
      status: "running",
      rows_produced: 0,
    });

    // 6. Build features and predictions
    const modelPredictions: any[] = [];
    const nebulaPredictions: any[] = [];
    let errors = 0;
    let skippedNoPlayer = 0;

    // 6a. Fetch PacePulse features for the game
    let paceFeatures: any = null;
    try {
      const { data: paceRows } = await sb.rpc("np_build_pace_features", { p_game_id: gameId });
      if (paceRows && paceRows.length > 0) paceFeatures = paceRows[0];
    } catch (_) {
      console.warn("PacePulse features unavailable for game", gameId);
    }

    // 6b. Batch-fetch transit data for all players
    const playerIds = Object.values(playerMap).map(p => p.id);
    const transitMap: Record<string, Array<{ aspect: string; planet: string; natal_planet?: string; orb?: number }>> = {};
    if (playerIds.length > 0) {
      try {
        for (let i = 0; i < playerIds.length; i += 50) {
          const batch = playerIds.slice(i, i + 50);
          const { data: astroRows } = await sb
            .from("astro_calculations")
            .select("entity_id, result")
            .in("entity_id", batch)
            .eq("entity_type", "player")
            .eq("calc_type", "transits")
            .order("created_at", { ascending: false });
          if (astroRows) {
            for (const row of astroRows) {
              if (!transitMap[row.entity_id]) {
                const result = row.result as any;
                if (result?.transits && Array.isArray(result.transits)) {
                  transitMap[row.entity_id] = result.transits;
                } else if (result?.aspects && Array.isArray(result.aspects)) {
                  transitMap[row.entity_id] = result.aspects;
                }
              }
            }
          }
        }
      } catch (_) {
        console.warn("TransitLift: could not fetch astro data");
      }
    }

    // Compute minutes volatility from CoV as a proxy
    // (We'll use per-player CoV; if none, default 0)

    for (const prop of mappedProps) {
      const player = playerMap[prop.player_name];
      if (!player) {
        skippedNoPlayer++;
        continue;
      }

      try {
        const { data: featRows, error: featErr } = await sb.rpc(
          "np_build_prop_features",
          {
            p_player_id: player.id,
            p_prop_type: prop.prop_type,
            p_line: prop.line,
            p_game_id: gameId,
          },
        );

        if (featErr || !featRows || featRows.length === 0) {
          errors++;
          continue;
        }

        const f: Features = featRows[0];

        // ── A. NebulaProp Baseline Distribution ──
        let mu0: number;
        let sigma0: number;
        let noHistory = false;

        if (f.games_count < 3 || (f.mu_season <= 0 && f.mu_rolling_l10 <= 0)) {
          // Sparse data: anchor to book line with type-default sigma so
          // PacePulse + TransitLift can still produce meaningful signal.
          mu0 = prop.line;
          sigma0 = NBA_DEFAULT_SIGMA[prop.prop_type] ?? 4.0;
          noHistory = true;
        } else {
          const wL10 = Math.min(f.games_count, 10) / 10;
          mu0 = f.mu_rolling_l10 * wL10 + f.mu_season * (1 - wL10);
          sigma0 = Math.max(
            f.sigma_rolling_l10 * wL10 + f.sigma_season * (1 - wL10),
            1.0,
          );
          // Trend momentum: shift mu toward recent form vs season baseline.
          // A player averaging 10% above season in last 10 games gets +4% mu push.
          if (f.games_count >= 5 && f.mu_season > 0) {
            const trendRatio = (f.mu_rolling_l10 - f.mu_season) / f.mu_season;
            mu0 = mu0 * (1 + clamp(trendRatio * 0.4, -0.06, 0.06));
          }
        }

        // ── B. PacePulse Environment Adjustments ──
        // Only apply to counting stats
        let mu1 = mu0;
        let sigma1 = sigma0;
        let paceMuAdj = 0;
        let paceSigmaAdj = 0;
        const minutesVolatility = clamp(f.coeff_of_var ?? 0, 0, 1);

        if (paceFeatures && COUNTING_PROPS.has(prop.prop_type)) {
          const pace = applyPacePulse(
            mu0, sigma0,
            paceFeatures.team_pace_delta,
            paceFeatures.blowout_risk,
            minutesVolatility,
          );
          mu1 = pace.mu_adjusted;
          sigma1 = pace.sigma_adjusted;
          paceMuAdj = pace.pace_mu_adjust;
          paceSigmaAdj = pace.pace_sigma_adjust;
        }

        // ── C. TransitLift Astrological Overlay (bounded) ──
        const playerTransits = transitMap[player.id] || [];
        const transitLift = computeTransitLift(playerTransits);

        // μ₂ = μ₁ · (1 + transit_boost_factor)
        const mu2 = mu1 * (1 + transitLift.transit_boost_factor);
        // σ₂ = σ₁ · (1 + volatility_shift)
        const sigma2 = Math.max(sigma1 * (1 + transitLift.volatility_shift), 0.5);

        const mu_final = mu2;
        const sigma_final = sigma2;

        // Recompute probability
        const line = prop.line;
        const z = (line - mu_final) / sigma_final;
        const p_over_final = clamp(1 - normCdf(z), 0.001, 0.999);

        // ── EdgeScore v1 (legacy) ──
        const { edge_score, components } = computeEdgeScore(f, null, transitLift.astro_boost);

        // ── EdgeScore v2.0 (EV-based) ──
        const sideOdds = p_over_final >= 0.5 ? (prop.over_price ?? null) : (prop.under_price ?? null);
        const pModelForSide = p_over_final >= 0.5 ? p_over_final : 1 - p_over_final;
        const v2 = computeEdgeScoreV2(
          pModelForSide,
          sideOdds,
          paceFeatures?.blowout_risk ?? 0,
          minutesVolatility,
          paceFeatures?.team_pace_delta ?? 0,
          transitLift.confidence_adjustment,
          sigma_final,
          transitLift.volatility_shift,
        );

        const side = determineSide(p_over_final);
        const confidence = computeConfidence(p_over_final);
        const risk = computeRisk(f.coeff_of_var ?? 0, sigma_final);

        // Microbars
        const microbarsCount = Math.min(f.games_count, 10);
        const hitCount = Math.round((f.hit_l10 ?? 0) * microbarsCount);
        const microbars: any[] = [];
        for (let i = 0; i < microbarsCount; i++) {
          microbars.push({ value: i < hitCount ? 1 : 0, hit: i < hitCount });
        }
        const streak = computeStreak(microbars.map((b) => b.hit));

        const odds = side === "over" ? (prop.over_price ?? null) : (prop.under_price ?? null);

        const oneLiner = noHistory
          ? `${(p_over_final * 100).toFixed(0)}% over ${line} (μ=${mu_final.toFixed(1)}, sparse)`
          : `μ=${mu_final.toFixed(1)} σ=${sigma_final.toFixed(1)} → ${(p_over_final * 100).toFixed(0)}% over ${line}`;

        const qualityFlags: string[] = [];
        if (noHistory) qualityFlags.push("no_history");
        if (f.games_count < 5) qualityFlags.push("low_sample");
        if (f.role_up) qualityFlags.push("role_up");
        if ((f.coeff_of_var ?? 0) > 0.4) qualityFlags.push("high_volatility");
        if (playerTransits.length > 0) qualityFlags.push("transit_active");

        const tags: string[] = [];
        if (f.role_up) tags.push("RoleUp");
        if (edge_score >= 70) tags.push("HighEdge");
        if (v2.confidence_tier === "S") tags.push("CelestialLock");
        if (v2.confidence_tier === "A") tags.push("StarSignal");
        if (risk >= 0.6) tags.push("HighRisk");
        if (playerTransits.length > 0) tags.push("TransitActive");

        modelPredictions.push({
          id: crypto.randomUUID(),
          game_id: gameId,
          player_id: player.id,
          prop_type: prop.prop_type,
          model_key: modelKey,
          run_id: runId,
          snapshot_ts: snapshotTs,
          mu_base: +mu0.toFixed(4),
          mu_final: +mu_final.toFixed(4),
          sigma_base: +sigma0.toFixed(4),
          sigma_final: +sigma_final.toFixed(4),
          p_over_base: +(1 - normCdf((line - mu0) / sigma0)).toFixed(6),
          p_over_final: +p_over_final.toFixed(6),
          line,
          odds,
          side,
          edge_score,
          edge_score_v20: v2.edge_score_v20,
          confidence_tier: v2.confidence_tier,
          p_model: v2.p_model,
          p_implied: v2.p_implied,
          edge_raw: v2.edge_raw,
          pace_mu_adjust: paceMuAdj,
          pace_sigma_adjust: paceSigmaAdj,
          hit_l5: f.hit_l5 != null ? +Number(f.hit_l5).toFixed(4) : null,
          hit_l10: f.hit_l10 != null ? +Number(f.hit_l10).toFixed(4) : null,
          hit_l20: f.hit_l20 != null ? +Number(f.hit_l20).toFixed(4) : null,
          std_dev_l10: f.std_dev_l10 != null ? +Number(f.std_dev_l10).toFixed(4) : null,
          coeff_of_var: f.coeff_of_var != null ? +Number(f.coeff_of_var).toFixed(4) : null,
          minutes_l5_avg: f.minutes_l5_avg != null ? +Number(f.minutes_l5_avg).toFixed(2) : null,
          minutes_season_avg: f.minutes_season_avg != null ? +Number(f.minutes_season_avg).toFixed(2) : null,
          delta_minutes: f.delta_minutes != null ? +Number(f.delta_minutes).toFixed(2) : null,
          one_liner: oneLiner,
          quality_flags: qualityFlags,
          tags,
          edge_hitl10: components.edge_hitl10,
          edge_minutes: components.edge_minutes,
          edge_matchup: components.edge_matchup,
          edge_line_move: components.edge_line_move,
          edge_season: components.edge_season,
          edge_vol_penalty: components.edge_vol_penalty,
          edge_astro: components.edge_astro,
          expected_possessions: paceFeatures?.expected_possessions ?? null,
          blowout_risk: paceFeatures?.blowout_risk ?? null,
          team_pace_delta: paceFeatures?.team_pace_delta ?? null,
          astro_mu_adjust: +(transitLift.transit_boost_factor).toFixed(6),
          astro_sigma_adjust: +(transitLift.volatility_shift).toFixed(6),
        });

        nebulaPredictions.push({
          id: crypto.randomUUID(),
          game_id: gameId,
          player_id: player.id,
          prop_type: prop.prop_type,
          book: prop.bookmaker,
          mu: +mu_final.toFixed(4),
          sigma: +sigma_final.toFixed(4),
          line,
          odds,
          side,
          edge_score,
          edge_score_v20: v2.edge_score_v20,
          confidence_tier: v2.confidence_tier,
          p_model: v2.p_model,
          p_implied: v2.p_implied,
          edge_raw: v2.edge_raw,
          pace_mu_adjust: paceMuAdj,
          pace_sigma_adjust: paceSigmaAdj,
          transit_boost_factor: transitLift.transit_boost_factor,
          volatility_shift: transitLift.volatility_shift,
          confidence_adjustment: transitLift.confidence_adjustment,
          confidence: +confidence.toFixed(4),
          risk: +risk.toFixed(4),
          hit_l10: f.hit_l10 != null ? +Number(f.hit_l10).toFixed(4) : null,
          hit_l20: f.hit_l20 != null ? +Number(f.hit_l20).toFixed(4) : null,
          streak,
          microbars,
          one_liner: oneLiner,
          pred_ts: snapshotTs,
          astro: transitLift.astro_summary,
        });
      } catch (e) {
        errors++;
        console.error(`Error processing ${prop.player_name} ${prop.prop_type}:`, e);
      }
    }

    // 7. Upsert predictions
    if (modelPredictions.length > 0) {
      for (let i = 0; i < modelPredictions.length; i += 100) {
        const batch = modelPredictions.slice(i, i + 100);
        const { error: mpErr } = await sb.from("model_predictions").insert(batch);
        if (mpErr) console.error("model_predictions insert error:", mpErr.message);
      }
    }

    if (nebulaPredictions.length > 0) {
      for (let i = 0; i < nebulaPredictions.length; i += 100) {
        const batch = nebulaPredictions.slice(i, i + 100);
        const { error: npErr } = await sb.from("nebula_prop_predictions").upsert(batch, {
          onConflict: "game_id,player_id,prop_type",
        });
        if (npErr) console.error("nebula_prop_predictions upsert error:", npErr.message);
      }
    }

    // 8. Update model_run
    await sb
      .from("model_runs")
      .update({
        status: errors > 0 ? "partial" : "success",
        rows_produced: modelPredictions.length,
        duration_ms: Date.now() - new Date(snapshotTs).getTime(),
        error_message: errors > 0 ? `${errors} props failed` : null,
      })
      .eq("id", runId);

    // 9. Apply EdgeScore v1.1
    try {
      await sb.rpc("np_persist_edgescore_v11", { minutes_back: 5 });
    } catch (_) {}

    return new Response(
      JSON.stringify({
        ok: true,
        game_id: gameId,
        predictions: modelPredictions.length,
        skipped_no_player: skippedNoPlayer,
        errors,
        run_id: runId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("nebula-prop-engine error:", err);
    return new Response(
      JSON.stringify({ error: "An internal error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
