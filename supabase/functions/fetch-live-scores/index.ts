import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { CANONICAL } from "../_shared/team-mappings.ts";

/* ══════════════════════════════════════════════════════════
   TheSportsDB V2 Live Scores
   ══════════════════════════════════════════════════════════ */

const SPORT_MAP: Record<string, string> = {
  NBA: "basketball",
  NFL: "americanfootball",
  NHL: "icehockey",
  MLB: "baseball",
};

const LEAGUE_IDS: Record<string, string> = {
  NBA: "4387",
  NFL: "4391",
  NHL: "4380",
  MLB: "4424",
};

interface ScoreUpdate {
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  quarter: string | null;
  clock: string | null;
  homeTeam: string;
  awayTeam: string;
  idEvent: string;
}

function getAbbr(league: string, teamName: string): string | null {
  const dict = CANONICAL[league];
  if (!dict) return null;
  return dict[teamName] || null;
}

function mapTsdbStatus(strStatus: string | null, strProgress: string | null): string {
  if (!strStatus) return "scheduled";
  const s = strStatus.toLowerCase();
  // Match is ongoing if strProgress has time/period info
  if (["match on", "in progress", "live"].some(v => s.includes(v))) return "live";
  if (s === "ft" || s === "aot" || s === "ap" || s === "aet" || s === "finished") return "final";
  if (s === "ns" || s === "not started") return "scheduled";
  if (s === "postponed" || s === "cancelled" || s === "suspended") return "postponed";
  // If there's a progress indicator with time, it's likely live
  if (strProgress && strProgress !== "0'" && strProgress !== "") return "live";
  return "scheduled";
}

