import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * bolt-odds-bridge — Syncs bolt_games/bolt_outcomes → games/odds_snapshots
 * 
 * 1. Matches bolt_games to existing games by team names + date
 * 2. Writes latest bolt_outcomes as odds_snapshots for matched games
 * 3. Can also update game status from bolt data (game_removed → final)
 */

const TEAM_NORMALIZE: Record<string, string> = {
  // MLB
  "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS", "Chicago Cubs": "CHC", "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE", "Colorado Rockies": "COL",
  "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD", "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL", "Minnesota Twins": "MIN", "New York Mets": "NYM",
  "New York Yankees": "NYY", "Oakland Athletics": "OAK", "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT", "San Diego Padres": "SD", "San Francisco Giants": "SF",
  "Seattle Mariners": "SEA", "St. Louis Cardinals": "STL", "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX", "Toronto Blue Jays": "TOR", "Washington Nationals": "WSH",
  // NHL
  "Anaheim Ducks": "ANA", "Boston Bruins": "BOS", "Buffalo Sabres": "BUF",
  "Calgary Flames": "CGY", "Carolina Hurricanes": "CAR", "Chicago Blackhawks": "CHI",
  "Colorado Avalanche": "COL", "Columbus Blue Jackets": "CBJ", "Dallas Stars": "DAL",
  "Detroit Red Wings": "DET", "Edmonton Oilers": "EDM", "Florida Panthers": "FLA",
  "Los Angeles Kings": "LAK", "Minnesota Wild": "MIN", "Montreal Canadiens": "MTL",
  "Nashville Predators": "NSH", "New Jersey Devils": "NJD", "New York Islanders": "NYI",
  "New York Rangers": "NYR", "Ottawa Senators": "OTT", "Philadelphia Flyers": "PHI",
  "Pittsburgh Penguins": "PIT", "San Jose Sharks": "SJS", "Seattle Kraken": "SEA",
  "St. Louis Blues": "STL", "Tampa Bay Lightning": "TBL", "Toronto Maple Leafs": "TOR",
  "Utah Hockey Club": "UTA", "Vancouver Canucks": "VAN", "Vegas Golden Knights": "VGK",
  "Washington Capitals": "WSH", "Winnipeg Jets": "WPG",
};

function teamAbbr(fullName: string): string {
  return TEAM_NORMALIZE[fullName] || fullName.substring(0, 3).toUpperCase();
}

