// fetch-live-props — Live player props using BallDontLie API
// Self-gating: checks for live NBA games first, skips if none active
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BDL_BASE = "https://api.balldontlie.io";

const MARKET_LABELS: Record<string, string> = {
  player_points: "Points", player_rebounds: "Rebounds", player_assists: "Assists",
  player_threes: "3-Pointers", player_blocks: "Blocks", player_steals: "Steals",
  player_turnovers: "Turnovers", player_points_rebounds_assists: "Pts+Reb+Ast",
  player_points_rebounds: "Pts+Reb", player_points_assists: "Pts+Ast",
  player_rebounds_assists: "Reb+Ast", player_double_double: "Double-Double",
};

function bdlPropToMarketKey(key: string): string {
  const map: Record<string, string> = {
    pts: "player_points", reb: "player_rebounds", ast: "player_assists",
    fg3m: "player_threes", blk: "player_blocks", stl: "player_steals",
    turnover: "player_turnovers", pra: "player_points_rebounds_assists",
    pr: "player_points_rebounds", pa: "player_points_assists",
    ra: "player_rebounds_assists", dd: "player_double_double",
    td: "player_triple_double", fgm: "player_field_goals",
    points: "player_points", rebounds: "player_rebounds", assists: "player_assists",
    threes: "player_threes", blocks: "player_blocks", steals: "player_steals",
    turnovers: "player_turnovers",
  };
  return map[key] || `player_${key}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const BDL_KEY = Deno.env.get("BALLDONTLIE_KEY");
    if (!BDL_KEY) throw new Error("BALLDONTLIE_KEY not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const headers = { Authorization: BDL_KEY };

    // Step 1: Check for live NBA games
    const { data: liveGames, error: lgErr } = await supabase
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, league")
      .eq("league", "NBA")
      .in("status", ["live", "in_progress"]);

    if (lgErr) throw lgErr;

    if (!liveGames || liveGames.length === 0) {
      console.log("[BDL-LiveProps] No live NBA games — skipping");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_live_games" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[BDL-LiveProps] ${liveGames.length} live NBA games`);
    let totalProps = 0;
    let totalHistory = 0;

    for (const game of liveGames) {
      // Find BDL game ID
      const { data: mapped } = await supabase
        .from("provider_game_map")
        .select("provider_game_id")
        .eq("game_key", game.id)
        .eq("provider", "balldontlie")
        .maybeSingle();

      const bdlGameId = mapped?.provider_game_id ? Number(mapped.provider_game_id) : null;
      if (!bdlGameId) {
        console.log(`[BDL-LiveProps] No BDL ID for ${game.home_abbr} vs ${game.away_abbr}`);
        continue;
      }

      // Fetch live player props
      try {
        const propsRes = await fetch(`${BDL_BASE}/v2/odds/player_props?game_id=${bdlGameId}`, { headers });
        if (!propsRes.ok) {
          if (propsRes.status === 429) {
            console.warn("[BDL-LiveProps] Rate limited, stopping");
            break;
          }
          console.warn(`[BDL-LiveProps] ${propsRes.status} for game ${bdlGameId}`);
          continue;
        }

        const propsData = await propsRes.json();
        const propItems: any[] = propsData.data || [];
        if (propItems.length === 0) continue;

        const propRows: any[] = [];
        const bdlLiveRows: any[] = [];

        for (const prop of propItems) {
          const player = prop.player;
          const playerId = player?.id ? String(player.id) : "unknown";
          const playerName = player ? `${player.first_name || ""} ${player.last_name || ""}`.trim() : "Unknown";
          const books = prop.bookmakers || [];

          for (const book of books) {
            const vendor = book.name || book.key || "unknown";
            for (const mkt of book.markets || []) {
              const rawKey = mkt.key || mkt.name || "unknown";
              const marketKey = bdlPropToMarketKey(rawKey);
              const outcomes = mkt.outcomes || [];
              const over = outcomes.find((x: any) => x.name === "Over");
              const under = outcomes.find((x: any) => x.name === "Under");
              const line = over?.point ?? under?.point ?? null;

              propRows.push({
                game_id: game.id,
                external_event_id: String(bdlGameId),
                player_name: playerName,
                market_key: marketKey,
                market_label: MARKET_LABELS[marketKey] || rawKey,
                bookmaker: vendor,
                line: line != null ? Number(line) : null,
                over_price: over?.price ?? null,
                under_price: under?.price ?? null,
              });

              bdlLiveRows.push({
                game_key: game.id,
                provider: "balldontlie",
                vendor,
                player_id: playerId,
                player_name: playerName,
                prop_type: marketKey,
                line_value: line != null ? Number(line) : 0,
                market_type: "over_under",
                over_odds: over?.price ?? null,
                under_odds: under?.price ?? null,
                raw: mkt,
                updated_at: new Date().toISOString(),
              });
            }
          }
        }

        console.log(`[BDL-LiveProps] ${game.home_abbr} vs ${game.away_abbr}: ${propRows.length} live props`);

        // Write to nba_player_props_live (primary)
        for (let i = 0; i < bdlLiveRows.length; i += 100) {
          const chunk = bdlLiveRows.slice(i, i + 100);
          const { error } = await supabase.from("nba_player_props_live").upsert(chunk, {
            onConflict: "game_key,provider,vendor,player_id,prop_type,line_value,market_type",
          });
          if (error) console.error("[BDL-LiveProps] upsert error:", error.message);
        }

        // Legacy player_props dual-write
        await supabase.from("player_props").delete().eq("game_id", game.id);
        for (let i = 0; i < propRows.length; i += 100) {
          const chunk = propRows.slice(i, i + 100);
          const { error } = await supabase.from("player_props").insert(chunk);
          if (error) console.error("[BDL-LiveProps] legacy insert error:", error.message);
        }
        totalProps += propRows.length;

        // Odds history snapshot
        const snapshotMinute = new Date(); snapshotMinute.setSeconds(0, 0);
        const historyRows: any[] = [];
        for (const p of propRows) {
          if (p.over_price != null) {
            historyRows.push({
              game_id: p.game_id, player_id: null, prop_type: p.market_key,
              book: p.bookmaker, line: p.line, side: "over", odds: p.over_price,
              snapshot_ts: new Date().toISOString(), snapshot_minute: snapshotMinute.toISOString(),
              source: "fetch-live-props-bdl",
            });
          }
          if (p.under_price != null) {
            historyRows.push({
              game_id: p.game_id, player_id: null, prop_type: p.market_key,
              book: p.bookmaker, line: p.line, side: "under", odds: p.under_price,
              snapshot_ts: new Date().toISOString(), snapshot_minute: snapshotMinute.toISOString(),
              source: "fetch-live-props-bdl",
            });
          }
        }
        for (let i = 0; i < historyRows.length; i += 100) {
          const chunk = historyRows.slice(i, i + 100);
          const { error } = await supabase.from("np_player_prop_odds_history").insert(chunk);
          if (error && !error.message?.includes("duplicate")) console.error("[BDL-LiveProps] history error:", error.message);
        }
        totalHistory += historyRows.length;

        // Archive
        if (bdlLiveRows.length > 0) {
          await supabase.from("nba_player_props_archive").insert(
            bdlLiveRows.map(r => ({
              game_key: r.game_key, provider: r.provider, vendor: r.vendor,
              player_id: r.player_id, player_name: r.player_name,
              prop_type: r.prop_type, line_value: r.line_value,
              market_type: r.market_type, over_odds: r.over_odds, under_odds: r.under_odds,
            }))
          );
        }
      } catch (e) {
        console.error(`[BDL-LiveProps] Error for game ${bdlGameId}:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true, source: "balldontlie", live_games: liveGames.length,
        props_stored: totalProps, history_rows: totalHistory,
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[BDL-LiveProps] Fatal:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
