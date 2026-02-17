import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { CANONICAL } from "../_shared/team-mappings.ts";

const BASE = "https://www.thesportsdb.com/api/v1/json";

const LEAGUE_IDS: Record<string, string> = {
  NBA: "4387",
  NFL: "4391",
  NHL: "4380",
  MLB: "4424",
};

const LEAGUE_SEARCH_NAMES: Record<string, string> = {
  NBA: "NBA",
  NFL: "NFL",
  NHL: "NHL",
  MLB: "MLB",
};

function getAbbr(league: string, teamName: string): string | null {
  const dict = CANONICAL[league];
  if (!dict) return null;
  return dict[teamName] || null;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiFetch(apiKey: string, endpoint: string) {
  const url = `${BASE}/${apiKey}/${endpoint}`;
  console.log(`Fetching: ${endpoint}`);
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

// ─── MODE: teams ────────────────────────────────────────────────────────────

async function syncTeams(
  apiKey: string,
  supabase: any,
  league: string,
) {
  const data = await apiFetch(apiKey, `search_all_teams.php?l=${LEAGUE_SEARCH_NAMES[league]}`);
  const teams = data.teams || [];
  
  let upserted = 0;
  const teamMap: Record<string, string> = {};
  
  for (const t of teams) {
    const name = t.strTeam;
    const abbr = getAbbr(league, name);
    if (!abbr) {
      console.warn(`No mapping for ${league} team: ${name}`);
      continue;
    }
    teamMap[t.idTeam] = abbr;
    upserted++;
  }
  
  return { teams_found: teams.length, mapped: upserted, team_map: teamMap };
}

// ─── MODE: rosters ──────────────────────────────────────────────────────────

async function syncRosters(
  apiKey: string,
  supabase: any,
  league: string,
) {
  const teamResult = await syncTeams(apiKey, supabase, league);
  const teamMap = teamResult.team_map;
  
  let playersUpserted = 0;
  let teamsProcessed = 0;
  
  for (const [idTeam, abbr] of Object.entries(teamMap)) {
    if (teamsProcessed > 0 && teamsProcessed % 5 === 0) {
      await delay(2000);
    }
    
    try {
      const data = await apiFetch(apiKey, `lookup_all_players.php?id=${idTeam}`);
      const players = data.player || [];
      
      for (const p of players) {
        const playerName = p.strPlayer;
        if (!playerName) continue;
        
        const record: Record<string, any> = {
          name: playerName,
          team: abbr,
          league,
          position: p.strPosition || null,
          headshot_url: p.strThumb || p.strCutout || null,
        };
        
        if (p.dateBorn && p.dateBorn !== "0000-00-00") {
          record.birth_date = p.dateBorn;
        }
        
        if (p.strBirthLocation) {
          record.birth_place = p.strBirthLocation;
        }
        
        const { data: existing } = await supabase
          .from("players")
          .select("id")
          .eq("name", playerName)
          .eq("league", league)
          .maybeSingle();
        
        if (existing) {
          await supabase
            .from("players")
            .update(record)
            .eq("id", existing.id);
        } else {
          const { error } = await supabase.from("players").insert(record);
          if (error && !error.message?.includes("duplicate")) {
            console.error(`Insert error for ${playerName}:`, error.message);
          }
        }
        playersUpserted++;
      }
      
      teamsProcessed++;
      console.log(`${league} ${abbr}: ${players.length} players processed`);
    } catch (err: any) {
      console.error(`Error fetching roster for ${abbr} (${idTeam}):`, err.message);
    }
  }
  
  return {
    teams_processed: teamsProcessed,
    players_upserted: playersUpserted,
  };
}

// ─── MODE: scores (optimized batch) ─────────────────────────────────────────

function parseQuarterScores(strResult: string | null) {
  if (!strResult) return [];
  
  const periodLabels = strResult.includes("Periods:") ? "Periods:" : 
                       strResult.includes("Quarters:") ? "Quarters:" :
                       strResult.includes("Innings:") ? "Innings:" : null;
  
  if (!periodLabels) return [];
  
  const parts = strResult.split(periodLabels);
  if (parts.length < 3) return [];
  
  const homeScores = parts[1].trim().split(/\s+/).filter(s => /^\d+$/.test(s)).map(Number);
  const awayScoresRaw = parts[2].trim().split(/\s+/).filter(s => /^\d+$/.test(s)).map(Number);
  
  const periods: { quarter: number; home_score: number; away_score: number }[] = [];
  const count = Math.min(homeScores.length, awayScoresRaw.length);
  
  for (let i = 0; i < count; i++) {
    periods.push({
      quarter: i + 1,
      home_score: homeScores[i],
      away_score: awayScoresRaw[i],
    });
  }
  
  return periods;
}

async function syncScores(
  apiKey: string,
  supabase: any,
  league: string,
  season?: string,
  round?: string,
  updateOffset = 0,
  updateLimit = 200,
) {
  let events: any[] = [];
  
  if (round && season) {
    // Fetch a specific round
    const data = await apiFetch(apiKey, `eventsround.php?id=${LEAGUE_IDS[league]}&r=${round}&s=${season}`);
    events = data.events || [];
  } else if (season) {
    const data = await apiFetch(apiKey, `eventsseason.php?id=${LEAGUE_IDS[league]}&s=${season}`);
    events = data.events || [];
  } else {
    const data = await apiFetch(apiKey, `eventspastleague.php?id=${LEAGUE_IDS[league]}`);
    events = data.events || [];
  }
  
  // Pre-fetch ALL games for this league from DB to match in memory
  const allGames: any[] = [];
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: batch } = await supabase
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, status")
      .eq("league", league)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (!batch || batch.length === 0) break;
    allGames.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page++;
  }
  console.log(`Pre-fetched ${allGames.length} ${league} games from DB`);
  
  // Build lookup: "homeAbbr|awayAbbr|YYYY-MM-DD" → game
  const gameIndex = new Map<string, any>();
  for (const g of allGames) {
    const d = g.start_time.split("T")[0];
    const dt = new Date(d);
    const dayBefore = new Date(dt.getTime() - 86400000).toISOString().split("T")[0];
    const dayAfter = new Date(dt.getTime() + 86400000).toISOString().split("T")[0];
    for (const date of [d, dayBefore, dayAfter]) {
      const key = `${g.home_abbr}|${g.away_abbr}|${date}`;
      if (!gameIndex.has(key)) gameIndex.set(key, g);
    }
  }
  
  let gamesUpdated = 0;
  let skipped = 0;
  
  // Collect updates first (in-memory matching)
  const pendingUpdates: { id: string; home_score: number; away_score: number }[] = [];
  
  for (const ev of events) {
    const homeAbbr = getAbbr(league, ev.strHomeTeam);
    const awayAbbr = getAbbr(league, ev.strAwayTeam);
    
    if (!homeAbbr || !awayAbbr) { skipped++; continue; }
    
    const homeScore = ev.intHomeScore != null ? parseInt(ev.intHomeScore) : null;
    const awayScore = ev.intAwayScore != null ? parseInt(ev.intAwayScore) : null;
    const isFinal = ev.strStatus === "FT" || ev.strStatus === "AOT" || ev.strStatus === "AP";
    
    if (homeScore == null || awayScore == null || !isFinal) { skipped++; continue; }
    
    const key = `${homeAbbr}|${awayAbbr}|${ev.dateEvent}`;
    const existing = gameIndex.get(key);
    
    if (existing && (existing.home_score !== homeScore || existing.away_score !== awayScore || existing.status !== "final")) {
      pendingUpdates.push({ id: existing.id, home_score: homeScore, away_score: awayScore });
    } else if (!existing) {
      skipped++;
    }
  }
  
  const totalNeedUpdate = pendingUpdates.length;
  console.log(`${totalNeedUpdate} games need score corrections (processing offset=${updateOffset}, limit=${updateLimit})`);
  
  // Slice to the requested chunk
  const chunk = pendingUpdates.slice(updateOffset, updateOffset + updateLimit);
  
  // Execute updates in parallel batches of 50
  const BATCH = 50;
  for (let i = 0; i < chunk.length; i += BATCH) {
    const batch = chunk.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(u =>
        supabase
          .from("games")
          .update({ home_score: u.home_score, away_score: u.away_score, status: "final" })
          .eq("id", u.id)
      )
    );
    gamesUpdated += results.filter(r => !r.error).length;
  }
  
  return {
    events_fetched: events.length,
    total_need_update: totalNeedUpdate,
    games_updated: gamesUpdated,
    skipped,
    next_offset: updateOffset + updateLimit < totalNeedUpdate ? updateOffset + updateLimit : null,
  };
}

