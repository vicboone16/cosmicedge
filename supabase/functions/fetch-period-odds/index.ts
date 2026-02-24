// fetch-period-odds — Period-level markets from SGO (1Q, 1H, 2Q, 3Q, etc.)
// Stores into sgo_market_odds with period != 'full'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SGO_BASE = "https://api.sportsgameodds.com/v2";
const BATCH = 100;

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

function formatPlayerName(playerId: string): string {
  if (!playerId) return "Unknown";
  const parts = playerId.split("_");
  const cleaned = parts.filter(p => p.length > 1 || parts.length <= 2);
  const nameParts = cleaned.length > 2 ? cleaned.slice(0, -2) : cleaned;
  return nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SPORTSGAMEODDS_API_KEY");
    if (!apiKey) throw new Error("SPORTSGAMEODDS_API_KEY not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "NBA";

    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 3600000);
    const { data: dbGames } = await supabase
      .from("games").select("id, home_abbr, away_abbr, start_time")
      .eq("league", league)
      .in("status", ["scheduled", "live", "in_progress"])
      .gte("start_time", new Date(now.getTime() - 4 * 3600000).toISOString())
      .lte("start_time", horizon.toISOString())
      .limit(20);

    if (!dbGames?.length) {
      return new Response(
        JSON.stringify({ success: true, events: 0, period_odds: 0, reason: "no_games" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const params = new URLSearchParams({
      apiKey, leagueID: league, oddsAvailable: "true", type: "match", limit: "50",
    });
    const resp = await fetch(`${SGO_BASE}/events/?${params}`);
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`SGO ${resp.status}: ${body.slice(0, 200)}`);
    }

    const json = await resp.json();
    const events = json.data || [];
    if (json.notice) console.warn(`[PeriodOdds] Notice: ${json.notice}`);
    console.log(`[PeriodOdds] ${league}: ${events.length} SGO events`);

    let totalPeriodOdds = 0;

    for (const event of events) {
      const homeAbbr = event.teams?.home?.names?.short || makeAbbr(event.teams?.home?.names?.long || "");
      const awayAbbr = event.teams?.away?.names?.short || makeAbbr(event.teams?.away?.names?.long || "");

      const matched = dbGames.find((g: any) =>
        g.home_abbr.toUpperCase() === homeAbbr.toUpperCase() &&
        g.away_abbr.toUpperCase() === awayAbbr.toUpperCase()
      );
      if (!matched) continue;

      const odds = event.odds || {};
      const rows: any[] = [];

      for (const [oddID, oddData] of Object.entries(odds) as [string, any][]) {
        const periodID = oddData.periodID || "game";
        // Only period-level odds (not full game)
        if (!periodID || periodID === "game") continue;

        const statEntityID = oddData.statEntityID || "all";
        const sideID = oddData.sideID || "";
        const statID = oddData.statID || null;
        const betTypeID = oddData.betTypeID || "";
        const isPlayerProp = statEntityID !== "all" && statEntityID !== "home" && statEntityID !== "away";
        const playerName = isPlayerProp ? formatPlayerName(statEntityID) : null;
        const isAlternate = oddData.isMainLine === false || oddID.includes("alt");

        let betType = "unknown";
        if (betTypeID === "ml" || oddID.includes("-ml-")) betType = "ml";
        else if (betTypeID === "sp" || oddID.includes("-sp-")) betType = "sp";
        else if (betTypeID === "ou" || oddID.includes("-ou-")) betType = "ou";
        else betType = betTypeID || "unknown";

        const side = sideID || (oddID.includes("home") ? "home" : oddID.includes("away") ? "away" : oddID.includes("over") ? "over" : oddID.includes("under") ? "under" : "unknown");

        const consensusOdds = oddData.odds != null ? Math.round(Number(oddData.odds)) : null;
        const consensusLine = oddData.spread ?? oddData.overUnder ?? null;

        if (consensusOdds != null || consensusLine != null) {
          rows.push({
            game_id: matched.id, event_id: event.eventID, league, odd_id: oddID,
            bet_type: betType, side, period: periodID, stat_entity_id: statEntityID,
            stat_id: statID, player_name: playerName, is_player_prop: isPlayerProp,
            is_alternate: isAlternate, bookmaker: "consensus",
            odds: consensusOdds, line: consensusLine != null ? Number(consensusLine) : null,
            available: true, last_updated_at: oddData.lastUpdatedAt || null,
          });
        }

        if (oddData.byBookmaker) {
          for (const [bkId, bkData] of Object.entries(oddData.byBookmaker) as [string, any][]) {
            const bkOdds = bkData.odds != null ? Math.round(Number(bkData.odds)) : null;
            const bkLine = bkData.spread ?? bkData.overUnder ?? consensusLine;
            if (bkOdds != null || bkLine != null) {
              rows.push({
                game_id: matched.id, event_id: event.eventID, league, odd_id: oddID,
                bet_type: betType, side, period: periodID, stat_entity_id: statEntityID,
                stat_id: statID, player_name: playerName, is_player_prop: isPlayerProp,
                is_alternate: isAlternate, bookmaker: bkId,
                odds: bkOdds, line: bkLine != null ? Number(bkLine) : null,
                available: bkData.available !== false, last_updated_at: bkData.lastUpdatedAt || null,
              });
            }
          }
        }
      }

      if (rows.length > 0) {
        console.log(`[PeriodOdds] ${matched.home_abbr} vs ${matched.away_abbr}: ${rows.length} period odds`);
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH);
          const { error } = await supabase.from("sgo_market_odds").upsert(chunk, {
            onConflict: "game_id,odd_id,bookmaker", ignoreDuplicates: false,
          });
          if (error) console.error("Period odds upsert error:", error.message);
        }
        totalPeriodOdds += rows.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, league, events: events.length, period_odds_stored: totalPeriodOdds, fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("fetch-period-odds error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
