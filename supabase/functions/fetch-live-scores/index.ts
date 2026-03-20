import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { CANONICAL } from "../_shared/team-mappings.ts";

/* ══════════════════════════════════════════════════════════
   TheSportsDB V2 Live Scores - with explicit error handling
   ══════════════════════════════════════════════════════════ */

// NBA/NFL use dedicated pipelines (BDL, etc.) — only NHL & MLB here
const SPORT_MAP: Record<string, string> = {
  NHL: "icehockey",
  MLB: "baseball",
};

const LEAGUE_IDS: Record<string, string> = {
  NHL: "4380",
  MLB: "4424",
};

const BDL_BASE = "https://api.balldontlie.io";
const BDL_PATH: Record<string, string> = {
  NHL: "nhl",
  MLB: "mlb",
};

const BDL_ABBR_NORMALIZE: Record<string, Record<string, string>> = {
  NHL: { NJ: "NJD", TB: "TBL", LA: "LAK", SJ: "SJS", VEG: "VGK", WAS: "WSH", MON: "MTL", UM: "UTA" },
  MLB: { CWS: "CHW", SD: "SDP", SF: "SFG", TB: "TBR", WSH: "WSN", WAS: "WSN", KC: "KCR" },
};

interface ScoreUpdate {
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  quarter: number | null;
  clock: string | null;
  homeTeam: string;
  awayTeam: string;
  idEvent: string;
  quarterScores: { quarter: number; home: number; away: number }[];
}

function getAbbr(league: string, teamName: string): string | null {
  const dict = CANONICAL[league];
  if (!dict) return null;
  return dict[teamName] || null;
}

function mapTsdbStatus(strStatus: string | null, strProgress: string | null): string {
  if (!strStatus) return "scheduled";
  const s = strStatus.toLowerCase();
  if (["match on", "in progress", "live"].some(v => s.includes(v))) return "live";
  // Quarter/Period indicators mean game is live
  if (/^q\d/i.test(strStatus) || /^p\d/i.test(strStatus)) return "live";
  if (s === "ht") return "live"; // halftime
  if (s === "ft" || s === "aot" || s === "ap" || s === "aet" || s === "finished") return "final";
  if (s === "ns" || s === "not started") return "scheduled";
  if (s === "postponed" || s === "cancelled" || s === "suspended") return "postponed";
  if (strProgress && strProgress !== "0'" && strProgress !== "") return "live";
  return "scheduled";
}

function parseQuarter(strProgress: string | null, strStatus: string | null): number | null {
  const candidates = [strStatus || "", strProgress || ""];
  for (const raw of candidates) {
    const upper = raw.toUpperCase();
    if (!upper) continue;
    const m = upper.match(/(?:Q|P|IN|I)(\d{1,2})/);
    if (m) return parseInt(m[1], 10);
    if (upper === "HT") return 2;
  }
  return null;
}

function normalizeBdlAbbr(league: string, abbr: string): string {
  const raw = (abbr || "").trim().toUpperCase();
  return BDL_ABBR_NORMALIZE[league]?.[raw] || raw;
}

function mapBdlStatus(statusRaw: string | null): string {
  const s = (statusRaw || "").toLowerCase();
  if (!s) return "scheduled";
  if (s === "final" || s.startsWith("final") || s === "f" || s === "f/ot" || s === "f/so") return "final";
  if (s.includes("progress") || s.includes("live") || /^q\d/.test(s) || /^p\d/.test(s) || /^in\d/.test(s)) return "in_progress";
  return "scheduled";
}

