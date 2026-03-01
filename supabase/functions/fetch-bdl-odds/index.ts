// fetch-bdl-odds — Fetches game-level odds (ML, Spread, Totals) from BallDontLie v2
// Covers scheduled, live, and final NBA games
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
    if (!BDL_KEY) {
      return new Response(JSON.stringify({ error: "BALLDONTLIE_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const gameId = url.searchParams.get("game_id");
    const scope = url.searchParams.get("scope") || "today"; // today | live | upcoming | all

    const headers = { Authorization: `Bearer ${BDL_KEY}`, "X-Api-Key": BDL_KEY };

    // Determine which games to fetch odds for
    let dbGames: { id: string; home_abbr: string; away_abbr: string; start_time: string; status: string }[] = [];

    if (gameId) {
      const { data: game } = await supabase.from("games").select("id, home_abbr, away_abbr, start_time, status")
        .eq("id", gameId).single();
      if (!game) return new Response(JSON.stringify({ error: "Game not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      dbGames = [game];
    } else if (scope === "live") {
      const { data } = await supabase.from("games").select("id, home_abbr, away_abbr, start_time, status")
        .eq("league", "NBA").in("status", ["live", "in_progress"]);
      dbGames = data || [];
    } else if (scope === "upcoming") {
      const now = new Date();
      const horizon = new Date(now.getTime() + 24 * 3600000);
      const { data } = await supabase.from("games").select("id, home_abbr, away_abbr, start_time, status")
        .eq("league", "NBA").eq("status", "scheduled")
        .gte("start_time", now.toISOString()).lte("start_time", horizon.toISOString());
      dbGames = data || [];
    } else {
      // Default: today + tomorrow (all statuses)
      const today = new Date();
      const startOfDay = new Date(today); startOfDay.setHours(0, 0, 0, 0);
      const endOfTomorrow = new Date(today); endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
      endOfTomorrow.setHours(23, 59, 59, 999);
      const { data } = await supabase.from("games").select("id, home_abbr, away_abbr, start_time, status")
        .eq("league", "NBA")
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfTomorrow.toISOString());
      dbGames = (data || []).slice(0, 20);
    }

    console.log(`[BDL-Odds] Fetching odds for ${dbGames.length} NBA games (scope=${scope})`);
    if (dbGames.length === 0) {
      return new Response(JSON.stringify({ success: true, odds_stored: 0, games: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let totalOdds = 0;
    let totalSnapshots = 0;

    // Collect BDL game IDs
    const bdlGameIds: { dbGame: typeof dbGames[0]; bdlId: number }[] = [];

    for (const game of dbGames) {
      // Look up BDL game ID
      const { data: mapped } = await supabase.from("provider_game_map")
        .select("provider_game_id").eq("game_key", game.id).eq("provider", "balldontlie").maybeSingle();

      if (mapped?.provider_game_id) {
        bdlGameIds.push({ dbGame: game, bdlId: Number(mapped.provider_game_id) });
      } else {
        // Search BDL by date
        const gameDate = game.start_time.split("T")[0];
        try {
          const searchRes = await fetch(`${BDL_BASE}/v1/games?dates[]=${gameDate}`, { headers });
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const match = (searchData.data || []).find((g: any) =>
              g.home_team?.abbreviation === game.home_abbr &&
              g.visitor_team?.abbreviation === game.away_abbr
            );
            if (match) {
              bdlGameIds.push({ dbGame: game, bdlId: match.id });
              await supabase.from("provider_game_map").upsert({
                game_key: game.id, league: "NBA", provider: "balldontlie",
                provider_game_id: String(match.id), game_date: gameDate,
                home_team_abbr: game.home_abbr, away_team_abbr: game.away_abbr,
                start_time_utc: game.start_time, updated_at: new Date().toISOString(),
              }, { onConflict: "game_key,provider" });
            }
          }
        } catch (e) {
          console.warn(`[BDL-Odds] Game search error for ${game.home_abbr} vs ${game.away_abbr}:`, e);
        }
      }
    }

    if (bdlGameIds.length === 0) {
      return new Response(JSON.stringify({ success: true, odds_stored: 0, games: 0, reason: "no BDL game IDs found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch odds in batch (BDL supports multiple game_ids[])
    const idsParam = bdlGameIds.map(g => `game_ids[]=${g.bdlId}`).join("&");
    const oddsRes = await fetch(`${BDL_BASE}/v2/odds?${idsParam}`, { headers });

    if (!oddsRes.ok) {
      console.error(`[BDL-Odds] API error: ${oddsRes.status}`);
      return new Response(JSON.stringify({ error: `BDL API returned ${oddsRes.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const oddsData = await oddsRes.json();
    const oddsItems: any[] = oddsData.data || [];

    // Log sample for debugging
    if (oddsItems.length > 0) {
      const sample = oddsItems[0];
      console.log(`[BDL-Odds] Sample keys: ${Object.keys(sample).join(",")}`);
      console.log(`[BDL-Odds] Sample: ${JSON.stringify(sample).slice(0, 600)}`);
    }

    // Build game_key lookup from BDL ID
    const bdlToGame = new Map<number, typeof dbGames[0]>();
    for (const { dbGame, bdlId } of bdlGameIds) {
      bdlToGame.set(bdlId, dbGame);
    }

    const oddsRows: any[] = [];
    const snapshotRows: any[] = [];

    for (const item of oddsItems) {
      const bdlGameId = item.game_id || item.game?.id;
      const game = bdlToGame.get(bdlGameId);
      if (!game) continue;

      const vendor = item.vendor || "unknown";
      const now = new Date().toISOString();

      // ── BDL v2 unified flat format ──
      // Each item contains ALL markets: spread, moneyline, and total in one object
      if (item.moneyline_home_odds != null || item.spread_home_value != null || item.total_value != null) {
        // Moneyline row
        if (item.moneyline_home_odds != null) {
          oddsRows.push({
            game_key: game.id, provider: "balldontlie", vendor,
            market: "moneyline",
            home_line: null, away_line: null, total: null,
            home_odds: item.moneyline_home_odds, away_odds: item.moneyline_away_odds ?? null,
            over_odds: null, under_odds: null,
            raw: { moneyline_home: item.moneyline_home_odds, moneyline_away: item.moneyline_away_odds },
            updated_at: now,
          });
          snapshotRows.push({
            game_id: game.id, bookmaker: `bdl_${vendor}`, market_type: "moneyline",
            home_price: item.moneyline_home_odds, away_price: item.moneyline_away_odds ?? null,
            line: null,
          });
        }

        // Spread row
        if (item.spread_home_value != null) {
          const spreadVal = Number(item.spread_home_value);
          oddsRows.push({
            game_key: game.id, provider: "balldontlie", vendor,
            market: "spread",
            home_line: spreadVal, away_line: item.spread_away_value ? Number(item.spread_away_value) : -spreadVal,
            total: null,
            home_odds: item.spread_home_odds ?? null, away_odds: item.spread_away_odds ?? null,
            over_odds: null, under_odds: null,
            raw: { spread_home: spreadVal, spread_away: item.spread_away_value, home_odds: item.spread_home_odds, away_odds: item.spread_away_odds },
            updated_at: now,
          });
          snapshotRows.push({
            game_id: game.id, bookmaker: `bdl_${vendor}`, market_type: "spread",
            home_price: item.spread_home_odds ?? null, away_price: item.spread_away_odds ?? null,
            line: spreadVal,
          });
        }

        // Total row
        if (item.total_value != null) {
          const totalVal = Number(item.total_value);
          oddsRows.push({
            game_key: game.id, provider: "balldontlie", vendor,
            market: "total",
            home_line: null, away_line: null, total: totalVal,
            home_odds: null, away_odds: null,
            over_odds: item.total_over_odds ?? null, under_odds: item.total_under_odds ?? null,
            raw: { total: totalVal, over_odds: item.total_over_odds, under_odds: item.total_under_odds },
            updated_at: now,
          });
          snapshotRows.push({
            game_id: game.id, bookmaker: `bdl_${vendor}`, market_type: "total",
            home_price: item.total_over_odds ?? null, away_price: item.total_under_odds ?? null,
            line: totalVal,
          });
        }
        continue;
      }

      // ── Fallback: nested bookmakers format ──
      const books = item.bookmakers || item.sportsbooks || [];
      for (const book of books) {
        const bkVendor = book.name || book.key || "unknown";
        const markets = book.markets || [];
        for (const mkt of markets) {
          const market = mkt.key || mkt.name || "unknown";
          const outcomes = mkt.outcomes || [];
          const home = outcomes.find((x: any) => x.name === "Home" || x.name === game.home_abbr);
          const away = outcomes.find((x: any) => x.name === "Away" || x.name === game.away_abbr);
          const over = outcomes.find((x: any) => x.name === "Over");
          const under = outcomes.find((x: any) => x.name === "Under");

          oddsRows.push({
            game_key: game.id, provider: "balldontlie", vendor: bkVendor,
            market,
            home_line: home?.point ?? null, away_line: away?.point ?? null,
            total: over?.point ?? under?.point ?? null,
            home_odds: home?.price ?? null, away_odds: away?.price ?? null,
            over_odds: over?.price ?? null, under_odds: under?.price ?? null,
            raw: mkt, updated_at: now,
          });
          snapshotRows.push({
            game_id: game.id, bookmaker: `bdl_${bkVendor}`, market_type: market,
            home_price: home?.price ?? null, away_price: away?.price ?? null,
            line: home?.point ?? over?.point ?? null,
          });
        }
      }
    }

    console.log(`[BDL-Odds] Parsed ${oddsRows.length} odds rows, ${snapshotRows.length} snapshots from ${oddsItems.length} API items`);

    // Write to nba_game_odds
    for (let i = 0; i < oddsRows.length; i += 100) {
      const chunk = oddsRows.slice(i, i + 100);
      const { error } = await supabase.from("nba_game_odds").upsert(chunk, {
        onConflict: "game_key,provider,vendor,market",
      });
      if (error) console.error("[BDL-Odds] nba_game_odds upsert error:", error.message);
      else totalOdds += chunk.length;
    }

    // Write to odds_snapshots for historical tracking
    for (let i = 0; i < snapshotRows.length; i += 100) {
      const chunk = snapshotRows.slice(i, i + 100);
      const { error } = await supabase.from("odds_snapshots").insert(chunk);
      if (error && !error.message?.includes("duplicate")) {
        console.error("[BDL-Odds] odds_snapshots insert error:", error.message);
      } else {
        totalSnapshots += chunk.length;
      }
    }

    return new Response(JSON.stringify({
      success: true, source: "balldontlie", scope,
      games: bdlGameIds.length, api_items: oddsItems.length,
      odds_stored: totalOdds, snapshots: totalSnapshots,
      fetched_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[BDL-Odds] Fatal:", msg);
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
