import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveGameKey } from "../_shared/resolve-game-key.ts";

// Stable hash for deduplication when no event ID exists
function stableEventId(period: number, clock: string, desc: string, score: string, team: string): string {
  const raw = `${period}|${clock}|${desc}|${score}|${team}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `hash_${Math.abs(hash).toString(36)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  try {
    const enabled = Deno.env.get("PBPSTATS_ENABLED") ?? "true";
    if (enabled !== "true") {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const writeMode = Deno.env.get("WRITE_MODE") ?? "dry_run";
    const baseUrl = Deno.env.get("PBPSTATS_BASE_URL") ?? "https://api.pbpstats.com";

    const url = new URL(req.url);
    const providerGameId = url.searchParams.get("provider_game_id");
    if (!providerGameId) {
      return new Response(JSON.stringify({ error: "provider_game_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up game_key from mapping
    const { data: mapping } = await supabase
      .from("cosmic_game_id_map")
      .select("game_key")
      .eq("provider", "pbpstats")
      .eq("provider_game_id", providerGameId)
      .maybeSingle();

    let gameKey = mapping?.game_key;

    // If no mapping, try to resolve from live games table
    if (!gameKey) {
      const { data: liveGame } = await supabase
        .from("pbp_live_games_by_provider")
        .select("game_key, raw, league")
        .eq("provider", "pbpstats")
        .eq("provider_game_id", providerGameId)
        .maybeSingle();

      if (liveGame?.game_key) {
        gameKey = liveGame.game_key;
      } else if (liveGame?.raw) {
        // Attempt resolve from payload
        const g = liveGame.raw as any;
        const result = await resolveGameKey(supabase, {
          provider: "pbpstats",
          provider_game_id: providerGameId,
          league: liveGame.league || "nba",
          game_date: (g.Date || new Date().toISOString()).slice(0, 10),
          home_team_abbr: g.HomeTeamAbbreviation || g.home_team || "",
          away_team_abbr: g.AwayTeamAbbreviation || g.away_team || "",
          payload: g,
        }, writeMode);

        if (result.write_ok) gameKey = result.game_key;
      }
    }

    if (!gameKey) {
      return new Response(
        JSON.stringify({ error: "Could not resolve game_key", provider_game_id: providerGameId }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch PBP from pbpstats
    const pbpUrl = `${baseUrl}/get-game/nba/${providerGameId}`;
    console.log(`[pbpstats-pbp] Fetching: ${pbpUrl}`);

    const resp = await fetch(pbpUrl);
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`pbpstats PBP HTTP ${resp.status}: ${body.slice(0, 300)}`);
    }

    const json = await resp.json();
    // pbpstats returns events under various keys
    const events: any[] = json.results || json.plays || json.events || json.data || [];

    let insertedCount = 0;
    let hasPlayerIds = false;
    const rows: any[] = [];

    for (const ev of events) {
      const period = ev.Period || ev.period || ev.Quarter || 1;
      const clock = ev.RemainingTime || ev.clock || ev.remaining_time || null;
      const homeScore = ev.HomeScore ?? ev.home_score ?? null;
      const awayScore = ev.AwayScore ?? ev.away_score ?? null;
      const teamAbbr = (ev.TeamAbbreviation || ev.team || "").toUpperCase() || null;
      const playerName = ev.PlayerName || ev.player || ev.player_name || null;
      const playerId = ev.PlayerId || ev.player_id || null;
      const eventType = ev.EventType || ev.event_type || ev.ActionType || null;
      const description = ev.Description || ev.description || ev.action || eventType || "—";

      if (playerId) hasPlayerIds = true;

      const providerEventId =
        ev.EventId || ev.event_id || ev.PlayId ||
        stableEventId(period, clock || "", description, `${homeScore}-${awayScore}`, teamAbbr || "");

      rows.push({
        game_key: gameKey,
        provider: "pbpstats",
        provider_game_id: providerGameId,
        provider_event_id: String(providerEventId),
        period,
        clock,
        home_score: homeScore,
        away_score: awayScore,
        team_abbr: teamAbbr,
        player_name: playerName,
        player_id: playerId ? String(playerId) : null,
        event_type: eventType,
        description,
        raw: ev,
      });
    }

    if (writeMode !== "dry_run" && rows.length > 0) {
      // Batch insert with ON CONFLICT DO NOTHING
      const batchSize = 200;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("pbp_events")
          .upsert(batch, { onConflict: "game_key,provider,provider_event_id", ignoreDuplicates: true })
          .select("id");
        if (data) insertedCount += data.length;
        if (error) console.error("[pbpstats-pbp] Batch insert error:", error.message);
      }
    }

    const latestEventId = rows.length > 0 ? rows[rows.length - 1].provider_event_id : null;

    return new Response(
      JSON.stringify({
        success: true,
        write_mode: writeMode,
        game_key: gameKey,
        total_events: events.length,
        inserted_count: insertedCount,
        latest_event_id: latestEventId,
        has_player_identifiers: hasPlayerIds,
        latency_ms: Date.now() - t0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[pbpstats-pbp] Error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred.", latency_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
