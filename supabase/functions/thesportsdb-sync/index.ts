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

const LEAGUE_NAMES: Record<string, string> = {
  NBA: "NBA",
  NFL: "NFL",
  NHL: "NHL",
  MLB: "MLB",
};

// TheSportsDB uses league display names for team search
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
  const leagueId = LEAGUE_IDS[league];
  // Use search_all_teams with league name
  const data = await apiFetch(apiKey, `search_all_teams.php?l=${LEAGUE_SEARCH_NAMES[league]}`);
  const teams = data.teams || [];
  
  let upserted = 0;
  const teamMap: Record<string, string> = {}; // idTeam → abbr
  
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
  // First get teams to get team IDs
  const teamResult = await syncTeams(apiKey, supabase, league);
  const teamMap = teamResult.team_map;
  
  let playersUpserted = 0;
  let teamsProcessed = 0;
  
  for (const [idTeam, abbr] of Object.entries(teamMap)) {
    // Rate limit: 30 req/min for free, be conservative
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
        
        // Parse birth date
        if (p.dateBorn && p.dateBorn !== "0000-00-00") {
          record.birth_date = p.dateBorn;
        }
        
        // Parse birth location for geocoding later
        if (p.strBirthLocation) {
          record.birth_location = p.strBirthLocation;
        }
        
        // Check if player exists
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

// ─── MODE: scores ───────────────────────────────────────────────────────────

function parseQuarterScores(strResult: string | null, homeTeam: string, awayTeam: string) {
  if (!strResult) return [];
  
  // Format: "Los Angeles Lakers Quarters:36 28 32 28 Dallas Mavericks Quarters:31 32 19 22"
  // Or for NHL: "... Periods:2 1 0 ..."
  const periodLabels = strResult.includes("Periods:") ? "Periods:" : 
                       strResult.includes("Quarters:") ? "Quarters:" :
                       strResult.includes("Innings:") ? "Innings:" : null;
  
  if (!periodLabels) return [];
  
  const parts = strResult.split(periodLabels);
  if (parts.length < 3) return [];
  
  // Extract home scores (between first label and second team name)
  const homeScoresStr = parts[1].trim();
  // Extract away scores (after second label)
  const awayScoresStr = parts[2].trim();
  
  // Parse numbers from each section
  const homeScores = homeScoresStr.split(/\s+/).filter(s => /^\d+$/.test(s)).map(Number);
  const awayScoresRaw = awayScoresStr.split(/\s+/).filter(s => /^\d+$/.test(s)).map(Number);
  
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
) {
  const leagueId = LEAGUE_IDS[league];
  let events: any[] = [];
  
  if (season) {
    // Full season
    const data = await apiFetch(apiKey, `eventsseason.php?id=${leagueId}&s=${season}`);
    events = data.events || [];
  } else {
    // Recent past events
    const data = await apiFetch(apiKey, `eventspastleague.php?id=${leagueId}`);
    events = data.events || [];
  }
  
  let gamesUpserted = 0;
  let periodsUpserted = 0;
  let skipped = 0;
  
  for (const ev of events) {
    const homeTeam = ev.strHomeTeam;
    const awayTeam = ev.strAwayTeam;
    const homeAbbr = getAbbr(league, homeTeam);
    const awayAbbr = getAbbr(league, awayTeam);
    
    if (!homeAbbr || !awayAbbr) {
      console.warn(`Skipping event: can't map ${homeTeam} or ${awayTeam}`);
      skipped++;
      continue;
    }
    
    const homeScore = ev.intHomeScore != null ? parseInt(ev.intHomeScore) : null;
    const awayScore = ev.intAwayScore != null ? parseInt(ev.intAwayScore) : null;
    const isFinal = ev.strStatus === "FT" || ev.strStatus === "AOT" || ev.strStatus === "AP";
    
    // Parse start time
    const startTime = ev.strTimestamp ? new Date(ev.strTimestamp + "+00:00").toISOString()
      : `${ev.dateEvent}T${ev.strTime || "00:00:00"}Z`;
    
    const gameRecord: Record<string, any> = {
      home_team: homeTeam,
      away_team: awayTeam,
      home_abbr: homeAbbr,
      away_abbr: awayAbbr,
      league,
      start_time: startTime,
      source: "thesportsdb",
      external_id: `tsdb_${ev.idEvent}`,
      venue: ev.strVenue || null,
    };
    
    if (homeScore != null) gameRecord.home_score = homeScore;
    if (awayScore != null) gameRecord.away_score = awayScore;
    if (isFinal) gameRecord.status = "final";
    else if (ev.strStatus === "NS" || ev.strStatus === "Not Started") gameRecord.status = "scheduled";
    
    // Try to match existing game by teams + date (±1 day)
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
    
    let gameId: string;
    
    if (existing) {
      // Update with scores
      const updateData: Record<string, any> = {};
      if (homeScore != null) updateData.home_score = homeScore;
      if (awayScore != null) updateData.away_score = awayScore;
      if (isFinal) updateData.status = "final";
      if (ev.strVenue) updateData.venue = ev.strVenue;
      if (Object.keys(updateData).length > 0) {
        await supabase.from("games").update(updateData).eq("id", existing.id);
      }
      gameId = existing.id;
    } else {
      const { data: inserted, error } = await supabase
        .from("games")
        .insert(gameRecord)
        .select("id")
        .single();
      if (error) {
        console.error(`Insert game error:`, error.message);
        skipped++;
        continue;
      }
      gameId = inserted.id;
    }
    
    gamesUpserted++;
    
    // Parse and insert period scores
    const periods = parseQuarterScores(ev.strResult, homeTeam, awayTeam);
    if (periods.length > 0) {
      for (const p of periods) {
        const { error } = await supabase
          .from("game_quarters")
          .upsert({
            game_id: gameId,
            quarter: p.quarter,
            home_score: p.home_score,
            away_score: p.away_score,
          }, { onConflict: "game_id,quarter" });
        
        if (error) {
          console.error(`Period insert error:`, error.message);
        } else {
          periodsUpserted++;
        }
      }
    }
  }
  
  return {
    events_fetched: events.length,
    games_upserted: gamesUpserted,
    periods_upserted: periodsUpserted,
    skipped,
  };
}

// ─── MODE: schedule ─────────────────────────────────────────────────────────

async function syncSchedule(
  apiKey: string,
  supabase: any,
  league: string,
) {
  const leagueId = LEAGUE_IDS[league];
  const data = await apiFetch(apiKey, `eventsnextleague.php?id=${leagueId}`);
  const events = data.events || [];
  
  let gamesUpserted = 0;
  let skipped = 0;
  
  for (const ev of events) {
    const homeTeam = ev.strHomeTeam;
    const awayTeam = ev.strAwayTeam;
    const homeAbbr = getAbbr(league, homeTeam);
    const awayAbbr = getAbbr(league, awayTeam);
    
    if (!homeAbbr || !awayAbbr) {
      console.warn(`Schedule: can't map ${homeTeam} or ${awayTeam}`);
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
    
    if (existing) {
      // Already exists, skip
      continue;
    }
    
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
      console.error(`Schedule insert error:`, error.message);
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
    const mode = url.searchParams.get("mode") || "teams";
    const league = (url.searchParams.get("league") || "NBA").toUpperCase();
    const season = url.searchParams.get("season") || undefined;
    
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
      case "scores":
        result = await syncScores(apiKey, supabase, league, season);
        break;
      case "schedule":
        result = await syncSchedule(apiKey, supabase, league);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown mode: ${mode}. Use: teams, rosters, scores, schedule` }),
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
