// SportsDataIO Player Projections
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SDIO_API_BASE = "https://api.sportsdata.io/v3";
const LEAGUE_SLUGS: Record<string, string> = { NBA: "nba", NFL: "nfl", MLB: "mlb", NHL: "nhl" };
const BATCH = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const league = (url.searchParams.get("league") || "NBA").toUpperCase();
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

    const sdioKey = Deno.env.get("SPORTSDATAIO_API_KEY");
    if (!sdioKey) throw new Error("SPORTSDATAIO_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const slug = LEAGUE_SLUGS[league] || "nba";
    const dateFormatted = date;

    // Fetch player game projections
    const resp = await fetch(
      `${SDIO_API_BASE}/${slug}/projections/json/PlayerGameProjectionStatsByDate/${dateFormatted}?key=${sdioKey}`
    );
    if (!resp.ok) throw new Error(`Projections API error: ${resp.status}`);
    const projections = await resp.json();

    // Pre-fetch players + games
    const { data: players } = await supabase
      .from("players")
      .select("id, external_id, name")
      .eq("league", league);

    const playerByExtId = new Map<string, string>();
    const playerByName = new Map<string, string>();
    for (const p of players || []) {
      if (p.external_id) {
        playerByExtId.set(p.external_id, p.id);
        playerByExtId.set(`sdio_${p.external_id.replace("sdio_", "")}`, p.id);
      }
      playerByName.set(p.name.toLowerCase(), p.id);
    }

    // Pre-fetch games for this date
    const dayStart = `${date}T00:00:00Z`;
    const dayEnd = `${date}T23:59:59Z`;
    const { data: games } = await supabase
      .from("games")
      .select("id, external_id, home_abbr, away_abbr")
      .eq("league", league)
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd);

    const gameByExtId = new Map<string, string>();
    const gameByTeams = new Map<string, string>();
    for (const g of games || []) {
      if (g.external_id) gameByExtId.set(g.external_id, g.id);
      gameByTeams.set(`${g.home_abbr}-${g.away_abbr}`, g.id);
    }

    const records = projections.map((proj: any) => {
      const name = proj.Name || `${proj.FirstName || ""} ${proj.LastName || ""}`.trim();
      const extId = proj.PlayerID ? String(proj.PlayerID) : null;
      let playerId = extId
        ? (playerByExtId.get(extId) || playerByExtId.get(`sdio_${extId}`) || null)
        : null;
      if (!playerId) playerId = playerByName.get(name.toLowerCase()) || null;

      // Resolve game
      const gameExtId = proj.GameID ? `sdio_${proj.GameID}` : null;
      let gameId: string | null = gameExtId ? (gameByExtId.get(gameExtId) || null) : null;
      if (!gameId && proj.HomeOrAway && proj.Team && proj.Opponent) {
        const homeAbbr = proj.HomeOrAway === "HOME" ? proj.Team : proj.Opponent;
        const awayAbbr = proj.HomeOrAway === "AWAY" ? proj.Team : proj.Opponent;
        gameId = gameByTeams.get(`${homeAbbr}-${awayAbbr}`) || null;
      }

      return {
        player_id: playerId,
        player_name: name,
        team_abbr: proj.Team || "",
        league,
        game_id: gameId,
        game_date: date,
        projected_minutes: proj.Minutes || null,
        projected_points: proj.Points || null,
        projected_rebounds: proj.Rebounds || null,
        projected_assists: proj.Assists || null,
        projected_steals: proj.Steals || null,
        projected_blocks: proj.BlockedShots || null,
        projected_turnovers: proj.Turnovers || null,
        projected_three_made: proj.ThreePointersMade || null,
        projected_fg_made: proj.FieldGoalsMade || null,
        projected_fg_attempted: proj.FieldGoalsAttempted || null,
        projected_ft_made: proj.FreeThrowsMade || null,
        projected_ft_attempted: proj.FreeThrowsAttempted || null,
        projected_fantasy_points: proj.FantasyPoints || null,
        salary: proj.Salary || null,
        slate_id: proj.SlateID ? String(proj.SlateID) : null,
        external_player_id: extId,
      };
    });

    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const { error } = await supabase
        .from("player_projections")
        .upsert(batch, { onConflict: "player_name,team_abbr,game_date,league", ignoreDuplicates: false });
      if (error) console.error("Projections upsert error:", error.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        meta: { league, date, projections_upserted: records.length },
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-projections error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
