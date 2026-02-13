import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().slice(0, 10);
    const results: Record<string, any> = {};

    // 1. Get today's games
    const { data: games } = await supabase
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, venue_lat, venue_lng, status")
      .gte("start_time", `${today}T00:00:00`)
      .lte("start_time", `${today}T23:59:59`)
      .in("status", ["scheduled", "live"]);

    results.games_today = games?.length || 0;

    if (!games?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No games today", results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get players from today's games (via rosters)
    const teamAbbrs = [...new Set(games.flatMap(g => [g.home_abbr, g.away_abbr]))];
    const { data: players } = await supabase
      .from("players")
      .select("id, name, team, birth_date, birth_time, birth_lat, birth_lng")
      .in("team", teamAbbrs)
      .not("birth_date", "is", null);

    results.players_with_birth_data = players?.length || 0;

    // 3. Batch compute transits for players via AstroVisor (existing API)
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || supabaseKey;
    let transitsComputed = 0;

    if (players?.length) {
      for (const player of players.slice(0, 30)) {
        try {
          // Check if already cached for today
          const { data: cached } = await supabase
            .from("astro_calculations")
            .select("id")
            .eq("entity_id", player.id)
            .eq("calc_type", "transits")
            .eq("calc_date", today)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();

          if (cached) continue;

          // Call astrovisor for transits
          const resp = await fetch(
            `${supabaseUrl}/functions/v1/astrovisor?mode=transits&entity_id=${player.id}&entity_type=player&transit_date=${today}`,
            { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } }
          );

          if (resp.ok) transitsComputed++;
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {
          console.error(`Transit batch error for ${player.name}:`, e);
        }
      }
    }
    results.transits_computed = transitsComputed;

    // 4. Compute horary charts for each game
    let horaryComputed = 0;
    for (const game of games) {
      try {
        const { data: cached } = await supabase
          .from("astro_calculations")
          .select("id")
          .eq("entity_id", game.id)
          .eq("calc_type", "horary")
          .eq("calc_date", today)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();

        if (cached) continue;

        const gameTime = new Date(game.start_time);
        const transitTime = `${String(gameTime.getHours()).padStart(2, "0")}:${String(gameTime.getMinutes()).padStart(2, "0")}`;

        const resp = await fetch(
          `${supabaseUrl}/functions/v1/astrovisor?mode=horary&entity_id=${game.id}&entity_type=game&transit_date=${today}&transit_time=${transitTime}&lat=${game.venue_lat || 40.7}&lng=${game.venue_lng || -74.0}`,
          { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } }
        );

        if (resp.ok) horaryComputed++;
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error(`Horary batch error for game ${game.id}:`, e);
      }
    }
    results.horary_computed = horaryComputed;

    // 5. Compute astrocartography for players at game venues via astrology-api
    let cartoComputed = 0;
    if (players?.length) {
      for (const game of games.slice(0, 5)) {
        if (!game.venue_lat || !game.venue_lng) continue;
        
        // Pick top 2 players per team for carto
        const gamePlayers = players
          .filter(p => p.team === game.home_abbr || p.team === game.away_abbr)
          .slice(0, 4);

        for (const player of gamePlayers) {
          try {
            const { data: cached } = await supabase
              .from("astro_calculations")
              .select("id")
              .eq("entity_id", player.id)
              .eq("calc_type", "aapi_astrocartography")
              .eq("calc_date", today)
              .gt("expires_at", new Date().toISOString())
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

    // 6. Compute elections for today
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
      JSON.stringify({ success: true, batch_date: today, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("astro-batch error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
