import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Tiered transit refresh strategy:
 *
 * 1. PRE-GAME (>24 h out, e.g. tomorrow's games)
 *    → Pull transits once at the game's tip-off time + venue.
 *
 * 2. DAY-OF, starting 8 AM local
 *    → Refresh every 4 hours until tip-off.
 *
 * 3. LIVE (tip-off → final)
 *    → Refresh every 15 minutes for accurate house rotation.
 *
 * Horary charts are computed once per game at tip-off time.
 * Astrocartography is computed once per player per venue (long TTL).
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || supabaseKey;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const results: Record<string, any> = {};

    // ── 1. Fetch games: today + tomorrow ──
    const { data: allGames } = await supabase
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, venue_lat, venue_lng, status")
      .gte("start_time", `${today}T00:00:00`)
      .lte("start_time", `${tomorrow}T23:59:59`)
      .in("status", ["scheduled", "live"]);

    if (!allGames?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No upcoming games", results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Categorize games by tier
    const liveGames = allGames.filter(g => g.status === "live");
    const todayScheduled = allGames.filter(g => {
      if (g.status !== "scheduled") return false;
      const gameDate = g.start_time.slice(0, 10);
      return gameDate === today || (new Date(g.start_time).getTime() - now.getTime() < 24 * 60 * 60 * 1000);
    });
    const tomorrowScheduled = allGames.filter(g => {
      if (g.status !== "scheduled") return false;
      return g.start_time.slice(0, 10) === tomorrow && (new Date(g.start_time).getTime() - now.getTime() >= 24 * 60 * 60 * 1000);
    });

    results.live_games = liveGames.length;
    results.today_scheduled = todayScheduled.length;
    results.tomorrow_scheduled = tomorrowScheduled.length;

    // ── 2. Get all players for these games ──
    const teamAbbrs = [...new Set(allGames.flatMap(g => [g.home_abbr, g.away_abbr]))];
    const { data: players } = await supabase
      .from("players")
      .select("id, name, team, birth_date, birth_time, birth_lat, birth_lng")
      .in("team", teamAbbrs)
      .not("birth_date", "is", null);

    results.players_with_birth_data = players?.length || 0;

    // ── Helper: call astrovisor transits for a player at a specific game time ──
    async function computeTransit(
      playerId: string,
      gameDate: string,
      gameTime: string,
      lat: number,
      lng: number,
      isLive: boolean
    ): Promise<boolean> {
      try {
        const resp = await fetch(
          `${supabaseUrl}/functions/v1/astrovisor?mode=transits&entity_id=${playerId}&entity_type=player&transit_date=${gameDate}&transit_time=${gameTime}&lat=${lat}&lng=${lng}${isLive ? "&live=true" : ""}`,
          { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } }
        );
        return resp.ok;
      } catch (e) {
        console.error(`Transit error for player ${playerId}:`, e);
        return false;
      }
    }

    // ── Helper: get game time parts ──
    function getGameTimeParts(startTime: string) {
      const d = new Date(startTime);
      const date = startTime.slice(0, 10);
      const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
      return { date, time };
    }

    // ── Helper: get current time rounded to 15 min ──
    function getCurrentRounded15() {
      const mins = Math.floor(now.getUTCMinutes() / 15) * 15;
      return `${String(now.getUTCHours()).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }

    let transitsComputed = 0;
    let horaryComputed = 0;
    let cartoComputed = 0;

    // ══════════════════════════════════════════
    // TIER 3: LIVE GAMES — 15-min transit refresh
    // ══════════════════════════════════════════
    for (const game of liveGames) {
      const gamePlayers = (players || []).filter(
        p => p.team === game.home_abbr || p.team === game.away_abbr
      ).slice(0, 16); // top 8 per team

      const currentTime = getCurrentRounded15();
      const gameDate = game.start_time.slice(0, 10);

      for (const player of gamePlayers) {
        const ok = await computeTransit(
          player.id, gameDate, currentTime,
          game.venue_lat || 40.7, game.venue_lng || -74.0, true
        );
        if (ok) transitsComputed++;
        await new Promise(r => setTimeout(r, 150)); // rate limit
      }
    }

    // ══════════════════════════════════════════
    // TIER 2: DAY-OF SCHEDULED — transit at tip-off time
    // Only refresh if we haven't computed for this 4h window yet
    // ══════════════════════════════════════════
    const currentHour = now.getUTCHours();
    // Round to nearest 4-hour block for cache staleness check
    const fourHourBlock = Math.floor(currentHour / 4) * 4;
    const blockKey = `${String(fourHourBlock).padStart(2, "0")}:00`;

    for (const game of todayScheduled) {
      const { date: gameDate, time: gameTime } = getGameTimeParts(game.start_time);
      const gamePlayers = (players || []).filter(
        p => p.team === game.home_abbr || p.team === game.away_abbr
      ).slice(0, 16);

      for (const player of gamePlayers) {
        const ok = await computeTransit(
          player.id, gameDate, gameTime,
          game.venue_lat || 40.7, game.venue_lng || -74.0, false
        );
        if (ok) transitsComputed++;
        await new Promise(r => setTimeout(r, 200));
      }

      // Horary chart at tip-off
      try {
        const { data: cached } = await supabase
          .from("astro_calculations")
          .select("id")
          .eq("entity_id", game.id)
          .eq("calc_type", "horary")
          .eq("calc_date", gameDate)
          .gt("expires_at", now.toISOString())
          .maybeSingle();

        if (!cached) {
          const resp = await fetch(
            `${supabaseUrl}/functions/v1/astrovisor?mode=horary&entity_id=${game.id}&entity_type=game&transit_date=${gameDate}&transit_time=${gameTime}&lat=${game.venue_lat || 40.7}&lng=${game.venue_lng || -74.0}`,
            { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } }
          );
          if (resp.ok) horaryComputed++;
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (e) {
        console.error(`Horary batch error for game ${game.id}:`, e);
      }
    }

    // ══════════════════════════════════════════
    // TIER 1: TOMORROW (PRE-GAME) — single pull at tip-off time
    // Only compute if not already cached
    // ══════════════════════════════════════════
    for (const game of tomorrowScheduled) {
      const { date: gameDate, time: gameTime } = getGameTimeParts(game.start_time);
      const gamePlayers = (players || []).filter(
        p => p.team === game.home_abbr || p.team === game.away_abbr
      ).slice(0, 10); // fewer players for pre-game

      for (const player of gamePlayers) {
        const ok = await computeTransit(
          player.id, gameDate, gameTime,
          game.venue_lat || 40.7, game.venue_lng || -74.0, false
        );
        if (ok) transitsComputed++;
        await new Promise(r => setTimeout(r, 250));
      }

      // Horary for tomorrow's games too
      try {
        const { data: cached } = await supabase
          .from("astro_calculations")
          .select("id")
          .eq("entity_id", game.id)
          .eq("calc_type", "horary")
          .eq("calc_date", gameDate)
          .gt("expires_at", now.toISOString())
          .maybeSingle();

        if (!cached) {
          const resp = await fetch(
            `${supabaseUrl}/functions/v1/astrovisor?mode=horary&entity_id=${game.id}&entity_type=game&transit_date=${gameDate}&transit_time=${gameTime}&lat=${game.venue_lat || 40.7}&lng=${game.venue_lng || -74.0}`,
            { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } }
          );
          if (resp.ok) horaryComputed++;
          await new Promise(r => setTimeout(r, 250));
        }
      } catch (e) {
        console.error(`Horary batch error for game ${game.id}:`, e);
      }
    }
    results.transits_computed = transitsComputed;
    results.horary_computed = horaryComputed;

    // ══════════════════════════════════════════
    // ASTROCARTOGRAPHY — only if not cached (90-day TTL)
    // ══════════════════════════════════════════
    if (players?.length) {
      for (const game of allGames.slice(0, 8)) {
        if (!game.venue_lat || !game.venue_lng) continue;

        const gamePlayers = (players || []).filter(
          p => p.team === game.home_abbr || p.team === game.away_abbr
        ).slice(0, 4);

        for (const player of gamePlayers) {
          try {
            const { data: cached } = await supabase
              .from("astro_calculations")
              .select("id")
              .eq("entity_id", player.id)
              .eq("calc_type", "aapi_astrocartography")
              .gt("expires_at", now.toISOString())
              .maybeSingle();

            if (cached) continue;

            const resp = await fetch(
              `${supabaseUrl}/functions/v1/astrologyapi?mode=astrocartography&entity_id=${player.id}&entity_type=player&transit_date=${today}&lat=${game.venue_lat}&lng=${game.venue_lng}`,
              { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } }
            );

            if (resp.ok) cartoComputed++;
            await new Promise(r => setTimeout(r, 300));
          } catch (e) {
            console.error(`Carto batch error for ${player.name}:`, e);
          }
        }
      }
    }
    results.astrocartography_computed = cartoComputed;

    // ── Elections (once per day) ──
    try {
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/astro-elections?date=${today}&lat=40.7128&lng=-74.006`,
        { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } }
      );
      results.elections_computed = resp.ok;
    } catch (e) {
      console.error("Elections batch error:", e);
      results.elections_computed = false;
    }

    return new Response(
      JSON.stringify({ success: true, batch_date: today, tiers: { live: liveGames.length, day_of: todayScheduled.length, pre_game: tomorrowScheduled.length }, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("astro-batch error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