async function fetchBdlScoresForLeague(
  bdlKey: string | null,
  league: string,
  dates: string[],
): Promise<ScoreUpdate[]> {
  const path = BDL_PATH[league];
  if (!bdlKey || !path || dates.length === 0) return [];

  const dateParams = dates.map((d) => `dates[]=${encodeURIComponent(d)}`).join("&");
  const url = `${BDL_BASE}/${path}/v1/games?${dateParams}&per_page=100`;

  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${bdlKey}`,
        "X-Api-Key": bdlKey,
      },
    });
    if (!resp.ok) {
      console.warn(`[fetch-live-scores] BDL ${league} fallback failed: ${resp.status}`);
      return [];
    }

    const json = await resp.json();
    const games = json?.data || [];

    return games.map((g: any) => {
      const homeScore = g.home_team_score ?? g.home_score ?? null;
      const awayScore = g.visitor_team_score ?? g.visitor_score ?? g.away_team_score ?? null;
      const homeTeam = g.home_team?.full_name || g.home_team?.name || "";
      const awayTeam = g.visitor_team?.full_name || g.visitor_team?.name || "";
      const quarterRaw = g.period ?? g.current_period ?? null;
      const quarter = quarterRaw != null ? Number(quarterRaw) : null;
      const clock = g.time ?? g.clock ?? g.status || null;

      return {
        homeScore: Number.isFinite(Number(homeScore)) ? Number(homeScore) : null,
        awayScore: Number.isFinite(Number(awayScore)) ? Number(awayScore) : null,
        status: mapBdlStatus(g.status || null),
        quarter: Number.isFinite(quarter) ? quarter : null,
        clock,
        homeTeam,
        awayTeam,
        idEvent: String(g.id || ""),
        quarterScores: [],
      } as ScoreUpdate;
    });
  } catch (e: any) {
    console.warn(`[fetch-live-scores] BDL ${league} fallback error: ${e?.message || e}`);
    return [];
  }
}

async function fetchLiveScoresForLeague(
  apiKey: string,
  league: string,
): Promise<ScoreUpdate[]> {
  const sport = SPORT_MAP[league];
  if (!sport) return [];
  
  const url = `https://www.thesportsdb.com/api/v2/json/livescore/${sport}`;
  console.log(`[fetch-live-scores] Fetching ${league} from ${url}`);
  
  const resp = await fetch(url, {
    headers: { "X-API-KEY": apiKey },
  });
  
  if (!resp.ok) {
    const body = await resp.text();
    console.error(`[fetch-live-scores] API error ${resp.status}: ${body.slice(0, 200)}`);
    return [];
  }
  
  const data = await resp.json();
  // TheSportsDB v2 uses "livescore" (singular) as the key, not "livescores"
  const events = data?.livescore || data?.livescores?.events || data?.events || [];
  
  if (!Array.isArray(events)) {
    console.log(`[fetch-live-scores] No events array for ${league}, keys: ${Object.keys(data).join(",")}, type: ${typeof events}`);
    return [];
  }
  
  console.log(`[fetch-live-scores] ${league}: ${events.length} total events from API`);
  
  const leagueId = LEAGUE_IDS[league];
  const results: ScoreUpdate[] = [];
  
  for (const ev of events) {
    if (ev.idLeague && String(ev.idLeague) !== leagueId) continue;
    
    const homeScore = ev.intHomeScore != null ? parseInt(String(ev.intHomeScore)) : null;
    const awayScore = ev.intAwayScore != null ? parseInt(String(ev.intAwayScore)) : null;
    const status = mapTsdbStatus(ev.strStatus, ev.strProgress);
    const quarter = parseQuarter(ev.strProgress, ev.strStatus);
    
    // Extract quarter/period scores if available
    const quarterScores: { quarter: number; home: number; away: number }[] = [];
    for (let q = 1; q <= 8; q++) {
      const hKey = `intHomeScore${q}`;
      const aKey = `intAwayScore${q}`;
      if (ev[hKey] != null && ev[aKey] != null) {
        const h = parseInt(String(ev[hKey]));
        const a = parseInt(String(ev[aKey]));
        if (!isNaN(h) && !isNaN(a)) {
          quarterScores.push({ quarter: q, home: h, away: a });
        }
      }
    }
    
    results.push({
      homeScore,
      awayScore,
      status,
      quarter,
      clock: ev.strProgress || null,
      homeTeam: ev.strHomeTeam || "",
      awayTeam: ev.strAwayTeam || "",
      idEvent: ev.idEvent || "",
      quarterScores,
    });
  }
  
  console.log(`[fetch-live-scores] ${league}: ${results.length} matching league events`);
  if (results.length > 0) {
    const sample = results[0];
    console.log(`[fetch-live-scores] Sample: ${sample.homeTeam} ${sample.homeScore} vs ${sample.awayTeam} ${sample.awayScore} (${sample.status})`);
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
    const bdlKey = (Deno.env.get("BALLDONTLIE_KEY") || "").trim().replace(/^Bearer\s+/i, "") || null;
    if (!apiKey) {
      console.error("[fetch-live-scores] THESPORTSDB_API_KEY not set");
      return new Response(JSON.stringify({ error: "THESPORTSDB_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    console.log(`[fetch-live-scores] Connecting to ${sbUrl.slice(0, 35)}...`);
    
    const supabase = createClient(sbUrl, sbKey);

    const now = new Date();
    // Widen window to ±1 day to handle PST/UTC offset
    // e.g. a 7pm PST game = 3am UTC next day — using UTC-only date would miss it
    const yesterdayISO = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayISO = now.toISOString().slice(0, 10);
    const tomorrowISO = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Fetch games that are live OR scheduled within the ±1 day window
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id, external_id, status, home_team, away_team, home_abbr, away_abbr, league, start_time, home_score, away_score")
      .or(`status.eq.live,status.eq.in_progress,and(status.eq.scheduled,start_time.gte.${yesterdayISO}T00:00:00Z,start_time.lte.${tomorrowISO}T23:59:59Z)`);

    if (gamesError) {
      console.error(`[fetch-live-scores] Games query error: ${gamesError.message}`);
      throw new Error("Failed to fetch games: " + gamesError.message);
    }
    
    console.log(`[fetch-live-scores] Found ${games?.length || 0} games in DB for ${yesterdayISO} to ${tomorrowISO}`);
    
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
    let matchedCount = 0;
    let errorCount = 0;
    const leagueCounts: Record<string, number> = {};
    const errors: string[] = [];

    for (const [league, leagueGames] of Object.entries(byLeague)) {
      const liveScores = await fetchLiveScoresForLeague(apiKey, league);
      if (!liveScores.length) {
        console.log(`[fetch-live-scores] No live data for ${league}`);
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
        matchedCount++;

        // Only update if we have actual score data or status change
        if (match.homeScore == null && match.awayScore == null && match.status === "scheduled") {
          console.log(`[fetch-live-scores] Skipping ${game.home_abbr} vs ${game.away_abbr}: no data`);
          continue;
        }

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
          if (snapErr) {
            console.error(`[fetch-live-scores] Snapshot error ${game.id}: ${snapErr.message}`);
            errors.push(`snap:${game.home_abbr}:${snapErr.message}`);
          }
        }

        // Upsert quarter/period scores
        if (match.quarterScores.length > 0) {
          for (const qs of match.quarterScores) {
            const { error: qErr } = await supabase.from("game_quarters").upsert({
              game_id: game.id,
              quarter: qs.quarter,
              home_score: qs.home,
              away_score: qs.away,
            }, { onConflict: "game_id,quarter" });
            if (qErr) {
              console.error(`[fetch-live-scores] Quarter ${qs.quarter} error ${game.id}: ${qErr.message}`);
            }
          }
        }

        // Update games table
        const updateData: Record<string, any> = {};
        if (match.homeScore != null) updateData.home_score = match.homeScore;
        if (match.awayScore != null) updateData.away_score = match.awayScore;
        if (match.status === "live" || match.status === "final") updateData.status = match.status;

        if (Object.keys(updateData).length > 0) {
          console.log(`[fetch-live-scores] Writing ${game.home_abbr} vs ${game.away_abbr} (${game.id}): ${JSON.stringify(updateData)}`);
          
          const { data: updateResult, error: updateErr } = await supabase
            .from("games")
            .update(updateData)
            .eq("id", game.id)
            .select("id, home_score, away_score, status");
          
          if (updateErr) {
            console.error(`[fetch-live-scores] UPDATE FAILED ${game.id}: ${updateErr.message} (code: ${updateErr.code}, details: ${updateErr.details})`);
            errors.push(`update:${game.home_abbr}:${updateErr.message}`);
            errorCount++;
          } else {
            console.log(`[fetch-live-scores] ✓ Updated ${game.home_abbr} vs ${game.away_abbr}: ${JSON.stringify(updateResult)}`);
            updatedCount++;
            leagueCounts[league] = (leagueCounts[league] || 0) + 1;
          }
        } else {
          console.log(`[fetch-live-scores] No data to write for ${game.home_abbr} vs ${game.away_abbr}`);
        }
      }
    }

    const result = {
      message: "Live scores updated via TheSportsDB",
      updated: updatedCount,
      matched: matchedCount,
      errors: errorCount,
      error_details: errors.length > 0 ? errors : undefined,
      by_league: leagueCounts,
    };
    
    console.log(`[fetch-live-scores] Complete: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[fetch-live-scores] Fatal error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
