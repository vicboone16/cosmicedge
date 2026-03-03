// fetch-bdl-lineups — Fetch projected/confirmed lineups from BDL for today's NBA games
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BDL_BASE = "https://api.balldontlie.io";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const BDL_KEY = (Deno.env.get("BALLDONTLIE_KEY") || "").trim().replace(/^Bearer\s+/i, "");
    if (!BDL_KEY) throw new Error("BALLDONTLIE_KEY not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const hdrs = { Authorization: `Bearer ${BDL_KEY}`, "X-Api-Key": BDL_KEY };

    // Get today's scheduled NBA games with BDL mappings
    const url = new URL(req.url);
    const targetDate = url.searchParams.get("date") || new Date().toISOString().split("T")[0];

    const d = new Date(targetDate + "T00:00:00Z");
    const dayBefore = new Date(d.getTime() - 86400000).toISOString().split("T")[0];
    const dayAfter = new Date(d.getTime() + 86400000).toISOString().split("T")[0];

    const { data: dbGames } = await supabase.from("games")
      .select("id, home_abbr, away_abbr, start_time, status")
      .eq("league", "NBA")
      .gte("start_time", dayBefore + "T00:00:00Z")
      .lte("start_time", dayAfter + "T23:59:59Z");

    if (!dbGames || dbGames.length === 0) {
      return new Response(JSON.stringify({ ok: true, msg: "no games found", date: targetDate }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get BDL ID mappings
    const gameIds = dbGames.map(g => g.id);
    const { data: mappings } = await supabase.from("provider_game_map")
      .select("game_key, provider_game_id")
      .eq("provider", "balldontlie")
      .in("game_key", gameIds);

    const bdlMap = new Map<string, number>();
    for (const m of (mappings || [])) {
      bdlMap.set(m.game_key, Number(m.provider_game_id));
    }

    const stats = { games: 0, players: 0, errors: 0 };
    const allLineups: any[] = [];

    for (const game of dbGames) {
      const bdlId = bdlMap.get(game.id);
      if (!bdlId) {
        console.warn(`[fetch-bdl-lineups] No BDL mapping for ${game.home_abbr} vs ${game.away_abbr}`);
        continue;
      }

      try {
        const res = await fetch(`${BDL_BASE}/v1/lineups?game_ids[]=${bdlId}`, { headers: hdrs });
        
        if (res.status === 429) {
          console.warn("[fetch-bdl-lineups] Rate limited, stopping");
          break;
        }
        
        if (!res.ok) {
          const errText = await res.text();
          console.warn(`[fetch-bdl-lineups] ${res.status} for game ${bdlId}: ${errText}`);
          stats.errors++;
          continue;
        }

        const data = await res.json();
        const items: any[] = data.data || [];
        console.log(`[fetch-bdl-lineups] ${game.home_abbr} vs ${game.away_abbr}: ${items.length} lineup entries`);
        stats.games++;

        for (const entry of items) {
          const player = entry.player;
          if (!player) continue;

          const playerName = `${player.first_name || ""} ${player.last_name || ""}`.trim();
          if (!playerName) continue;

          // Determine team abbr from player's team_id vs game teams
          const teamAbbr = player.team_id
            ? (await resolveTeamAbbr(supabase, player.team_id, hdrs, game))
            : (entry.team?.abbreviation || game.home_abbr);

          const position = entry.position || player.position || "Unknown";
          const isStarter = entry.starter === true;
          const depthOrder = isStarter ? 1 : 2;

          // Upsert into depth_charts
          await supabase.from("depth_charts").upsert({
            player_name: playerName,
            team_abbr: teamAbbr,
            position,
            depth_order: depthOrder,
            league: "NBA",
            external_player_id: String(player.id),
            updated_at: new Date().toISOString(),
          }, { onConflict: "team_abbr,position,player_name" });

          allLineups.push({
            game: `${game.away_abbr}@${game.home_abbr}`,
            player: playerName,
            team: teamAbbr,
            position,
            starter: isStarter,
          });

          stats.players++;
        }
      } catch (e) {
        console.error(`[fetch-bdl-lineups] Error for game ${game.id}:`, e);
        stats.errors++;
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 400));
    }

    console.log(`[fetch-bdl-lineups] Done:`, stats);
    return new Response(JSON.stringify({ ok: true, date: targetDate, stats, lineups: allLineups }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fetch-bdl-lineups] Fatal:", msg);
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// Cache for team ID → abbreviation resolution
const teamCache = new Map<number, string>();

async function resolveTeamAbbr(
  supabase: any,
  teamId: number,
  hdrs: Record<string, string>,
  game: { home_abbr: string; away_abbr: string }
): Promise<string> {
  if (teamCache.has(teamId)) return teamCache.get(teamId)!;

  try {
    const res = await fetch(`${BDL_BASE}/v1/teams/${teamId}`, { headers: hdrs });
    if (res.ok) {
      const data = await res.json();
      const abbr = data.data?.abbreviation || data.abbreviation;
      if (abbr) {
        teamCache.set(teamId, abbr);
        return abbr;
      }
    }
  } catch (_) { /* fallback */ }

  // Fallback: return home_abbr
  return game.home_abbr;
}