function americanToDecimal(american: number): number {
  if (american > 0) return (american / 100) + 1;
  return (100 / Math.abs(american)) + 1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get active bolt_games
    const { data: boltGames } = await sb.from("bolt_games")
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (!boltGames?.length) {
      return new Response(JSON.stringify({ ok: true, matched: 0, odds_written: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let matched = 0;
    let oddsWritten = 0;

    for (const bg of boltGames) {
      const homeAbbr = teamAbbr(bg.home_team || "");
      const awayAbbr = teamAbbr(bg.away_team || "");
      const sport = bg.sport || bg.league || "";
      const league = sport === "MLB" ? "MLB" : sport === "NHL" ? "NHL" : sport;

      // Extract date from bolt_game_id or start_time
      let gameDate: string | null = null;
      if (bg.start_time) {
        gameDate = bg.start_time.split(/[T ]/)[0];
      } else {
        // Try to extract from bolt_game_id format: "Team vs Team, YYYY-MM-DD, XX"
        const dateMatch = String(bg.bolt_game_id).match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) gameDate = dateMatch[1];
      }
      if (!gameDate || !homeAbbr || !awayAbbr) continue;

      // Match to internal game
      const { data: matchedGames } = await sb.from("games")
        .select("id, status, home_abbr, away_abbr")
        .eq("league", league)
        .eq("home_abbr", homeAbbr)
        .eq("away_abbr", awayAbbr)
        .gte("start_time", `${gameDate}T00:00:00Z`)
        .lte("start_time", `${gameDate}T23:59:59Z`)
        .limit(1);

      if (!matchedGames?.length) continue;
      const game = matchedGames[0];
      matched++;

      // Store bolt_game_id → game mapping in bolt_games.raw_data for reference
      await sb.from("bolt_games").update({
        raw_data: { ...((bg.raw_data as Record<string, unknown>) || {}), matched_game_id: game.id },
      }).eq("bolt_game_id", bg.bolt_game_id);

      // 2. Get latest outcomes for this bolt game
      const { data: outcomes } = await sb.from("bolt_outcomes")
        .select("*, bolt_markets!inner(bolt_game_id, market_name, market_key)")
        .eq("bolt_markets.bolt_game_id", bg.bolt_game_id)
        .eq("is_suspended", false)
        .order("updated_at", { ascending: false });

      if (!outcomes?.length) continue;

      // Group by market type and write odds_snapshots
      const mlOutcomes = outcomes.filter((o: any) => {
        const mkt = o.bolt_markets as any;
        return /moneyline/i.test(mkt?.market_name || mkt?.market_key || "");
      });
      const spreadOutcomes = outcomes.filter((o: any) => {
        const mkt = o.bolt_markets as any;
        return /spread/i.test(mkt?.market_name || mkt?.market_key || "");
      });
      const totalOutcomes = outcomes.filter((o: any) => {
        const mkt = o.bolt_markets as any;
        return /^total$/i.test(mkt?.market_name || "") || /^total$/i.test(mkt?.market_key || "");
      });

      // Helper to find home/away odds
      const findSide = (arr: any[], side: "home" | "away") => {
        const target = side === "home" ? bg.home_team : bg.away_team;
        return arr.find((o: any) => (o.outcome_name || "").includes(target));
      };

      const homeML = findSide(mlOutcomes, "home");
      const awayML = findSide(mlOutcomes, "away");
      const homeSpread = findSide(spreadOutcomes, "home");
      const awaySpread = findSide(spreadOutcomes, "away");

      // Write moneyline snapshot
      if (homeML?.american_odds != null || awayML?.american_odds != null) {
        await sb.from("odds_snapshots").upsert({
          game_id: game.id,
          market_type: "moneyline",
          source: "boltodds",
          sportsbook: homeML?.sportsbook || awayML?.sportsbook || "draftkings",
          home_price: homeML?.american_odds ?? null,
          away_price: awayML?.american_odds ?? null,
          home_line: null,
          away_line: null,
          captured_at: new Date().toISOString(),
        }, { onConflict: "game_id,market_type,source,sportsbook" });
        oddsWritten++;
      }

      // Write spread snapshot
      if (homeSpread?.american_odds != null) {
        await sb.from("odds_snapshots").upsert({
          game_id: game.id,
          market_type: "spread",
          source: "boltodds",
          sportsbook: homeSpread?.sportsbook || "draftkings",
          home_price: homeSpread?.american_odds ?? null,
          away_price: awaySpread?.american_odds ?? null,
          home_line: homeSpread?.line ?? null,
          away_line: awaySpread?.line ?? null,
          captured_at: new Date().toISOString(),
        }, { onConflict: "game_id,market_type,source,sportsbook" });
        oddsWritten++;
      }

      // Write total snapshot
      if (totalOutcomes.length > 0) {
        const over = totalOutcomes.find((o: any) => /over/i.test(o.outcome_name || ""));
        const under = totalOutcomes.find((o: any) => /under/i.test(o.outcome_name || ""));
        if (over || under) {
          await sb.from("odds_snapshots").upsert({
            game_id: game.id,
            market_type: "total",
            source: "boltodds",
            sportsbook: (over || under)?.sportsbook || "draftkings",
            home_price: over?.american_odds ?? null,
            away_price: under?.american_odds ?? null,
            home_line: over?.line ?? under?.line ?? null,
            away_line: under?.line ?? over?.line ?? null,
            captured_at: new Date().toISOString(),
          }, { onConflict: "game_id,market_type,source,sportsbook" });
          oddsWritten++;
        }
      }
    }

    // 3. Handle game_removed → mark internal game as final
    const { data: removedGames } = await sb.from("bolt_games")
      .select("bolt_game_id, raw_data")
      .eq("status", "removed");

    let finalized = 0;
    for (const rg of removedGames || []) {
      const matchedId = (rg.raw_data as any)?.matched_game_id;
      if (!matchedId) continue;
      const { data: g } = await sb.from("games")
        .select("id, status")
        .eq("id", matchedId)
        .maybeSingle();
      if (g && g.status !== "final") {
        await sb.from("games").update({ status: "final", updated_at: new Date().toISOString() }).eq("id", g.id);
        finalized++;
      }
    }

    return new Response(JSON.stringify({
      ok: true, bolt_games: boltGames.length, matched, odds_written: oddsWritten, finalized,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("bolt-odds-bridge error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