function parseQuarter(strProgress: string | null, strStatus: string | null, league: string): string | null {
  if (!strProgress && !strStatus) return null;
  
  const prog = strProgress || "";
  const status = strStatus || "";
  
  // NBA: "Q1", "Q2", "Q3", "Q4", "OT", "2OT"
  // NHL: "P1", "P2", "P3", "OT"
  // NFL: "Q1", "Q2", "Q3", "Q4", "OT"
  // MLB: "Top 1st", "Bot 3rd", etc.
  
  if (status === "FT" || status === "AOT" || status === "AP") {
    return league === "NHL" ? "Final" : league === "MLB" ? "Final" : "Final";
  }
  
  // Check for explicit quarter/period indicators
  const qMatch = prog.match(/(\d+)(?:st|nd|rd|th)?\s*(Q|Quarter|Period|Inning|Half)/i);
  if (qMatch) return qMatch[0];
  
  // If progress contains time like "12:34", extract it
  if (/^\d+[':]/.test(prog)) return prog;
  
  return prog || null;
}

async function fetchLiveScoresForLeague(
  apiKey: string,
  league: string,
): Promise<ScoreUpdate[]> {
  const sport = SPORT_MAP[league];
  if (!sport) return [];
  
  const url = `https://www.thesportsdb.com/api/v2/json/livescore/${sport}`;
  console.log(`Fetching live scores for ${league} (${sport})`);
  
  const resp = await fetch(url, {
    headers: { "X-API-KEY": apiKey },
  });
  
  if (!resp.ok) {
    const body = await resp.text();
    console.error(`TheSportsDB livescore ${league} error ${resp.status}: ${body.slice(0, 200)}`);
    return [];
  }
  
  const data = await resp.json();
  const events = data?.livescores?.events || data?.events || data?.livescore || [];
  
  if (!Array.isArray(events)) {
    // Sometimes it comes as an object
    console.log(`No live events for ${league}, type: ${typeof events}`);
    return [];
  }
  
  const leagueId = LEAGUE_IDS[league];
  const results: ScoreUpdate[] = [];
  
  for (const ev of events) {
    // Filter to our league
    if (ev.idLeague && String(ev.idLeague) !== leagueId) continue;
    
    const homeScore = ev.intHomeScore != null ? parseInt(ev.intHomeScore) : null;
    const awayScore = ev.intAwayScore != null ? parseInt(ev.intAwayScore) : null;
    const status = mapTsdbStatus(ev.strStatus, ev.strProgress);
    const quarter = parseQuarter(ev.strProgress, ev.strStatus, league);
    
    results.push({
      homeScore,
      awayScore,
      status,
      quarter,
      clock: ev.strProgress || null,
      homeTeam: ev.strHomeTeam || "",
      awayTeam: ev.strAwayTeam || "",
      idEvent: ev.idEvent || "",
    });
  }
  
  return results;
}

/* ══════════════════════════════════════════════════════════
   MAIN HANDLER
   ══════════════════════════════════════════════════════════ */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("THESPORTSDB_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "THESPORTSDB_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const todayISO = now.toISOString().slice(0, 10);

    // Fetch games that are live or scheduled for today
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id, external_id, status, home_team, away_team, home_abbr, away_abbr, league, start_time")
      .or(`status.eq.live,and(status.eq.scheduled,start_time.gte.${todayISO}T00:00:00Z,start_time.lte.${todayISO}T23:59:59Z)`);

    if (gamesError) throw new Error("Failed to fetch games: " + gamesError.message);
    if (!games?.length) {
      return new Response(JSON.stringify({ message: "No active games to update", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group games by league
    const byLeague: Record<string, typeof games> = {};
    for (const g of games) {
      (byLeague[g.league] ??= []).push(g);
    }

    let updatedCount = 0;
    const leagueCounts: Record<string, number> = {};

    for (const [league, leagueGames] of Object.entries(byLeague)) {
      const liveScores = await fetchLiveScoresForLeague(apiKey, league);
      if (!liveScores.length) {
        console.log(`No live data for ${league}`);
        continue;
      }

      for (const game of leagueGames) {
        // Match by team abbreviation/name
        const match = liveScores.find((ls) => {
          const homeAbbr = getAbbr(league, ls.homeTeam);
          const awayAbbr = getAbbr(league, ls.awayTeam);
          return (
            (homeAbbr === game.home_abbr && awayAbbr === game.away_abbr) ||
            (ls.homeTeam === game.home_team && ls.awayTeam === game.away_team) ||
            (game.external_id && game.external_id === `tsdb_${ls.idEvent}`)
          );
        });

        if (!match) continue;
        // Only update if we have actual score data or status change
        if (match.homeScore == null && match.awayScore == null && match.status === "scheduled") continue;

        // Upsert snapshot for live tracking
        if (match.status === "live" || match.status === "final") {
          const { error: snapErr } = await supabase.from("game_state_snapshots").insert({
            game_id: game.id,
            status: match.status,
            home_score: match.homeScore,
            away_score: match.awayScore,
            quarter: match.quarter,
            clock: match.clock,
          });
          if (snapErr) console.error(`Snapshot insert error for ${game.id}: ${snapErr.message}`);
        }

        // Update games table
        const updateData: Record<string, any> = {};
        if (match.homeScore != null) updateData.home_score = match.homeScore;
        if (match.awayScore != null) updateData.away_score = match.awayScore;
        if (match.status === "live" || match.status === "final") updateData.status = match.status;

        if (Object.keys(updateData).length > 0) {
          const { error: updateErr } = await supabase.from("games").update(updateData).eq("id", game.id);
          if (updateErr) console.error(`Game update error for ${game.id}: ${updateErr.message}`);
          else console.log(`Updated ${game.home_abbr} vs ${game.away_abbr}: ${JSON.stringify(updateData)}`);
        }

        updatedCount++;
        leagueCounts[league] = (leagueCounts[league] || 0) + 1;
      }
    }

    return new Response(JSON.stringify({
      message: "Live scores updated via TheSportsDB",
      updated: updatedCount,
      by_league: leagueCounts,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("fetch-live-scores error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
