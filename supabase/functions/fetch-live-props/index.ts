// fetch-live-props — Player props for LIVE games only (3-min cadence)
// Self-gating: checks for live games first, skips if none are active
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SGO_BASE = "https://api.sportsgameodds.com/v2";
const ALL_LEAGUES = ["NBA", "NFL", "MLB", "NHL"];

const MARKET_LABELS: Record<string, string> = {
  player_points: "Points", player_rebounds: "Rebounds", player_assists: "Assists",
  player_threes: "3-Pointers", player_blocks: "Blocks", player_steals: "Steals",
  player_turnovers: "Turnovers", player_points_rebounds_assists: "Pts+Reb+Ast",
  player_points_rebounds: "Pts+Reb", player_points_assists: "Pts+Ast",
  player_rebounds_assists: "Reb+Ast", player_double_double: "Double-Double",
  player_triple_double: "Triple-Double", player_field_goals: "Field Goals",
  player_goals: "Goals", player_shots_on_goal: "Shots on Goal", player_total_saves: "Saves",
  player_power_play_points: "PP Points", player_goal_scorer_anytime: "Anytime Goal",
  batter_home_runs: "Home Runs", batter_hits: "Hits", batter_total_bases: "Total Bases",
  batter_rbis: "RBIs", batter_runs_scored: "Runs Scored",
  pitcher_strikeouts: "Strikeouts (P)",
  player_pass_yds: "Pass Yards", player_pass_tds: "Pass TDs",
  player_rush_yds: "Rush Yards", player_receptions: "Receptions",
  player_reception_yds: "Rec Yards", player_anytime_td: "Anytime TD",
};

function sgoStatToMarketKey(statID: string): string {
  const map: Record<string, string> = {
    points: "player_points", rebounds: "player_rebounds", assists: "player_assists",
    threePointersMade: "player_threes", blocks: "player_blocks", steals: "player_steals",
    turnovers: "player_turnovers", doubleDouble: "player_double_double",
    tripleDouble: "player_triple_double", fieldGoalsMade: "player_field_goals",
    goals: "player_goals", shotsOnGoal: "player_shots_on_goal", saves: "player_total_saves",
    powerPlayPoints: "player_power_play_points", anytimeGoalScorer: "player_goal_scorer_anytime",
    homeRuns: "batter_home_runs", hits: "batter_hits", totalBases: "batter_total_bases",
    rbis: "batter_rbis", runsScored: "batter_runs_scored", strikeouts: "pitcher_strikeouts",
    passingYards: "player_pass_yds", passingTouchdowns: "player_pass_tds",
    rushingYards: "player_rush_yds", receptions: "player_receptions",
    receivingYards: "player_reception_yds", anytimeTouchdown: "player_anytime_td",
    pointsReboundsAssists: "player_points_rebounds_assists",
    pointsRebounds: "player_points_rebounds", pointsAssists: "player_points_assists",
    reboundsAssists: "player_rebounds_assists",
  };
  return map[statID] || statID;
}

