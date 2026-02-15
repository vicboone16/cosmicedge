import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("ROLLING_WAVE_API_KEY")!;
const CLIENT_ID = Deno.env.get("ROLLING_WAVE_CLIENT_ID")!;
const BASE = "https://rest.datafeeds.rolling-insights.com/api/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { game_id } = await req.json();
    if (!game_id) throw new Error("game_id required");

    // Check if already ingested
    const { count } = await sb
      .from("nfl_play_by_play")
      .select("*", { count: "exact", head: true })
      .eq("game_id", game_id);

    if ((count ?? 0) > 0) {
      return new Response(JSON.stringify({ ok: true, status: "already_ingested", plays: count }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch PBP
    const url = `${BASE}/play-by-play/NFL?RSC_token=${encodeURIComponent(API_KEY)}&client_id=${encodeURIComponent(CLIENT_ID)}&game_id=${encodeURIComponent(game_id)}`;
    console.log(`Fetching PBP for game ${game_id}`);
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const plays = extractPlays(data);
    console.log(`Found ${plays.length} plays`);

    if (plays.length === 0) {
      return new Response(JSON.stringify({ ok: true, status: "no_plays", plays: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert plays in chunks
    let playCount = 0;
    let playerCount = 0;
    const CHUNK = 50;

    for (let i = 0; i < plays.length; i += CHUNK) {
      const chunk = plays.slice(i, i + CHUNK);

      // Insert play records
      const playRows = chunk.map((p: any, idx: number) => ({
        game_id,
        sequence: p.sequence ?? (i + idx + 1),
        event: p.event ?? p.type ?? p.playType ?? null,
        quarter: p.quarter ?? p.period ?? null,
        down: p.down ?? null,
        yards_to_go: p.yards_to_go ?? p.yardsToGo ?? null,
        yard_line: p.yard_line ?? p.yardLine ?? null,
        game_clock: p.game_clock ?? p.gameClock ?? p.clock ?? null,
        possession_abbr: p.possession ?? p.possessionTeam ?? null,
        is_scoring_play: p.isScoringPlay ?? p.scoringPlay ?? false,
        is_touchdown: p.isTouchdown ?? p.touchdown ?? false,
        is_blocked: p.isBlocked ?? false,
        is_returned: p.isReturned ?? false,
        is_recovered: p.isRecovered ?? false,
        details_json: p.details ?? {},
        raw_json: p,
      }));

      const { error: playErr } = await sb
        .from("nfl_play_by_play")
        .upsert(playRows, { onConflict: "game_id,sequence" });

      if (playErr) console.error(`Play upsert error:`, playErr.message);
      else playCount += playRows.length;

      // Insert player records
      const playerRows: any[] = [];
      for (const p of chunk) {
        const seq = p.sequence ?? (plays.indexOf(p) + 1);
        const players = p.players ?? [];
        for (const pl of players) {
          playerRows.push({
            game_id,
            sequence: seq,
            player_id: String(pl.id ?? pl.player_id ?? pl.playerId),
            player_name: pl.name ?? pl.playerName ?? null,
            role: pl.role ?? pl.type ?? "unknown",
            action: pl.action ?? null,
            position: pl.position ?? null,
          });
        }
      }

      if (playerRows.length > 0) {
        const { error: plErr } = await sb
          .from("nfl_play_by_play_players")
          .upsert(playerRows, { onConflict: "game_id,sequence,player_id,role" });

        if (plErr) console.error(`Player upsert error:`, plErr.message);
        else playerCount += playerRows.length;
      }
    }

    // Recompute stats
    const statsResult = await recomputeStats(sb, game_id);

    return new Response(JSON.stringify({
      ok: true,
      plays: playCount,
      players: playerCount,
      stats: statsResult,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("NFL PBP error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function extractPlays(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data?.body && Array.isArray(data.body)) return data.body;
  if (data?.plays && Array.isArray(data.plays)) return data.plays;
  if (data?.data && Array.isArray(data.data)) return data.data;
  for (const val of Object.values(data)) {
    if (Array.isArray(val) && (val as any[]).length > 0) return val as any[];
  }
  return [];
}

// ── Recompute player game stats from PBP ──────────────────

async function recomputeStats(sb: any, game_id: string) {
  // Fetch all players from PBP for this game
  const { data: playerPlays } = await sb
    .from("nfl_play_by_play_players")
    .select("player_id, player_name, role, action, sequence")
    .eq("game_id", game_id);

  if (!playerPlays?.length) return { players: 0 };

  // Fetch the play details for context
  const { data: plays } = await sb
    .from("nfl_play_by_play")
    .select("sequence, event, possession_abbr, is_touchdown, details_json")
    .eq("game_id", game_id);

  const playMap = new Map((plays ?? []).map((p: any) => [p.sequence, p]));

  // Aggregate by player
  const stats = new Map<string, any>();

  for (const pp of playerPlays) {
    const pid = pp.player_id;
    if (!stats.has(pid)) {
      stats.set(pid, {
        game_id,
        player_id: pid,
        player_name: pp.player_name,
        team_abbr: null,
        targets: 0, receptions: 0, receiving_yards: 0, receiving_tds: 0,
        receiving_first_downs: 0, longest_reception: 0,
        rush_attempts: 0, rushing_yards: 0, rushing_tds: 0,
        rushing_first_downs: 0, longest_rush: 0,
        passing_yards: 0, interceptions: 0, passing_attempts: 0,
        completions: 0, passing_tds: 0,
      });
    }

    const s = stats.get(pid)!;
    const play = playMap.get(pp.sequence);
    if (play?.possession_abbr && !s.team_abbr) {
      s.team_abbr = play.possession_abbr;
    }

    // Role/action-based aggregation (basic — can be refined based on actual API data)
    const role = (pp.role || "").toLowerCase();
    const action = (pp.action || "").toLowerCase();

    if (role === "receiver" || role === "target") {
      s.targets++;
      if (action === "reception" || action === "catch" || action === "complete") {
        s.receptions++;
      }
    }
    if (role === "rusher" || role === "runner") {
      s.rush_attempts++;
    }
    if (role === "passer" || role === "quarterback") {
      s.passing_attempts++;
      if (action === "complete" || action === "completion") {
        s.completions++;
      }
      if (action === "interception") {
        s.interceptions++;
      }
    }
  }

  const rows = Array.from(stats.values());
  if (rows.length > 0) {
    const { error } = await sb
      .from("nfl_player_game_stats")
      .upsert(rows, { onConflict: "game_id,player_id" });

    if (error) console.error("Stats upsert error:", error.message);
  }

  return { players: rows.length };
}
