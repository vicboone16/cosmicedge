import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * NBA BDL Props Sidecar
 *
 * Runs once per minute via pg_cron, internally loops ~6 times (every 8s).
 * Fetches player props for live NBA games from BallDontLie ONE AT A TIME.
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
            const liveRows: any[] = [];
            const archiveRows: any[] = [];
            const flatAggregates = new Map<string, any>();
            const bdlNameById = new Map<string, string>();

            // Resolve player names from bdl_player_cache first
            const allBdlIds = [...new Set(
              propItems
                .map((p: any) => p?.player_id ? String(p.player_id) : (p?.player?.id ? String(p.player.id) : null))
                .filter((id: string | null) => !!id)
            )] as string[];

            if (allBdlIds.length > 0) {
              // Check cache first
              const { data: cached } = await sb
                .from("bdl_player_cache")
                .select("bdl_id,full_name")
                .in("bdl_id", allBdlIds);

              for (const row of (cached || [])) {
                if (row.bdl_id && row.full_name?.trim()) {
                  bdlNameById.set(row.bdl_id, row.full_name.trim());
                }
              }

              // For uncached IDs, call BDL player API and cache
              const uncached = allBdlIds.filter(id => !bdlNameById.has(id));
              for (const pid of uncached.slice(0, 20)) {
                try {
                  const pRes = await fetch(`${BDL_BASE}/v2/players/${pid}`, { headers: bdlHeaders });
                  if (pRes.ok) {
                    const pData = (await pRes.json()).data || await pRes.json();
                    const fn = pData.first_name || "";
                    const ln = pData.last_name || "";
                    const fullName = `${fn} ${ln}`.trim();
                    if (fullName) {
                      bdlNameById.set(pid, fullName);
                      await sb.from("bdl_player_cache").upsert({
                        bdl_id: pid, first_name: fn, last_name: ln,
                        full_name: fullName,
                        team: pData.team?.abbreviation || null,
                      }, { onConflict: "bdl_id" });
                    }
                  }
                } catch { /* skip */ }
              }
            }

            for (const prop of propItems) {
              // BDL v2 flat format
              if (prop.prop_type && prop.line_value != null) {
                const playerId = prop.player_id ? String(prop.player_id) : (prop.player?.id ? String(prop.player.id) : "unknown");
                const playerName = prop.player_name
                  || (prop.player ? `${prop.player.first_name || ""} ${prop.player.last_name || ""}`.trim() : null)
                  || bdlNameById.get(playerId)
                  || (playerId !== "unknown" ? `Player ${playerId}` : null);
                const rawKey = String(prop.prop_type);
                const propType = bdlPropToMarketKey(rawKey);
                const line = Number(prop.line_value);
                const marketObj = prop.market || {};
                const marketType = marketObj.type || "over_under";
                if (marketType !== "over_under") continue;

                const vendor = prop.vendor || marketObj.vendor || "unknown";
                const aggKey = `${vendor}|${playerId}|${propType}|${line}`;
                const existing = flatAggregates.get(aggKey) || {
                  game_key: gk,
                  provider: "balldontlie",
                  vendor,
                  player_id: playerId,
                  player_name: playerName,
                  prop_type: propType,
                  line_value: line,
                  market_type: "over_under",
                  over_odds: null,
                  under_odds: null,
                  raw: prop,
                  updated_at: new Date().toISOString(),
                };

                const overOdds = marketObj.over_odds ?? null;
                const underOdds = marketObj.under_odds ?? null;
                const singleOdds = marketObj.odds ?? prop.odds ?? null;
                const sideName = String(marketObj.name || prop.side || "").toLowerCase();

                if (overOdds != null) existing.over_odds = overOdds;
                if (underOdds != null) existing.under_odds = underOdds;
                if (overOdds == null && underOdds == null && singleOdds != null) {
                  if (sideName === "over") existing.over_odds = singleOdds;
                  if (sideName === "under") existing.under_odds = singleOdds;
                }

                existing.updated_at = new Date().toISOString();
                flatAggregates.set(aggKey, existing);
                continue;
              }

              // Legacy nested bookmakers format fallback
              const player = prop.player;
              const playerId = player?.id ? String(player.id) : "unknown";
              const playerName = player ? `${player.first_name || ""} ${player.last_name || ""}`.trim() : null;

              for (const book of (prop.bookmakers || [])) {
                const vendor = book.name || book.key || "unknown";
                for (const mkt of (book.markets || [])) {
                  const rawKey = mkt.key || mkt.name || "unknown";
                  const propType = bdlPropToMarketKey(rawKey);
                  const outcomes = mkt.outcomes || [];
                  const over = outcomes.find((x: any) => x.name === "Over");
                  const under = outcomes.find((x: any) => x.name === "Under");
                  if (over?.price == null || under?.price == null) continue;
                  const line = over?.point ?? under?.point ?? 0;

                  liveRows.push({
                    game_key: gk,
                    provider: "balldontlie",
                    vendor,
                    player_id: playerId,
                    player_name: playerName,
                    prop_type: propType,
                    line_value: line,
                    market_type: "over_under",
                    over_odds: over.price,
                    under_odds: under.price,
                    raw: mkt,
                    updated_at: new Date().toISOString(),
                  });
                }
              }
            }

            // Finalize flat-format rows only when BOTH sides are present
            for (const row of flatAggregates.values()) {
              if (row.over_odds == null || row.under_odds == null) continue;
              liveRows.push(row);
            }

            if (liveRows.length > 0) {
              for (let i = 0; i < liveRows.length; i += 100) {
                const chunk = liveRows.slice(i, i + 100);
                const { error } = await sb.from("nba_player_props_live").upsert(chunk, {
                  onConflict: "game_key,provider,vendor,player_id,prop_type,line_value,market_type",
                });
                if (error) console.error("[props-sidecar] upsert error:", error.message);
              }
              totals.props += liveRows.length;

              for (const r of liveRows) {
                archiveRows.push({
                  game_key: r.game_key,
                  provider: r.provider,
                  vendor: r.vendor,
                  player_id: r.player_id,
                  player_name: r.player_name,
                  prop_type: r.prop_type,
                  line_value: r.line_value,
                  market_type: r.market_type,
                  over_odds: r.over_odds,
                  under_odds: r.under_odds,
                });
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
