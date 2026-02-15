import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ══════════════════════════════════════════════════════════
   LEAGUE-SPECIFIC SCORE FETCHERS (SportsData.io)
   ══════════════════════════════════════════════════════════ */

interface ScoreUpdate {
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  quarter: string | null;
  clock: string | null;
}

function mapSdioStatus(status: string): string {
  const s = status?.toLowerCase() || "";
  if (["inprogress", "in progress"].includes(s)) return "live";
  if (["final", "f/ot", "closed", "complete"].includes(s)) return "final";
  if (["scheduled", "pregame", "created"].includes(s)) return "scheduled";
  if (["postponed", "suspended", "canceled", "cancelled"].includes(s)) return "postponed";
  return "scheduled";
}

async function fetchNBABoxScore(externalId: string, apiKey: string): Promise<ScoreUpdate | null> {
  const url = `https://api.sportsdata.io/v3/nba/scores/json/BoxScore/${externalId}?key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) { await resp.text(); return null; }
  const box = await resp.json();
  const g = box?.Game;
  if (!g) return null;
  return {
    homeScore: g.HomeTeamScore ?? null,
    awayScore: g.AwayTeamScore ?? null,
    status: mapSdioStatus(g.Status),
    quarter: g.Quarter ? String(g.Quarter) : null,
    clock: g.TimeRemainingMinutes != null && g.TimeRemainingSeconds != null
      ? `${g.TimeRemainingMinutes}:${String(g.TimeRemainingSeconds).padStart(2, "0")}` : null,
  };
}

async function fetchNHLBoxScore(externalId: string, apiKey: string): Promise<ScoreUpdate | null> {
  const url = `https://api.sportsdata.io/v3/nhl/scores/json/BoxScore/${externalId}?key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) { await resp.text(); return null; }
  const box = await resp.json();
  const g = box?.Game;
  if (!g) return null;
  return {
    homeScore: g.HomeTeamScore ?? null,
    awayScore: g.AwayTeamScore ?? null,
    status: mapSdioStatus(g.Status),
    quarter: g.Period ? `P${g.Period}` : null,
    clock: g.TimeRemainingMinutes != null && g.TimeRemainingSeconds != null
      ? `${g.TimeRemainingMinutes}:${String(g.TimeRemainingSeconds).padStart(2, "0")}` : null,
  };
}

async function fetchNFLBoxScore(externalId: string, apiKey: string): Promise<ScoreUpdate | null> {
  const url = `https://api.sportsdata.io/v3/nfl/scores/json/BoxScoreByScoreIDV3/${externalId}?key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) { await resp.text(); return null; }
  const box = await resp.json();
  const g = box?.Score;
  if (!g) return null;
  return {
    homeScore: g.HomeScore ?? null,
    awayScore: g.AwayScore ?? null,
    status: mapSdioStatus(g.Status),
    quarter: g.Quarter ? `Q${g.Quarter}` : null,
    clock: g.TimeRemaining || null,
  };
}

async function fetchMLBBoxScore(externalId: string, apiKey: string): Promise<ScoreUpdate | null> {
  const url = `https://api.sportsdata.io/v3/mlb/scores/json/BoxScore/${externalId}?key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) { await resp.text(); return null; }
  const box = await resp.json();
  const g = box?.Game;
  if (!g) return null;
  return {
    homeScore: g.HomeTeamRuns ?? null,
    awayScore: g.AwayTeamRuns ?? null,
    status: mapSdioStatus(g.Status),
    quarter: g.Inning ? `${g.Inning}` : null,
    clock: g.InningHalf || null,
  };
}

function getLeagueFetcher(league: string): (id: string, key: string) => Promise<ScoreUpdate | null> {
  switch (league) {
    case "NHL": return fetchNHLBoxScore;
    case "NFL": return fetchNFLBoxScore;
    case "MLB": return fetchMLBBoxScore;
    default: return fetchNBABoxScore;
  }
}

/* ══════════════════════════════════════════════════════════
   SGO FALLBACK
   ══════════════════════════════════════════════════════════ */

async function fetchSGOFallback(gameId: string, sgoKey: string): Promise<ScoreUpdate | null> {
  if (!sgoKey) return null;
  try {
    const url = `https://api.sportsgameodds.com/v2/events/${gameId}?apiKey=${sgoKey}`;
    const resp = await fetch(url);
    if (!resp.ok) { await resp.text(); return null; }
    const data = await resp.json();
    const event = data?.event;
    if (!event) return null;
    const scores = event.scores;
    if (!scores) return null;
    return {
      homeScore: scores.home?.total ?? null,
      awayScore: scores.away?.total ?? null,
      status: event.status === "in_progress" ? "live" : event.status === "final" ? "final" : "scheduled",
      quarter: scores.period ? String(scores.period) : null,
      clock: scores.clock || null,
    };
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════
   MAIN HANDLER
   ══════════════════════════════════════════════════════════ */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sportsDataKey = Deno.env.get("SPORTSDATAIO_API_KEY");
    const sgoKey = Deno.env.get("SPORTSGAMEODDS_API_KEY") || "";

    if (!sportsDataKey && !sgoKey) {
      return new Response(JSON.stringify({ error: "No score API keys configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const todayISO = now.toISOString().slice(0, 10);

    // Fetch games that are live or scheduled for today across ALL leagues
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id, external_id, status, home_team, away_team, league")
      .or(`status.eq.live,and(status.eq.scheduled,start_time.gte.${todayISO}T00:00:00Z,start_time.lte.${todayISO}T23:59:59Z)`)
      .not("external_id", "is", null);

    if (gamesError) {
      throw new Error("Failed to fetch games: " + gamesError.message);
    }

    if (!games || games.length === 0) {
      return new Response(JSON.stringify({ message: "No active games to update", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updatedCount = 0;
    const leagueCounts: Record<string, number> = {};

    for (const game of games) {
      try {
        let scoreUpdate: ScoreUpdate | null = null;

        // Try SportsData.io first (league-specific)
        if (sportsDataKey) {
          const fetcher = getLeagueFetcher(game.league);
          scoreUpdate = await fetcher(game.external_id!, sportsDataKey);
        }

        // Fallback to SGO if SportsData.io failed
        if (!scoreUpdate && sgoKey) {
          scoreUpdate = await fetchSGOFallback(game.external_id!, sgoKey);
        }

        if (!scoreUpdate) {
          console.error(`No score data for game ${game.external_id} (${game.league})`);
          continue;
        }

        // Upsert snapshot
        await supabase.from("game_state_snapshots").insert({
          game_id: game.id,
          status: scoreUpdate.status,
          home_score: scoreUpdate.homeScore,
          away_score: scoreUpdate.awayScore,
          quarter: scoreUpdate.quarter,
          clock: scoreUpdate.clock,
        });

        // Update games table
        await supabase
          .from("games")
          .update({
            home_score: scoreUpdate.homeScore,
            away_score: scoreUpdate.awayScore,
            status: scoreUpdate.status,
          })
          .eq("id", game.id);

        updatedCount++;
        leagueCounts[game.league] = (leagueCounts[game.league] || 0) + 1;
      } catch (e) {
        console.error(`Error processing game ${game.external_id} (${game.league}):`, e);
      }
    }

    return new Response(JSON.stringify({
      message: "Live scores updated",
      updated: updatedCount,
      by_league: leagueCounts,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-live-scores error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
