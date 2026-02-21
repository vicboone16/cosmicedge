import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ResolveInput {
  provider: string;
  provider_game_id: string;
  league: string;
  game_date: string; // YYYY-MM-DD
  start_time_utc?: string;
  home_team_abbr: string;
  away_team_abbr: string;
  payload?: Record<string, unknown>;
}

interface ResolveResult {
  write_ok: boolean;
  game_key: string | null;
  confidence: number;
  match_method: string;
  created_new: boolean;
}

export async function resolveGameKey(
  supabase: ReturnType<typeof createClient>,
  input: ResolveInput,
  writeMode: string
): Promise<ResolveResult> {
  const {
    provider,
    provider_game_id,
    league,
    game_date,
    start_time_utc,
    home_team_abbr,
    away_team_abbr,
    payload,
  } = input;

  // 1. Check existing mapping
  const { data: existingMap } = await supabase
    .from("cosmic_game_id_map")
    .select("game_key, confidence, match_method")
    .eq("provider", provider)
    .eq("provider_game_id", provider_game_id)
    .maybeSingle();

  if (existingMap) {
    return {
      write_ok: true,
      game_key: existingMap.game_key,
      confidence: existingMap.confidence,
      match_method: existingMap.match_method,
      created_new: false,
    };
  }

  // 2. Attempt canonical fingerprint match
  const leagueNorm = league.toLowerCase();
  const homeNorm = home_team_abbr.toUpperCase();
  const awayNorm = away_team_abbr.toUpperCase();

  // 2a. Exact match
  const { data: exactMatch } = await supabase
    .from("cosmic_games")
    .select("game_key")
    .eq("league", leagueNorm)
    .eq("game_date", game_date)
    .eq("home_team_abbr", homeNorm)
    .eq("away_team_abbr", awayNorm)
    .maybeSingle();

  if (exactMatch) {
    if (writeMode !== "dry_run") {
      await supabase.from("cosmic_game_id_map").insert({
        provider,
        provider_game_id,
        league: leagueNorm,
        game_key: exactMatch.game_key,
        confidence: 100,
        match_method: "exact_fingerprint",
      });
    }
    return {
      write_ok: true,
      game_key: exactMatch.game_key,
      confidence: 100,
      match_method: "exact_fingerprint",
      created_new: false,
    };
  }

  // 2b. Swapped home/away
  const { data: swappedMatch } = await supabase
    .from("cosmic_games")
    .select("game_key")
    .eq("league", leagueNorm)
    .eq("game_date", game_date)
    .eq("home_team_abbr", awayNorm)
    .eq("away_team_abbr", homeNorm)
    .maybeSingle();

  if (swappedMatch) {
    if (writeMode !== "dry_run") {
      await supabase.from("cosmic_game_id_map").insert({
        provider,
        provider_game_id,
        league: leagueNorm,
        game_key: swappedMatch.game_key,
        confidence: 85,
        match_method: "swapped_home_away",
      });
    }
    return {
      write_ok: true,
      game_key: swappedMatch.game_key,
      confidence: 85,
      match_method: "swapped_home_away",
      created_new: false,
    };
  }

  // 2c. Time-window match (±4h) if start_time_utc provided
  if (start_time_utc) {
    const st = new Date(start_time_utc);
    const lo = new Date(st.getTime() - 4 * 3600_000).toISOString();
    const hi = new Date(st.getTime() + 4 * 3600_000).toISOString();

    const { data: timeMatch } = await supabase
      .from("cosmic_games")
      .select("game_key")
      .eq("league", leagueNorm)
      .gte("start_time_utc", lo)
      .lte("start_time_utc", hi)
      .or(
        `and(home_team_abbr.eq.${homeNorm},away_team_abbr.eq.${awayNorm}),and(home_team_abbr.eq.${awayNorm},away_team_abbr.eq.${homeNorm})`
      )
      .maybeSingle();

    if (timeMatch) {
      if (writeMode !== "dry_run") {
        await supabase.from("cosmic_game_id_map").insert({
          provider,
          provider_game_id,
          league: leagueNorm,
          game_key: timeMatch.game_key,
          confidence: 70,
          match_method: "time_window_4h",
        });
      }
      return {
        write_ok: true,
        game_key: timeMatch.game_key,
        confidence: 70,
        match_method: "time_window_4h",
        created_new: false,
      };
    }
  }

  // 3. No match found — create new canonical game if confidence >= 70
  // Since we have full home/away/date, we can create with confidence 100
  if (writeMode !== "dry_run") {
    const { data: newGame, error: insertErr } = await supabase
      .from("cosmic_games")
      .insert({
        league: leagueNorm,
        game_date,
        start_time_utc: start_time_utc || null,
        home_team_abbr: homeNorm,
        away_team_abbr: awayNorm,
        status: "scheduled",
      })
      .select("game_key")
      .single();

    if (insertErr) {
      // Could be a race condition — try fetching again
      const { data: retry } = await supabase
        .from("cosmic_games")
        .select("game_key")
        .eq("league", leagueNorm)
        .eq("game_date", game_date)
        .eq("home_team_abbr", homeNorm)
        .eq("away_team_abbr", awayNorm)
        .maybeSingle();

      if (retry) {
        await supabase.from("cosmic_game_id_map").insert({
          provider,
          provider_game_id,
          league: leagueNorm,
          game_key: retry.game_key,
          confidence: 100,
          match_method: "exact_fingerprint_race",
        });
        return {
          write_ok: true,
          game_key: retry.game_key,
          confidence: 100,
          match_method: "exact_fingerprint_race",
          created_new: false,
        };
      }

      // True failure — log as unmatched
      await supabase.from("cosmic_unmatched_games").insert({
        provider,
        provider_game_id,
        league: leagueNorm,
        payload: payload || {},
        reason: `insert_failed: ${insertErr.message}`,
        diagnostics: { home_team_abbr: homeNorm, away_team_abbr: awayNorm, game_date, error: insertErr },
      });
      return { write_ok: false, game_key: null, confidence: 0, match_method: "failed", created_new: false };
    }

    // Insert mapping
    await supabase.from("cosmic_game_id_map").insert({
      provider,
      provider_game_id,
      league: leagueNorm,
      game_key: newGame.game_key,
      confidence: 100,
      match_method: "new_canonical",
    });

    return {
      write_ok: true,
      game_key: newGame.game_key,
      confidence: 100,
      match_method: "new_canonical",
      created_new: true,
    };
  }

  // dry_run: return hypothetical
  return {
    write_ok: false,
    game_key: null,
    confidence: 100,
    match_method: "dry_run_would_create",
    created_new: false,
  };
}
