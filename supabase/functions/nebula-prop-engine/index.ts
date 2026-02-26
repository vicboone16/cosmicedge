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
};

/* ──────────── EdgeScore computation ──────────── */

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
  const matchupScore = 50; // placeholder
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

    // 2. Fetch player_props for this game — use consensus/first book per player+market
    const { data: rawProps } = await sb
      .from("player_props")
      .select("id, game_id, player_name, market_key, line, over_price, under_price, bookmaker")
      .eq("game_id", gameId)
      .order("bookmaker", { ascending: true }); // consensus sorts first

    if (!rawProps || rawProps.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No props found for game", predictions: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Map market_key → prop_type and deduplicate
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

    // 4. Resolve player names → player IDs
    const uniqueNames = [...new Set(mappedProps.map((p) => p.player_name))];
    const playerMap: Record<string, { id: string; team: string }> = {};

    // Batch lookup in chunks
    for (let i = 0; i < uniqueNames.length; i += 50) {
      const batch = uniqueNames.slice(i, i + 50);
      const { data: players } = await sb
        .from("players")
        .select("id, name, team")
        .in("name", batch);
      if (players) {
        for (const pl of players) {
          playerMap[pl.name] = { id: pl.id, team: pl.team };
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

        if (f.games_count < 3) continue;

        // ── NebulaProp Distribution ──
        const wL10 = Math.min(f.games_count, 10) / 10;
        const mu_base = f.mu_rolling_l10 * wL10 + f.mu_season * (1 - wL10);
        const sigma_base = Math.max(
          f.sigma_rolling_l10 * wL10 + f.sigma_season * (1 - wL10),
          1.0,
        );

        // Apply PacePulse adjustment: fast-paced games boost counting stats
        let paceAdjust = 0;
        if (paceFeatures && paceFeatures.team_pace_delta) {
          // +1% mu per pace delta point for counting stats
          const countingProps = ["points", "rebounds", "assists", "threes", "pts_reb_ast", "pts_reb", "pts_ast", "reb_ast"];
          if (countingProps.includes(prop.prop_type)) {
            paceAdjust = (paceFeatures.team_pace_delta / 100) * mu_base;
          }
        }
        const mu_final = mu_base + paceAdjust;
        const sigma_final = Math.max(sigma_base, 0.5);

        const line = prop.line;
        const z = (line - mu_final) / sigma_final;
        const p_over_final = clamp(1 - normCdf(z), 0.001, 0.999);

        const { edge_score, components } = computeEdgeScore(f, null, 0);

        const side = determineSide(p_over_final);
        const confidence = computeConfidence(p_over_final);
        const risk = computeRisk(f.coeff_of_var ?? 0, sigma_final);

        // Microbars approximation
        const microbarsCount = Math.min(f.games_count, 10);
        const hitCount = Math.round((f.hit_l10 ?? 0) * microbarsCount);
        const microbars: any[] = [];
        for (let i = 0; i < microbarsCount; i++) {
          microbars.push({ value: i < hitCount ? 1 : 0, hit: i < hitCount });
        }
        const streak = computeStreak(microbars.map((b) => b.hit));

        const odds =
          side === "over" ? (prop.over_price ?? null) : (prop.under_price ?? null);

        const oneLiner = `μ=${mu_final.toFixed(1)} σ=${sigma_final.toFixed(1)} → ${(p_over_final * 100).toFixed(0)}% over ${line}`;

        const qualityFlags: string[] = [];
        if (f.games_count < 5) qualityFlags.push("low_sample");
        if (f.role_up) qualityFlags.push("role_up");
        if ((f.coeff_of_var ?? 0) > 0.4) qualityFlags.push("high_volatility");

        const tags: string[] = [];
        if (f.role_up) tags.push("RoleUp");
        if (edge_score >= 70) tags.push("HighEdge");
        if (risk >= 0.6) tags.push("HighRisk");

        modelPredictions.push({
          id: crypto.randomUUID(),
          game_id: gameId,
          player_id: player.id,
          prop_type: prop.prop_type,
          model_key: modelKey,
          run_id: runId,
          snapshot_ts: snapshotTs,
          mu_base: +mu_base.toFixed(4),
          mu_final: +mu_final.toFixed(4),
          sigma_base: +sigma_base.toFixed(4),
          sigma_final: +sigma_final.toFixed(4),
          p_over_base: +p_over_final.toFixed(6),
          p_over_final: +p_over_final.toFixed(6),
          line,
          odds,
          side,
          edge_score,
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
          confidence: +confidence.toFixed(4),
          risk: +risk.toFixed(4),
          hit_l10: f.hit_l10 != null ? +Number(f.hit_l10).toFixed(4) : null,
          hit_l20: f.hit_l20 != null ? +Number(f.hit_l20).toFixed(4) : null,
          streak,
          microbars,
          one_liner: oneLiner,
          pred_ts: snapshotTs,
          astro: null,
        });
      } catch (e) {
        errors++;
        console.error(`Error processing ${prop.player_name} ${prop.prop_type}:`, e);
      }
    }

    // 7. Upsert predictions
    if (modelPredictions.length > 0) {
      // Insert in batches of 100
      for (let i = 0; i < modelPredictions.length; i += 100) {
        const batch = modelPredictions.slice(i, i + 100);
        const { error: mpErr } = await sb.from("model_predictions").insert(batch);
        if (mpErr) console.error("model_predictions insert error:", mpErr.message);
      }
    }

    if (nebulaPredictions.length > 0) {
      await sb.from("nebula_prop_predictions").delete().eq("game_id", gameId);
      for (let i = 0; i < nebulaPredictions.length; i += 100) {
        const batch = nebulaPredictions.slice(i, i + 100);
        const { error: npErr } = await sb.from("nebula_prop_predictions").insert(batch);
        if (npErr) console.error("nebula_prop_predictions insert error:", npErr.message);
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
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
