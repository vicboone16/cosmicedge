import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveGameKey } from "../_shared/resolve-game-key.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  try {
    const enabled = Deno.env.get("PBPSTATS_ENABLED") ?? "true";
    if (enabled !== "true") {
      return new Response(JSON.stringify({ skipped: true, reason: "PBPSTATS_ENABLED!=true" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const writeMode = Deno.env.get("WRITE_MODE") ?? "dry_run";
    const baseUrl = Deno.env.get("PBPSTATS_BASE_URL") ?? "https://api.pbpstats.com";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch today's live/recent games from pbpstats
    const url = new URL(req.url);
    const league = (url.searchParams.get("league") || "nba").toLowerCase();
    const season = url.searchParams.get("season") || "2025-26";
    const seasonType = url.searchParams.get("season_type") || "Regular Season";

    // pbpstats "get games" endpoint
    const gamesUrl = `${baseUrl}/get-games/nba?Season=${encodeURIComponent(season)}&SeasonType=${encodeURIComponent(seasonType)}`;
    console.log(`[pbpstats-ingest] Fetching: ${gamesUrl}`);

    const resp = await fetch(gamesUrl);
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`pbpstats HTTP ${resp.status}: ${body.slice(0, 300)}`);
    }

    const json = await resp.json();
    // pbpstats returns { results: [...] } with game objects
    const games: any[] = json.results || json.data || json || [];

    let matched = 0;
    let unmatched = 0;
    let upserted = 0;
    const diagnostics: any[] = [];

    // Filter to today's games (or all if date not parseable)
    const todayStr = new Date().toISOString().slice(0, 10);
    
    // Filter to today's games only to avoid timeout
    const todayGames = games.filter((g: any) => {
      const d = g.Date || g.game_date || "";
      return d.startsWith(todayStr);
    });
    console.log(`[pbpstats-ingest] ${games.length} total season games, ${todayGames.length} today (${todayStr})`);

    for (const g of todayGames) {
      const providerGameId = g.GameId || g.game_id || g.id;
      if (!providerGameId) continue;

      // Extract teams — pbpstats uses various formats
      const homeAbbr = (g.HomeTeamAbbreviation || g.home_team || "").toUpperCase();
      const awayAbbr = (g.AwayTeamAbbreviation || g.away_team || "").toUpperCase();
      const gameDate = g.Date || g.game_date || todayStr;
      const startTime = g.StartTime || g.start_time || null;

      if (!homeAbbr || !awayAbbr) continue;

      const result = await resolveGameKey(supabase, {
        provider: "pbpstats",
        provider_game_id: String(providerGameId),
        league,
        game_date: gameDate.slice(0, 10),
        start_time_utc: startTime,
        home_team_abbr: homeAbbr,
        away_team_abbr: awayAbbr,
        payload: g,
      }, writeMode);

      if (result.write_ok) {
        matched++;
        if (writeMode !== "dry_run") {
          const status = g.Status || g.status || "scheduled";
          await supabase.from("pbp_live_games_by_provider").upsert(
            {
              provider: "pbpstats",
              provider_game_id: String(providerGameId),
              league,
              game_key: result.game_key,
              status,
              raw: g,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "provider,provider_game_id" }
          );
          upserted++;
        }
      } else {
        unmatched++;
      }

      diagnostics.push({
        provider_game_id: providerGameId,
        home: homeAbbr,
        away: awayAbbr,
        game_date: gameDate,
        ...result,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        write_mode: writeMode,
        total_games: todayGames.length,
        total_season_games: games.length,
        unmatched,
        upserted,
        latency_ms: Date.now() - t0,
        diagnostics: diagnostics.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[pbpstats-ingest] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message, latency_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
