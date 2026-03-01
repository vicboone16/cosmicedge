// fetch-player-props — Player props fetcher using BallDontLie API (primary)
// Fetches pre-game and live player props from BDL v2
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BDL_BASE = "https://api.balldontlie.io";

// Market labels for display
const MARKET_LABELS: Record<string, string> = {
  player_points: "Points", player_rebounds: "Rebounds", player_assists: "Assists",
  player_threes: "3-Pointers", player_blocks: "Blocks", player_steals: "Steals",
  player_turnovers: "Turnovers", player_points_rebounds_assists: "Pts+Reb+Ast",
  player_points_rebounds: "Pts+Reb", player_points_assists: "Pts+Ast",
  player_rebounds_assists: "Reb+Ast", player_double_double: "Double-Double",
  player_triple_double: "Triple-Double", player_field_goals: "Field Goals",
};

// Map BDL prop key → our market key
function bdlPropToMarketKey(key: string): string {
  const map: Record<string, string> = {
    pts: "player_points", reb: "player_rebounds", ast: "player_assists",
    fg3m: "player_threes", blk: "player_blocks", stl: "player_steals",
    turnover: "player_turnovers", pra: "player_points_rebounds_assists",
    pr: "player_points_rebounds", pa: "player_points_assists",
    ra: "player_rebounds_assists", dd: "player_double_double",
    td: "player_triple_double", fgm: "player_field_goals",
    // BDL may use different keys — handle common variants
    points: "player_points", rebounds: "player_rebounds", assists: "player_assists",
    threes: "player_threes", blocks: "player_blocks", steals: "player_steals",
    turnovers: "player_turnovers",
  };
  return map[key] || `player_${key}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const BDL_KEY_RAW = Deno.env.get("BALLDONTLIE_KEY");
    const BDL_KEY = (BDL_KEY_RAW || "").trim().replace(/^Bearer\s+/i, "");
    if (!BDL_KEY) {
      return new Response(
        JSON.stringify({ error: "BALLDONTLIE_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "NBA";
    const gameId = url.searchParams.get("game_id");
    const windowHours = url.searchParams.get("window_hours");

    // Only NBA supported via BDL
    if (league !== "NBA") {
      return new Response(
        JSON.stringify({ success: true, props_stored: 0, reason: `BDL only supports NBA, got ${league}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers = { Authorization: BDL_KEY, "X-Api-Key": BDL_KEY };

    // Determine which DB games to fetch props for
    let dbGames: { id: string; home_abbr: string; away_abbr: string; start_time: string }[] = [];

    if (gameId) {
      const { data: game } = await supabase.from("games").select("id, home_abbr, away_abbr, start_time").eq("id", gameId).single();
      if (!game) {
        return new Response(JSON.stringify({ error: "Game not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      dbGames = [game];
    } else if (windowHours) {
      const now = new Date();
      const horizon = new Date(now.getTime() + Number(windowHours) * 3600000);
      const { data } = await supabase.from("games").select("id, home_abbr, away_abbr, start_time")
        .eq("league", "NBA")
        .gte("start_time", now.toISOString())
        .lte("start_time", horizon.toISOString())
        .in("status", ["scheduled"]);
      dbGames = data || [];
    } else {
      // Default: today + tomorrow games
      const today = new Date();
      const startOfDay = new Date(today); startOfDay.setHours(0, 0, 0, 0);
      const endOfTomorrow = new Date(today); endOfTomorrow.setDate(endOfTomorrow.getDate() + 1); endOfTomorrow.setHours(23, 59, 59, 999);
      const { data } = await supabase.from("games").select("id, home_abbr, away_abbr, start_time")
        .eq("league", "NBA")
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfTomorrow.toISOString())
        .in("status", ["scheduled", "live", "in_progress"]);
      dbGames = (data || []).slice(0, 15);
    }

    console.log(`[BDL-Props] Fetching props for ${dbGames.length} NBA games`);
    if (dbGames.length === 0) {
      return new Response(
        JSON.stringify({ success: true, props_stored: 0, games: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalProps = 0;
    let totalHistory = 0;
    const playerNameCache: Record<string, string> = {};

    // Helper: resolve BDL player ID to name via API
    async function resolvePlayerName(bdlPlayerId: string): Promise<string> {
      if (playerNameCache[bdlPlayerId]) return playerNameCache[bdlPlayerId];
      try {
        const res = await fetch(`${BDL_BASE}/v1/players/${bdlPlayerId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          const p = data.data || data;
          const name = `${p.first_name || ""} ${p.last_name || ""}`.trim();
          if (name) { playerNameCache[bdlPlayerId] = name; return name; }
        }
      } catch {}
      return `Player ${bdlPlayerId}`;
    }

    for (const game of dbGames) {
      // Step 1: Find BDL game ID from provider_game_map or by date search
      let bdlGameId: number | null = null;

      const { data: mapped } = await supabase
        .from("provider_game_map")
        .select("provider_game_id")
        .eq("game_key", game.id)
        .eq("provider", "balldontlie")
        .maybeSingle();

      if (mapped?.provider_game_id) {
        bdlGameId = Number(mapped.provider_game_id);
      } else {
        // Search BDL for the game by date
        const gameDate = game.start_time.split("T")[0];
        try {
          const searchRes = await fetch(`${BDL_BASE}/v1/games?dates[]=${gameDate}`, { headers });
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const bdlGames: any[] = searchData.data || [];
            const match = bdlGames.find((g: any) =>
              g.home_team?.abbreviation === game.home_abbr &&
              g.visitor_team?.abbreviation === game.away_abbr
            );
            if (match) {
              bdlGameId = match.id;
              // Save mapping for future use
              await supabase.from("provider_game_map").upsert({
                game_key: game.id,
                league: "NBA",
                provider: "balldontlie",
                provider_game_id: String(match.id),
                game_date: gameDate,
                home_team_abbr: game.home_abbr,
                away_team_abbr: game.away_abbr,
                start_time_utc: game.start_time,
                updated_at: new Date().toISOString(),
              }, { onConflict: "game_key,provider" });
            }
          }
        } catch (e) {
          console.warn(`[BDL-Props] Game search error for ${game.home_abbr} vs ${game.away_abbr}:`, e);
        }
      }

      if (!bdlGameId) {
        console.log(`[BDL-Props] No BDL game ID for ${game.home_abbr} vs ${game.away_abbr}, skipping`);
        continue;
      }

      // Step 2: Fetch player props from BDL
      try {
        const propsRes = await fetch(`${BDL_BASE}/v2/odds/player_props?game_id=${bdlGameId}`, { headers });
        if (!propsRes.ok) {
          if (propsRes.status === 429) {
            console.warn(`[BDL-Props] Rate limited, stopping`);
            break;
          }
          console.warn(`[BDL-Props] ${propsRes.status} for game ${bdlGameId}`);
          continue;
        }

        const propsData = await propsRes.json();
        const propItems: any[] = propsData.data || [];

        if (propItems.length === 0) {
          console.log(`[BDL-Props] No props for ${game.home_abbr} vs ${game.away_abbr}`);
          continue;
        }

        // Log first item for debugging structure
        if (propItems.length > 0) {
          const sample = propItems[0];
          console.log(`[BDL-Props] Sample keys: ${Object.keys(sample).join(",")}`);
          console.log(`[BDL-Props] Sample: ${JSON.stringify(sample).slice(0, 500)}`);
        }

        // Batch resolve unique player IDs to names
        const uniquePlayerIds = [...new Set(propItems.map((p: any) => String(p.player_id || p.player?.id || "")).filter(Boolean))];
        // Resolve up to 50 unique players (covers most games), rest will use fallback
        const resolveLimit = Math.min(uniquePlayerIds.length, 50);
        for (let i = 0; i < resolveLimit; i += 10) {
          const batch = uniquePlayerIds.slice(i, i + 10);
          await Promise.all(batch.map(id => resolvePlayerName(id)));
        }
        console.log(`[BDL-Props] Resolved ${Object.keys(playerNameCache).length} player names`);

        const propRows: any[] = [];
        const bdlLiveRows: any[] = [];

        for (const prop of propItems) {
          const playerId = prop.player_id ? String(prop.player_id) : (prop.player?.id ? String(prop.player.id) : "unknown");
          const playerName = playerNameCache[playerId] || prop.player_name || (prop.player ? `${prop.player.first_name || ""} ${prop.player.last_name || ""}`.trim() : "") || `Player ${playerId}`;

          // BDL v2 flat format detection
          if (prop.prop_type && prop.line_value != null) {
            const rawKey = prop.prop_type;
            const marketKey = bdlPropToMarketKey(rawKey);
            const line = Number(prop.line_value);
            const marketObj = prop.market || {};
            const marketType = marketObj.type || "over_under"; // "milestone", "over_under", etc.
            const odds = marketObj.odds ?? null;
            const vendorName = prop.vendor || "unknown";

            // For over/under markets, odds is on the market object
            // For milestone markets, there's a single odds value
            const isOverUnder = marketType === "over_under";
            const overPrice = isOverUnder ? (marketObj.over_odds ?? odds) : odds;
            const underPrice = isOverUnder ? (marketObj.under_odds ?? null) : null;

            propRows.push({
              game_id: game.id,
              external_event_id: String(bdlGameId),
              player_name: playerName || `Player ${playerId}`,
              market_key: marketKey,
              market_label: MARKET_LABELS[marketKey] || rawKey,
              bookmaker: vendorName,
              line,
              over_price: overPrice,
              under_price: underPrice,
            });

            bdlLiveRows.push({
              game_key: game.id,
              provider: "balldontlie",
              vendor: vendorName,
              player_id: playerId,
              player_name: playerName || `Player ${playerId}`,
              prop_type: marketKey,
              line_value: line,
              market_type: marketType,
              over_odds: overPrice,
              under_odds: underPrice,
              raw: prop,
              updated_at: new Date().toISOString(),
            });
            continue;
          }

          // Fallback: nested bookmakers structure
          const books = prop.bookmakers || prop.sportsbooks || [];

          for (const book of books) {
            const vendor = book.name || book.key || "unknown";
            const markets = book.markets || [];

            for (const mkt of markets) {
              const rawKey = mkt.key || mkt.name || "unknown";
              const marketKey = bdlPropToMarketKey(rawKey);
              const outcomes = mkt.outcomes || [];
              const over = outcomes.find((x: any) => x.name === "Over");
              const under = outcomes.find((x: any) => x.name === "Under");
              const line = over?.point ?? under?.point ?? null;

              // Legacy player_props table
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

              // nba_player_props_live table (primary for UI)
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

        console.log(`[BDL-Props] ${game.home_abbr} vs ${game.away_abbr}: ${propRows.length} props from ${propItems.length} players`);

        // Write to nba_player_props_live (primary table)
        for (let i = 0; i < bdlLiveRows.length; i += 100) {
          const chunk = bdlLiveRows.slice(i, i + 100);
          const { error } = await supabase.from("nba_player_props_live").upsert(chunk, {
            onConflict: "game_key,provider,vendor,player_id,prop_type,line_value,market_type",
          });
          if (error) console.error("[BDL-Props] nba_player_props_live upsert error:", error.message);
        }

        // Also write to legacy player_props for backward compat
        await supabase.from("player_props").delete().eq("game_id", game.id);
        for (let i = 0; i < propRows.length; i += 100) {
          const chunk = propRows.slice(i, i + 100);
          const { error } = await supabase.from("player_props").insert(chunk);
          if (error) console.error("[BDL-Props] player_props insert error:", error.message);
        }

        // Snapshot into odds history
        const snapshotMinute = new Date();
        snapshotMinute.setSeconds(0, 0);
        const historyRows: any[] = [];
        for (const p of propRows) {
          if (p.over_price != null) {
            historyRows.push({
              game_id: p.game_id, player_id: null, prop_type: p.market_key,
              book: p.bookmaker, line: p.line, side: "over", odds: p.over_price,
              snapshot_ts: new Date().toISOString(), snapshot_minute: snapshotMinute.toISOString(),
              source: "fetch-player-props-bdl",
            });
          }
          if (p.under_price != null) {
            historyRows.push({
              game_id: p.game_id, player_id: null, prop_type: p.market_key,
              book: p.bookmaker, line: p.line, side: "under", odds: p.under_price,
              snapshot_ts: new Date().toISOString(), snapshot_minute: snapshotMinute.toISOString(),
              source: "fetch-player-props-bdl",
            });
          }
        }
        for (let i = 0; i < historyRows.length; i += 100) {
          const chunk = historyRows.slice(i, i + 100);
          const { error } = await supabase.from("np_player_prop_odds_history").insert(chunk);
          if (error && !error.message?.includes("duplicate")) console.error("[BDL-Props] History error:", error.message);
        }
        totalHistory += historyRows.length;

        // Archive snapshot
        if (bdlLiveRows.length > 0) {
          const archiveRows = bdlLiveRows.map(r => ({
            game_key: r.game_key, provider: r.provider, vendor: r.vendor,
            player_id: r.player_id, player_name: r.player_name,
            prop_type: r.prop_type, line_value: r.line_value,
            market_type: r.market_type, over_odds: r.over_odds, under_odds: r.under_odds,
          }));
          await supabase.from("nba_player_props_archive").insert(archiveRows);
        }

        totalProps += propRows.length;
      } catch (e) {
        console.error(`[BDL-Props] Error for game ${bdlGameId}:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true, source: "balldontlie", games: dbGames.length,
        props_stored: totalProps, history_rows: totalHistory,
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[BDL-Props] Fatal:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