function formatPlayerName(playerId: string): string {
  if (!playerId) return "Unknown";
  const parts = playerId.split("_");
  const cleaned = parts.filter(p => p.length > 1 || parts.length <= 2);
  const nameParts = cleaned.length > 2 ? cleaned.slice(0, -2) : cleaned;
  return nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

const TEAM_ABBR_MAP: Record<string, string> = {
  "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
  "Los Angeles Clippers": "LAC", "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA", "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP", "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR", "Utah Jazz": "UTA", "Washington Wizards": "WAS",
};

function makeAbbr(name: string): string {
  return TEAM_ABBR_MAP[name] || name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3);
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SPORTSGAMEODDS_API_KEY");
    if (!apiKey) throw new Error("SPORTSGAMEODDS_API_KEY not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Step 1: Check for live games in DB
    const { data: liveGames, error: lgErr } = await supabase
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, league, external_id")
      .in("status", ["live", "in_progress"])
      .in("league", ALL_LEAGUES);

    if (lgErr) throw lgErr;

    if (!liveGames || liveGames.length === 0) {
      console.log("[LiveProps] No live games — skipping");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_live_games", live_games: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const activeLeagues = [...new Set(liveGames.map(g => g.league))];
    console.log(`[LiveProps] ${liveGames.length} live games across ${activeLeagues.join(", ")}`);

    let totalProps = 0;
    let totalHistory = 0;

    // Step 2: For each active league, fetch live events from SGO
    for (const league of activeLeagues) {
      const leagueGames = liveGames.filter(g => g.league === league);

      const params = new URLSearchParams({
        apiKey,
        leagueID: league,
        oddsAvailable: "true",
        started: "true",
        type: "match",
        limit: "50",
      });

      const resp = await fetch(`${SGO_BASE}/events/?${params}`);
      if (resp.status === 429) {
        console.warn(`[LiveProps] Rate limited for ${league}, skipping`);
        await resp.text();
        continue;
      }
      if (!resp.ok) {
        const body = await resp.text();
        console.warn(`[LiveProps] SGO ${resp.status} for ${league}: ${body.slice(0, 200)}`);
        continue;
      }

      const json = await resp.json();
      const events = json.data || [];
      if (json.notice) console.warn(`[LiveProps] Notice: ${json.notice}`);
      console.log(`[LiveProps] ${league}: ${events.length} live SGO events`);

      for (const event of events) {
        // Match to DB game
        const homeAbbr = event.teams?.home?.names?.short || makeAbbr(event.teams?.home?.names?.long || "");
        const awayAbbr = event.teams?.away?.names?.short || makeAbbr(event.teams?.away?.names?.long || "");

        const matchedGame = leagueGames.find(g =>
          g.home_abbr.toUpperCase() === homeAbbr.toUpperCase() &&
          g.away_abbr.toUpperCase() === awayAbbr.toUpperCase()
        ) || leagueGames.find(g =>
          g.home_abbr.toUpperCase() === homeAbbr.toUpperCase() ||
          g.away_abbr.toUpperCase() === awayAbbr.toUpperCase()
        );

        if (!matchedGame) continue;

        // Extract player props from odds
        const odds = event.odds || {};
        const players = event.players || {};
        const propRows: any[] = [];
        const grouped = new Map<string, { over?: any; under?: any; statID: string; playerName: string; bookmaker: string }>();

        for (const [oddID, oddData] of Object.entries(odds) as [string, any][]) {
          const statEntityID = oddData.statEntityID || "all";
          const statID = oddData.statID || "";
          const isPlayerProp = statEntityID !== "all" && statEntityID !== "home" && statEntityID !== "away";
          if (!isPlayerProp) continue;

          const playerKey = oddData.playerID || statEntityID;
          let playerName = "Unknown";
          if (players[playerKey]?.name) playerName = players[playerKey].name;
          else if (players[playerKey]?.firstName && players[playerKey]?.lastName) playerName = `${players[playerKey].firstName} ${players[playerKey].lastName}`;
          else playerName = formatPlayerName(statEntityID);

          const sideID = oddData.sideID || "";
          const isOver = sideID === "over" || oddID.includes("-over");
          const isUnder = sideID === "under" || oddID.includes("-under");

          // Consensus
          const gk = `${statEntityID}|${statID}|consensus`;
          if (!grouped.has(gk)) grouped.set(gk, { statID, playerName, bookmaker: "sgo_consensus" });
          const entry = grouped.get(gk)!;
          if (isOver) entry.over = oddData;
          else if (isUnder) entry.under = oddData;

          // Per-bookmaker
          if (oddData.byBookmaker) {
            for (const [bkId, bkData] of Object.entries(oddData.byBookmaker) as [string, any][]) {
              const bk = `${statEntityID}|${statID}|${bkId}`;
              if (!grouped.has(bk)) grouped.set(bk, { statID, playerName, bookmaker: `sgo_${bkId}` });
              const bkEntry = grouped.get(bk)!;
              if (isOver) bkEntry.over = bkData;
              else if (isUnder) bkEntry.under = bkData;
            }
          }
        }

        for (const [, g] of grouped) {
          const marketKey = sgoStatToMarketKey(g.statID);
          const line = g.over?.overUnder ?? g.over?.spread ?? g.under?.overUnder ?? g.under?.spread ?? null;
          const overPrice = g.over?.odds != null ? Math.round(Number(g.over.odds)) : null;
          const underPrice = g.under?.odds != null ? Math.round(Number(g.under.odds)) : null;

          if (overPrice != null || underPrice != null || line != null) {
            propRows.push({
              game_id: matchedGame.id,
              external_event_id: event.eventID,
              player_name: g.playerName,
              market_key: marketKey,
              market_label: MARKET_LABELS[marketKey] || marketKey,
              bookmaker: g.bookmaker,
              line: line != null ? Number(line) : null,
              over_price: overPrice,
              under_price: underPrice,
            });
          }
        }

        if (propRows.length === 0) continue;
        console.log(`[LiveProps] ${matchedGame.home_abbr} vs ${matchedGame.away_abbr}: ${propRows.length} live props`);

        // Upsert into player_props (replace existing for this game)
        await supabase.from("player_props").delete().eq("game_id", matchedGame.id);
        for (let i = 0; i < propRows.length; i += 100) {
          const chunk = propRows.slice(i, i + 100);
          const { error } = await supabase.from("player_props").insert(chunk);
          if (error) console.error("Insert error:", error.message);
        }
        totalProps += propRows.length;

        // Also write to sgo_market_odds for the SGOPlayerPropsAnalyzer
        const sgoRows: any[] = [];
        for (const p of propRows) {
          if (p.over_price != null) {
            sgoRows.push({
              game_id: p.game_id, event_id: p.external_event_id, league: matchedGame.league,
              odd_id: `${p.market_key}-${p.player_name}-over`.replace(/\s+/g, "_").toLowerCase(),
              bet_type: "over_under", side: "over", period: "full",
              stat_entity_id: p.player_name?.replace(/\s+/g, "_").toLowerCase() || "unknown",
              stat_id: p.market_key?.replace("player_", "") || null,
              player_name: p.player_name, is_player_prop: true, is_alternate: false,
              bookmaker: p.bookmaker, odds: p.over_price, line: p.line,
              available: true, last_updated_at: new Date().toISOString(),
              captured_at: new Date().toISOString(),
            });
          }
          if (p.under_price != null) {
            sgoRows.push({
              game_id: p.game_id, event_id: p.external_event_id, league: matchedGame.league,
              odd_id: `${p.market_key}-${p.player_name}-under`.replace(/\s+/g, "_").toLowerCase(),
              bet_type: "over_under", side: "under", period: "full",
              stat_entity_id: p.player_name?.replace(/\s+/g, "_").toLowerCase() || "unknown",
              stat_id: p.market_key?.replace("player_", "") || null,
              player_name: p.player_name, is_player_prop: true, is_alternate: false,
              bookmaker: p.bookmaker, odds: p.under_price, line: p.line,
              available: true, last_updated_at: new Date().toISOString(),
              captured_at: new Date().toISOString(),
            });
          }
        }
        for (let i = 0; i < sgoRows.length; i += 100) {
          const chunk = sgoRows.slice(i, i + 100);
          const { error } = await supabase.from("sgo_market_odds").upsert(chunk, {
            onConflict: "game_id,odd_id,bookmaker", ignoreDuplicates: false,
          });
          if (error) console.error("sgo_market_odds upsert error:", error.message);
        }
        console.log(`[LiveProps] Wrote ${sgoRows.length} sgo_market_odds rows for ${matchedGame.home_abbr} vs ${matchedGame.away_abbr}`);

        // Snapshot into odds history
        const snapshotMinute = new Date(); snapshotMinute.setSeconds(0, 0);
        const historyRows: any[] = [];
        for (const p of propRows) {
          if (p.over_price != null) {
            historyRows.push({
              game_id: p.game_id, player_id: null, prop_type: p.market_key,
              book: p.bookmaker, line: p.line, side: "over", odds: p.over_price,
              snapshot_ts: new Date().toISOString(), snapshot_minute: snapshotMinute.toISOString(),
              source: "fetch-live-props",
            });
          }
          if (p.under_price != null) {
            historyRows.push({
              game_id: p.game_id, player_id: null, prop_type: p.market_key,
              book: p.bookmaker, line: p.line, side: "under", odds: p.under_price,
              snapshot_ts: new Date().toISOString(), snapshot_minute: snapshotMinute.toISOString(),
              source: "fetch-live-props",
            });
          }
        }
        for (let i = 0; i < historyRows.length; i += 100) {
          const chunk = historyRows.slice(i, i + 100);
          const { error } = await supabase.from("np_player_prop_odds_history").insert(chunk);
          if (error && !error.message?.includes("duplicate")) console.error("History error:", error.message);
        }
        totalHistory += historyRows.length;
      }

      await delay(300); // Small gap between leagues
    }

    return new Response(
      JSON.stringify({
        success: true, live_games: liveGames.length, active_leagues: activeLeagues,
        props_stored: totalProps, history_rows: totalHistory, fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("fetch-live-props error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
