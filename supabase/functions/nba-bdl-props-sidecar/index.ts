import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * NBA BDL Props Sidecar
 *
 * Runs once per minute via pg_cron, internally loops ~12 times (every 5s).
 * Fetches player props for all live NBA games from BallDontLie.
 * Budget: ~96 BDL req/min (8 games × 12 runs)
 */

const BDL_BASE = "https://api.balldontlie.io";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const MAX_RUNTIME_MS = 55_000;
const TICK_INTERVAL_MS = 5_000;

function bdlPropToMarketKey(key: string): string {
  const map: Record<string, string> = {
    pts: "player_points",
    reb: "player_rebounds",
    ast: "player_assists",
    fg3m: "player_threes",
    blk: "player_blocks",
    stl: "player_steals",
    turnover: "player_turnovers",
    pra: "player_points_rebounds_assists",
    pr: "player_points_rebounds",
    pa: "player_points_assists",
    ra: "player_rebounds_assists",
    dd: "player_double_double",
    td: "player_triple_double",
    fgm: "player_field_goals",
    points: "player_points",
    rebounds: "player_rebounds",
    assists: "player_assists",
    threes: "player_threes",
    blocks: "player_blocks",
    steals: "player_steals",
    turnovers: "player_turnovers",
  };
  return map[key] || `player_${key}`;
}

function getProjectRef(): string {
  try {
    return new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname.split(".")[0];
  } catch { return ""; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Guards ──
  const LIVE_PROJECT_REF = Deno.env.get("LIVE_PROJECT_REF") ?? "";
  const currentRef = getProjectRef();
  if (LIVE_PROJECT_REF && currentRef !== LIVE_PROJECT_REF) {
    return new Response(JSON.stringify({ ok: false, reason: "not-live" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const cosmicLive = req.headers.get("x-cosmic-live");
  const authHeader = req.headers.get("authorization");
  if (cosmicLive !== "true" && !authHeader) {
    return new Response(JSON.stringify({ ok: false, reason: "not-live" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BDL_KEY_RAW = Deno.env.get("BALLDONTLIE_KEY")!;
  const BDL_KEY = BDL_KEY_RAW.trim().replace(/^Bearer\s+/i, "");
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const bdlHeaders = { Authorization: `Bearer ${BDL_KEY}`, "X-Api-Key": BDL_KEY };

  const totals = { ticks: 0, props: 0, archived: 0, errors: 0 };
  const startMs = Date.now();

  while (Date.now() - startMs < MAX_RUNTIME_MS) {
    totals.ticks++;

    try {
      // Get live BDL game IDs from provider_game_map for currently live games
      const { data: liveGames } = await sb
        .from("games")
        .select("id, status")
        .eq("league", "NBA")
        .in("status", ["live", "in_progress"]);

      if (!liveGames || liveGames.length === 0) {
        console.log("[props-sidecar] No live games, sleeping 15s");
        await sleep(15_000);
        continue;
      }

      const liveGameIds = liveGames.map(g => g.id);

      // Get BDL IDs from provider_game_map
      const { data: mappings } = await sb
        .from("provider_game_map")
        .select("game_key, provider_game_id")
        .eq("provider", "balldontlie")
        .in("game_key", liveGameIds);

      if (!mappings || mappings.length === 0) {
        await sleep(TICK_INTERVAL_MS);
        continue;
      }

      // Fetch props for each game (parallel, max 5)
      const chunks: typeof mappings[] = [];
      for (let i = 0; i < mappings.length; i += 5) {
        chunks.push(mappings.slice(i, i + 5));
      }

      for (const chunk of chunks) {
        await Promise.all(chunk.map(async (m) => {
          const bdlGameId = m.provider_game_id;
          const gk = m.game_key;

          try {
            const propsRes = await fetch(`${BDL_BASE}/v2/odds/player_props?game_id=${bdlGameId}`, { headers: bdlHeaders });

            if (propsRes.status === 429) {
              console.warn(`[props-sidecar] 429 on props for game ${bdlGameId}, backing off`);
              return;
            }

            if (!propsRes.ok) return;

            const propItems: any[] = (await propsRes.json()).data || [];
            const archiveRows: any[] = [];

            for (const prop of propItems) {
              const player = prop.player;
              const playerId = player?.id ? String(player.id) : "unknown";
              const playerName = player ? `${player.first_name || ""} ${player.last_name || ""}`.trim() : null;

              for (const book of (prop.bookmakers || [])) {
                const vendor = book.name || book.key || "unknown";
                for (const mkt of (book.markets || [])) {
                  const propType = mkt.key || mkt.name || "unknown";
                  const outcomes = mkt.outcomes || [];
                  const over = outcomes.find((x: any) => x.name === "Over");
                  const under = outcomes.find((x: any) => x.name === "Under");
                  const line = over?.point ?? under?.point ?? 0;

                  await sb.from("nba_player_props_live").upsert({
                    game_key: gk, provider: "balldontlie", vendor,
                    player_id: playerId, player_name: playerName,
                    prop_type: propType, line_value: line,
                    market_type: "over_under",
                    over_odds: over?.price ?? null,
                    under_odds: under?.price ?? null,
                    raw: mkt, updated_at: new Date().toISOString(),
                  }, { onConflict: "game_key,provider,vendor,player_id,prop_type,line_value,market_type" });
                  totals.props++;

                  archiveRows.push({
                    game_key: gk, provider: "balldontlie", vendor,
                    player_id: playerId, player_name: playerName,
                    prop_type: propType, line_value: line,
                    market_type: "over_under",
                    over_odds: over?.price ?? null,
                    under_odds: under?.price ?? null,
                  });
                }
              }
            }

            // Archive snapshot
            if (archiveRows.length > 0) {
              await sb.from("nba_player_props_archive").insert(archiveRows);
              totals.archived += archiveRows.length;
            }
          } catch (e) {
            console.error(`[props-sidecar] props error game ${bdlGameId}:`, e);
            totals.errors++;
          }
        }));
      }

    } catch (e) {
      console.error("[props-sidecar] tick error:", e);
      totals.errors++;
    }

    await sleep(TICK_INTERVAL_MS);
  }

  console.log(`[props-sidecar] Done: ${JSON.stringify(totals)}`);
  return new Response(JSON.stringify({ ok: true, totals }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