// ─── MODE: scores_all — loop through rounds ─────────────────────────────────

async function syncScoresAll(
  apiKey: string,
  supabase: any,
  league: string,
  season: string,
  startRound: number,
  endRound: number,
) {
  let totalUpdated = 0;
  let totalPeriods = 0;
  let totalEvents = 0;
  let totalSkipped = 0;
  const roundResults: any[] = [];
  
  for (let r = startRound; r <= endRound; r++) {
    const result = await syncScores(apiKey, supabase, league, season, String(r));
    totalUpdated += result.games_updated;
    totalPeriods += result.periods_upserted;
    totalEvents += result.events_fetched;
    totalSkipped += result.skipped;
    roundResults.push({ round: r, ...result });
    console.log(`Round ${r}: ${result.games_updated} updated, ${result.skipped} skipped`);
    
    // Check if we're running low on time (50s budget)
    if (r < endRound) await delay(200);
  }
  
  return {
    rounds_processed: endRound - startRound + 1,
    total_events: totalEvents,
    total_updated: totalUpdated,
    total_periods: totalPeriods,
    total_skipped: totalSkipped,
  };
}

// ─── MODE: schedule ─────────────────────────────────────────────────────────

async function syncSchedule(
  apiKey: string,
  supabase: any,
  league: string,
) {
  const data = await apiFetch(apiKey, `eventsnextleague.php?id=${LEAGUE_IDS[league]}`);
  const events = data.events || [];
  
  let gamesUpserted = 0;
  let skipped = 0;
  
  for (const ev of events) {
    const homeTeam = ev.strHomeTeam;
    const awayTeam = ev.strAwayTeam;
    const homeAbbr = getAbbr(league, homeTeam);
    const awayAbbr = getAbbr(league, awayTeam);
    
    if (!homeAbbr || !awayAbbr) {
      skipped++;
      continue;
    }
    
    const startTime = ev.strTimestamp ? new Date(ev.strTimestamp + "+00:00").toISOString()
      : `${ev.dateEvent}T${ev.strTime || "00:00:00"}Z`;
    
    const eventDate = ev.dateEvent;
    const dayBefore = new Date(new Date(eventDate).getTime() - 86400000).toISOString().split("T")[0];
    const dayAfter = new Date(new Date(eventDate).getTime() + 86400000).toISOString().split("T")[0];
    
    const { data: existing } = await supabase
      .from("games")
      .select("id")
      .eq("home_abbr", homeAbbr)
      .eq("away_abbr", awayAbbr)
      .eq("league", league)
      .gte("start_time", `${dayBefore}T00:00:00Z`)
      .lte("start_time", `${dayAfter}T23:59:59Z`)
      .maybeSingle();
    
    if (existing) continue;
    
    const { error } = await supabase.from("games").insert({
      home_team: homeTeam,
      away_team: awayTeam,
      home_abbr: homeAbbr,
      away_abbr: awayAbbr,
      league,
      start_time: startTime,
      status: "scheduled",
      source: "thesportsdb",
      external_id: `tsdb_${ev.idEvent}`,
      venue: ev.strVenue || null,
    });
    
    if (error) {
      skipped++;
    } else {
      gamesUpserted++;
    }
  }
  
  return {
    events_fetched: events.length,
    games_inserted: gamesUpserted,
    skipped,
  };
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const apiKey = Deno.env.get("THESPORTSDB_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "THESPORTSDB_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    
    const url = new URL(req.url);
    
    let bodyParams: Record<string, string> = {};
    if (req.method === "POST") {
      try {
        bodyParams = await req.json();
      } catch { /* no body */ }
    }
    
    const mode = bodyParams.mode || url.searchParams.get("mode") || "teams";
    const league = (bodyParams.league || url.searchParams.get("league") || "NBA").toUpperCase();
    const season = bodyParams.season || url.searchParams.get("season") || undefined;
    const round = bodyParams.round || url.searchParams.get("round") || undefined;
    const startRound = parseInt(bodyParams.start_round || url.searchParams.get("start_round") || "1");
    const endRound = parseInt(bodyParams.end_round || url.searchParams.get("end_round") || "10");
    
    if (!LEAGUE_IDS[league]) {
      return new Response(
        JSON.stringify({ error: `Unsupported league: ${league}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    
    let result: any;
    
    switch (mode) {
      case "teams":
        result = await syncTeams(apiKey, supabase, league);
        break;
      case "rosters":
        result = await syncRosters(apiKey, supabase, league);
        break;
      case "scores": {
        const offset = parseInt(bodyParams.offset || url.searchParams.get("offset") || "0");
        const limit = parseInt(bodyParams.limit || url.searchParams.get("limit") || "200");
        result = await syncScores(apiKey, supabase, league, season, round, offset, limit);
        break;
      }
        break;
      case "scores_all":
        if (!season) {
          return new Response(
            JSON.stringify({ error: "season required for scores_all mode" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        result = await syncScoresAll(apiKey, supabase, league, season, startRound, endRound);
        break;
      case "schedule":
        result = await syncSchedule(apiKey, supabase, league);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown mode: ${mode}. Use: teams, rosters, scores, scores_all, schedule` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
    
    return new Response(
      JSON.stringify({ success: true, mode, league, ...result, fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("thesportsdb-sync error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
