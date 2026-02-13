import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// API-Basketball base URL
const API_BASKETBALL_BASE = "https://v1.basketball.api-sports.io";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "live"; // live | play_by_play
    const gameId = url.searchParams.get("game_id"); // our internal game UUID
    const apiGameId = url.searchParams.get("api_game_id"); // API-Basketball game ID

    const apiKey = Deno.env.get("API_BASKETBALL_KEY");
    if (!apiKey) throw new Error("API_BASKETBALL_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const meta: Record<string, any> = { mode };

    if (mode === "live") {
      // ── Fetch live NBA games from API-Basketball ──
      const resp = await fetch(`${API_BASKETBALL_BASE}/games?league=12&season=2024-2025&live=all`, {
        headers: { "x-apisports-key": apiKey },
      });

      if (!resp.ok) throw new Error(`API-Basketball live error: ${resp.status}`);
      const json = await resp.json();
      const liveGames = json.response || [];

      meta.live_games_found = liveGames.length;

      for (const lg of liveGames) {
        const homeTeam = lg.teams?.home?.name || "";
        const awayTeam = lg.teams?.away?.name || "";

        // Try to match to our games table
        const today = new Date().toISOString().slice(0, 10);
        const { data: dbGame } = await supabase
          .from("games")
          .select("id")
          .eq("league", "NBA")
          .gte("start_time", `${today}T00:00:00`)
          .lte("start_time", `${today}T23:59:59`)
          .or(`home_team.ilike.%${homeTeam.split(" ").pop()}%,away_team.ilike.%${awayTeam.split(" ").pop()}%`)
          .maybeSingle();

        if (dbGame) {
          await supabase.from("games").update({
            home_score: lg.scores?.home?.total || null,
            away_score: lg.scores?.away?.total || null,
            status: lg.status?.long === "Game Finished" ? "final" : "live",
          }).eq("id", dbGame.id);

          // Update quarter scores
          const quarters = lg.scores?.home?.quarter || {};
          for (const [qKey, homeScore] of Object.entries(quarters)) {
            const qNum = parseInt(qKey);
            if (isNaN(qNum)) continue;
            const awayScore = lg.scores?.away?.quarter?.[qKey] || 0;
            await supabase.from("game_quarters").upsert({
              game_id: dbGame.id,
              quarter: qNum,
              home_score: homeScore as number,
              away_score: awayScore as number,
            }, { onConflict: "game_id,quarter" });
          }
        }
      }

    } else if (mode === "play_by_play" && apiGameId) {
      // ── Fetch play-by-play from API-Basketball ──
      const resp = await fetch(`${API_BASKETBALL_BASE}/games/events?id=${apiGameId}`, {
        headers: { "x-apisports-key": apiKey },
      });

      if (!resp.ok) throw new Error(`API-Basketball PBP error: ${resp.status}`);
      const json = await resp.json();
      const events = json.response || [];

      if (!gameId) throw new Error("game_id param required for play_by_play mode");

      let pbpCount = 0;
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];

        // Try to find player in our DB
        let playerId: string | null = null;
        if (ev.player?.name) {
          const { data: player } = await supabase
            .from("players")
            .select("id")
            .ilike("name", `%${ev.player.name}%`)
            .maybeSingle();
          playerId = player?.id || null;
        }

        const pbpRecord = {
          game_id: gameId,
          sequence: i + 1,
          quarter: ev.quarter || 1,
          clock: ev.clock || null,
          event_type: ev.type || "unknown",
          description: ev.comment || ev.type || null,
          team_abbr: ev.team?.name ? ev.team.name.split(" ").pop()?.toUpperCase()?.slice(0, 3) || null : null,
          player_id: playerId,
          home_score: ev.home_score || null,
          away_score: ev.away_score || null,
        };

        await supabase.from("play_by_play").upsert(pbpRecord, { onConflict: "game_id,sequence" });
        pbpCount++;
      }

      meta.play_by_play_events = pbpCount;
    }

    return new Response(
      JSON.stringify({ success: true, meta, fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-live error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
