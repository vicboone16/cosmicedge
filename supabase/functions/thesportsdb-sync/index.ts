import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { CANONICAL } from "../_shared/team-mappings.ts";

const BASE = "https://www.thesportsdb.com/api/v1/json";
const BASE_V2 = "https://www.thesportsdb.com/api/v2/json";

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

// Hard-coded TheSportsDB team IDs → canonical abbreviation
// This avoids relying on search_all_teams.php which only returns ~10 teams
const HARDCODED_TEAM_MAPS: Record<string, Record<string, string>> = {
  NBA: {
    "134880": "ATL", "134881": "BOS", "134882": "BKN", "134883": "CHA",
    "134884": "CHI", "134885": "CLE", "134886": "DAL", "134887": "DEN",
    "134888": "DET", "134889": "GSW", "134890": "HOU", "134891": "IND",
    "134892": "LAC", "134893": "LAL", "134894": "MEM", "134895": "MIA",
    "134896": "MIL", "134897": "MIN", "134898": "NOP", "134899": "NYK",
    "134900": "OKC", "134901": "ORL", "134902": "PHI", "134903": "PHX",
    "134904": "POR", "134905": "SAC", "134906": "SAS", "134907": "TOR",
    "134908": "UTA", "134909": "WAS",
  },
  NFL: {
    "135908": "ARI", "135899": "ATL", "135900": "BAL", "135901": "BUF",
    "135902": "CAR", "135903": "CHI", "135904": "CIN", "135905": "CLE",
    "135906": "DAL", "135907": "DEN", "135909": "DET", "135910": "GB",
    "135911": "HOU", "135912": "IND", "135913": "JAX", "135914": "KC",
    "135915": "LV",  "135916": "LAC", "135917": "LAR", "135918": "MIA",
    "135919": "MIN", "135920": "NE",  "135921": "NO",  "135922": "NYG",
    "135923": "NYJ", "135924": "PHI", "135925": "PIT", "135926": "SF",
    "135927": "SEA", "135928": "TB",  "135929": "TEN", "135930": "WAS",
  },
  NHL: {
    "134846": "ANA", "134830": "BOS", "134831": "BUF", "134833": "CGY",
    "134832": "CAR", "134834": "CHI", "134835": "COL", "134836": "CBJ",
    "134837": "DAL", "134838": "DET", "134839": "EDM", "134840": "FLA",
    "134841": "LAK", "134842": "MIN", "134843": "MTL", "134844": "NSH",
    "134845": "NJD", "134847": "NYI", "134848": "NYR", "134849": "OTT",
    "134850": "PHI", "134851": "PIT", "134852": "SJS", "134853": "SEA",
    "134854": "STL", "134855": "TBL", "134856": "TOR", "135991": "UTA",
    "134857": "VAN", "134858": "VGK", "134859": "WSH", "134860": "WPG",
  },
  MLB: {
    "135269": "ARI", "135270": "ATL", "135271": "BAL", "135272": "BOS",
    "135273": "CHC", "135274": "CHW", "135275": "CIN", "135276": "CLE",
    "135277": "COL", "135278": "DET", "135279": "HOU", "135280": "KCR",
    "135281": "LAA", "135282": "LAD", "135283": "MIA", "135284": "MIL",
    "135285": "MIN", "135286": "NYM", "135287": "NYY", "135288": "OAK",
    "135289": "PHI", "135290": "PIT", "135291": "SDP", "135292": "SFG",
    "135293": "SEA", "135294": "STL", "135295": "TBR", "135296": "TEX",
    "135297": "TOR", "135298": "WSN",
  },
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
  // Use hardcoded team map — search_all_teams.php only returns ~10 teams on limited plans
  const teamMap = { ...(HARDCODED_TEAM_MAPS[league] || {}) };
  const mapped = Object.keys(teamMap).length;
  console.log(`${league}: using hardcoded team map with ${mapped} teams`);
  return { teams_found: mapped, mapped, team_map: teamMap };
}

// ─── MODE: rosters ──────────────────────────────────────────────────────────

async function syncRosters(
  apiKey: string,
  supabase: any,
  league: string,
  startTeam = 0,
  maxTeams = 4,
  providedTeamMap: Record<string, string> | null = null,
) {
  // Use hardcoded map (always complete) — avoids search_all_teams API which returns only ~10 teams
  let teamMap: Record<string, string>;
  if (providedTeamMap && Object.keys(providedTeamMap).length > 0) {
    teamMap = providedTeamMap;
  } else {
    // Always fall back to hardcoded map, not the API
    teamMap = { ...(HARDCODED_TEAM_MAPS[league] || {}) };
    if (Object.keys(teamMap).length === 0) {
      // If somehow hardcoded map is empty, try API as last resort
      const teamResult = await syncTeams(apiKey, supabase, league);
      teamMap = teamResult.team_map;
    }
  }

  const allEntries = Object.entries(teamMap);
  const totalTeams = allEntries.length;

  // Slice to the requested chunk
  const chunk = allEntries.slice(startTeam, startTeam + maxTeams);

  let playersUpserted = 0;
  let teamsProcessed = 0;

  for (const [idTeam, abbr] of chunk) {
    if (teamsProcessed > 0 && teamsProcessed % 2 === 0) {
      await delay(300);
    }

    try {
      const data = await apiFetch(apiKey, `lookup_all_players.php?id=${idTeam}`);
      const players = data.player || [];
      if (players.length === 0) { teamsProcessed++; continue; }

      // Collect all external IDs and names from the API response
      const externalIds = players.map((p: any) => String(p.idPlayer)).filter(Boolean);
      const names = players.map((p: any) => p.strPlayer).filter(Boolean);

      // Fetch existing players matching EITHER external_id OR name (league-scoped)
      const [byExtIdResult, byNameResult] = await Promise.all([
        supabase
          .from("players")
          .select("id, name, external_id, team")
          .eq("league", league)
          .in("external_id", externalIds),
        supabase
          .from("players")
          .select("id, name, external_id, team")
          .eq("league", league)
          .in("name", names),
      ]);

      // Build lookup maps: external_id → player row, name → player row
      const extIdMap = new Map<string, any>();
      for (const e of byExtIdResult.data || []) extIdMap.set(e.external_id, e);

      const nameMap = new Map<string, any>();
      for (const e of byNameResult.data || []) {
        if (!extIdMap.has(e.external_id)) nameMap.set(e.name, e);
      }

      const toUpdate: { id: string; record: Record<string, any> }[] = [];
      const toInsert: Record<string, any>[] = [];

      for (const p of players) {
        const playerName = p.strPlayer;
        const extId = p.idPlayer ? String(p.idPlayer) : null;
        if (!playerName) continue;

        const record: Record<string, any> = {
          name: playerName,
          team: abbr,
          league,
          position: p.strPosition || null,
          headshot_url: p.strThumb || p.strCutout || null,
          external_id: extId,
        };

        if (p.dateBorn && p.dateBorn !== "0000-00-00") {
          record.birth_date = p.dateBorn;
        }
        if (p.strBirthLocation) {
          record.birth_place = p.strBirthLocation;
        }

        const existing =
          (extId && extIdMap.get(extId)) ||
          nameMap.get(playerName);

        if (existing) {
          // Do NOT overwrite team — manual curation takes priority
          const { team: _dropTeam, ...updateRecord } = record;
          toUpdate.push({ id: existing.id, record: updateRecord });
        } else {
          toInsert.push(record);
        }
        playersUpserted++;
      }

      // Execute updates in parallel batches of 20
      const BATCH = 20;
      for (let i = 0; i < toUpdate.length; i += BATCH) {
        await Promise.all(
          toUpdate.slice(i, i + BATCH).map(({ id, record }) =>
            supabase.from("players").update(record).eq("id", id)
          )
        );
      }
      // Insert new players in batches of 50
      for (let i = 0; i < toInsert.length; i += 50) {
        const { error } = await supabase.from("players").insert(toInsert.slice(i, i + 50));
        if (error && !error.message?.includes("duplicate")) {
          console.error(`Insert batch error:`, error.message);
        }
      }

      teamsProcessed++;
      console.log(`${league} ${abbr}: ${players.length} players (${toUpdate.length} updated, ${toInsert.length} inserted)`);
    } catch (err: any) {
      console.error(`Error fetching roster for ${abbr} (${idTeam}):`, err.message);
    }
  }

  const nextTeam = startTeam + maxTeams;
  return {
    teams_processed: teamsProcessed,
    players_upserted: playersUpserted,
    total_teams: totalTeams,
    team_map: teamMap,  // Return so dashboard can pass it on the next batch
    next_start_team: nextTeam < totalTeams ? nextTeam : null,
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
  let totalEvents = 0;
  let totalSkipped = 0;
  const roundResults: any[] = [];
  
  for (let r = startRound; r <= endRound; r++) {
    const result = await syncScores(apiKey, supabase, league, season, String(r));
    totalUpdated += result.games_updated;
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

  // Pre-fetch ALL upcoming games for this league in ONE query (avoid N+1 per event)
  const minDate = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0];
  const maxDate = new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0];
  
  const { data: existingGames } = await supabase
    .from("games")
    .select("id, home_abbr, away_abbr, start_time")
    .eq("league", league)
    .gte("start_time", `${minDate}T00:00:00Z`)
    .lte("start_time", `${maxDate}T23:59:59Z`)
    .limit(10000);

  // Build lookup index: "homeAbbr|awayAbbr|YYYY-MM-DD" → true
  const existingIndex = new Set<string>();
  for (const g of existingGames || []) {
    const d = g.start_time.split("T")[0];
    const dt = new Date(d);
    for (let offset = -1; offset <= 1; offset++) {
      const day = new Date(dt.getTime() + offset * 86400000).toISOString().split("T")[0];
      existingIndex.add(`${g.home_abbr}|${g.away_abbr}|${day}`);
    }
  }

  // Build inserts (no per-event DB calls)
  const toInsert: Record<string, any>[] = [];
  for (const ev of events) {
    const homeTeam = ev.strHomeTeam;
    const awayTeam = ev.strAwayTeam;
    const homeAbbr = getAbbr(league, homeTeam);
    const awayAbbr = getAbbr(league, awayTeam);
    
    if (!homeAbbr || !awayAbbr) { skipped++; continue; }
    
    const eventDate = ev.dateEvent;
    const key = `${homeAbbr}|${awayAbbr}|${eventDate}`;
    if (existingIndex.has(key)) { continue; }
    
    const startTime = ev.strTimestamp ? new Date(ev.strTimestamp + "+00:00").toISOString()
      : `${ev.dateEvent}T${ev.strTime || "00:00:00"}Z`;
    
    toInsert.push({
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
  }

  // Batch insert in chunks of 50
  for (let i = 0; i < toInsert.length; i += 50) {
    const { error } = await supabase.from("games").insert(toInsert.slice(i, i + 50));
    if (error) {
      console.error("Schedule insert error:", error.message);
      skipped += Math.min(50, toInsert.length - i);
    } else {
      gamesUpserted += Math.min(50, toInsert.length - i);
    }
  }
  
  return {
    events_fetched: events.length,
    games_inserted: gamesUpserted,
    skipped,
  };
}

// ─── MODE: schedule_season — full season schedule via eventsseason.php ───────

async function syncScheduleSeason(
  apiKey: string,
  supabase: any,
  league: string,
  season: string,
) {
  const leagueId = LEAGUE_IDS[league];
  const data = await apiFetch(apiKey, `eventsseason.php?id=${leagueId}&s=${season}`);
  const events = data.events || [];
  console.log(`[schedule_season] ${league} season ${season}: ${events.length} events`);

  let gamesUpserted = 0;
  let skipped = 0;

  // Pre-fetch ALL games for this league from DB
  const allGames: any[] = [];
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: batch } = await supabase
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, external_id")
      .eq("league", league)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (!batch || batch.length === 0) break;
    allGames.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page++;
  }

  // Build lookup indexes
  const existingByExtId = new Set<string>();
  const existingByFingerprint = new Set<string>();
  for (const g of allGames) {
    if (g.external_id) existingByExtId.add(g.external_id);
    const d = g.start_time.split(/[T ]/)[0];
    const dt = new Date(d);
    for (let offset = -1; offset <= 1; offset++) {
      const day = new Date(dt.getTime() + offset * 86400000).toISOString().split("T")[0];
      existingByFingerprint.add(`${g.home_abbr}|${g.away_abbr}|${day}`);
    }
  }

  const toInsert: Record<string, any>[] = [];

  for (const ev of events) {
    const homeTeam = ev.strHomeTeam;
    const awayTeam = ev.strAwayTeam;
    const homeAbbr = getAbbr(league, homeTeam);
    const awayAbbr = getAbbr(league, awayTeam);

    if (!homeAbbr || !awayAbbr) { skipped++; continue; }

    const extId = `tsdb_${ev.idEvent}`;
    if (existingByExtId.has(extId)) continue;

    const eventDate = ev.dateEvent;
    const fpKey = `${homeAbbr}|${awayAbbr}|${eventDate}`;
    if (existingByFingerprint.has(fpKey)) continue;

    const startTime = ev.strTimestamp
      ? new Date(ev.strTimestamp + "+00:00").toISOString()
      : `${ev.dateEvent}T${ev.strTime || "00:00:00"}Z`;

    // Determine status
    let status = "scheduled";
    if (ev.strStatus === "FT" || ev.strStatus === "AOT" || ev.strStatus === "AP") {
      status = "final";
    } else if (ev.strStatus === "NS" || ev.strStatus === "Not Started") {
      status = "scheduled";
    }

    toInsert.push({
      home_team: homeTeam,
      away_team: awayTeam,
      home_abbr: homeAbbr,
      away_abbr: awayAbbr,
      league,
      start_time: startTime,
      status,
      source: "thesportsdb",
      external_id: extId,
      venue: ev.strVenue || null,
      home_score: ev.intHomeScore != null ? parseInt(ev.intHomeScore) : null,
      away_score: ev.intAwayScore != null ? parseInt(ev.intAwayScore) : null,
    });
  }

  // Batch insert
  for (let i = 0; i < toInsert.length; i += 50) {
    const { error } = await supabase.from("games").insert(toInsert.slice(i, i + 50));
    if (error) {
      console.error(`Schedule season insert error at ${i}:`, error.message);
      skipped += Math.min(50, toInsert.length - i);
    } else {
      gamesUpserted += Math.min(50, toInsert.length - i);
    }
  }

  return {
    events_fetched: events.length,
    games_inserted: gamesUpserted,
    already_existed: events.length - gamesUpserted - skipped,
    skipped,
  };
}

// ─── MODE: live — fetch live scores via v2 livescore API ────────────────────

const LIVE_SPORT_SLUG: Record<string, string> = {
  NHL: "hockey",
  NBA: "basketball",
  NFL: "americanfootball",
  MLB: "baseball",
};

async function syncLiveScores(
  apiKey: string,
  supabase: any,
  league: string,
) {
  const sportSlug = LIVE_SPORT_SLUG[league];
  if (!sportSlug) throw new Error(`No livescore slug for ${league}`);

  const url = `${BASE_V2}/livescore/${sportSlug}`;
  console.log(`Fetching live scores: ${url}`);
  const resp = await fetch(url, {
    headers: { "X-API-KEY": apiKey },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Livescore API ${resp.status}: ${body.slice(0, 300)}`);
  }
  const json = await resp.json();
  const events = json.livescores?.events || json.events || json.livescore || [];
  console.log(`Live events received: ${events.length}`);

  if (!events.length) {
    return { events_fetched: 0, games_updated: 0, games_inserted: 0, skipped: 0 };
  }

  // Filter to only the target league
  const leagueId = LEAGUE_IDS[league];
  const leagueEvents = events.filter((ev: any) =>
    String(ev.idLeague) === leagueId || !ev.idLeague
  );
  console.log(`Filtered to ${leagueEvents.length} ${league} events`);

  // Pre-fetch today's + yesterday's games from DB
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const todayStr = today.toISOString().split("T")[0];
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const { data: existingGames } = await supabase
    .from("games")
    .select("id, home_abbr, away_abbr, start_time, status, home_score, away_score, external_id")
    .eq("league", league)
    .gte("start_time", `${yesterdayStr}T00:00:00Z`)
    .lte("start_time", `${todayStr}T23:59:59Z`);

  // Build lookup
  const gameIndex = new Map<string, any>();
  const extIdIndex = new Map<string, any>();
  for (const g of existingGames || []) {
    const d = g.start_time.split("T")[0];
    const dt = new Date(d);
    for (let offset = -1; offset <= 1; offset++) {
      const day = new Date(dt.getTime() + offset * 86400000).toISOString().split("T")[0];
      gameIndex.set(`${g.home_abbr}|${g.away_abbr}|${day}`, g);
    }
    if (g.external_id) extIdIndex.set(g.external_id, g);
  }

  let gamesUpdated = 0;
  let gamesInserted = 0;
  let skipped = 0;

  // Use hardcoded team ID map for matching
  const teamIdMap = HARDCODED_TEAM_MAPS[league] || {};

  for (const ev of leagueEvents) {
    // Resolve team abbreviations
    const homeIdTeam = String(ev.idHomeTeam || "");
    const awayIdTeam = String(ev.idAwayTeam || "");
    let homeAbbr = teamIdMap[homeIdTeam] || getAbbr(league, ev.strHomeTeam || "");
    let awayAbbr = teamIdMap[awayIdTeam] || getAbbr(league, ev.strAwayTeam || "");

    if (!homeAbbr || !awayAbbr) {
      console.warn(`Unmapped teams: ${ev.strHomeTeam} vs ${ev.strAwayTeam}`);
      skipped++;
      continue;
    }

    const homeScore = ev.intHomeScore != null ? parseInt(ev.intHomeScore) : null;
    const awayScore = ev.intAwayScore != null ? parseInt(ev.intAwayScore) : null;

    // Map status
    let status = "scheduled";
    const evStatus = String(ev.strStatus || "").toUpperCase();
    const evProgress = String(ev.strProgress || "").toUpperCase();
    if (evStatus === "FT" || evStatus === "AOT" || evStatus === "AP" || evStatus === "AET") {
      status = "final";
    } else if (evStatus === "NS" || evStatus === "NOT STARTED") {
      status = "scheduled";
    } else if (
      evProgress || evStatus === "LIVE" || evStatus === "1H" || evStatus === "2H" || evStatus === "HT" ||
      /^P\d|^\d+(ST|ND|RD|TH)/i.test(evStatus) || /^\d+/.test(evProgress)
    ) {
      status = "in_progress";
    }

    // Try to match existing game
    const extId = `tsdb_${ev.idEvent}`;
    const eventDate = ev.dateEvent || todayStr;
    const fpKey = `${homeAbbr}|${awayAbbr}|${eventDate}`;
    const existing = extIdIndex.get(extId) || gameIndex.get(fpKey);

    if (existing) {
      // Update if scores changed or status changed
      const needsUpdate =
        existing.home_score !== homeScore ||
        existing.away_score !== awayScore ||
        (existing.status !== status && status !== "scheduled");

      if (needsUpdate && (homeScore != null || status === "in_progress" || status === "final")) {
        const updatePayload: Record<string, any> = { status };
        if (homeScore != null) updatePayload.home_score = homeScore;
        if (awayScore != null) updatePayload.away_score = awayScore;

        const { error } = await supabase
          .from("games")
          .update(updatePayload)
          .eq("id", existing.id);

        if (!error) gamesUpdated++;
        else console.error(`Update error for ${homeAbbr} vs ${awayAbbr}:`, error.message);
      }
    } else {
      // Insert new game
      const startTime = ev.strTimestamp
        ? new Date(ev.strTimestamp + (ev.strTimestamp.includes("Z") ? "" : "+00:00")).toISOString()
        : `${eventDate}T${ev.strTime || "00:00:00"}Z`;

      const { error } = await supabase.from("games").insert({
        home_team: ev.strHomeTeam,
        away_team: ev.strAwayTeam,
        home_abbr: homeAbbr,
        away_abbr: awayAbbr,
        league,
        start_time: startTime,
        status,
        source: "thesportsdb",
        external_id: extId,
        venue: ev.strVenue || null,
        home_score: homeScore,
        away_score: awayScore,
      });

      if (!error) gamesInserted++;
      else if (!error?.message?.includes("duplicate")) {
        console.error(`Insert error:`, error.message);
        skipped++;
      }
    }
  }

  return {
    events_fetched: leagueEvents.length,
    games_updated: gamesUpdated,
    games_inserted: gamesInserted,
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
      case "rosters": {
        const startTeam = parseInt(bodyParams.start_team || url.searchParams.get("start_team") || "0");
        const maxTeams = parseInt(bodyParams.max_teams || url.searchParams.get("max_teams") || "4");
        // Accept a pre-built team_map to avoid re-fetching teams on every batch
        const providedTeamMap: Record<string, string> | null = bodyParams.team_map || null;
        result = await syncRosters(apiKey, supabase, league, startTeam, maxTeams, providedTeamMap);
        break;
      }
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
      case "schedule_season": {
        const schedSeason = bodyParams.season || url.searchParams.get("season");
        if (!schedSeason) {
          return new Response(
            JSON.stringify({ error: "season param required for schedule_season mode (e.g. 2025-2026 or 2026)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        result = await syncScheduleSeason(apiKey, supabase, league, schedSeason);
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `Unknown mode: ${mode}. Use: teams, rosters, scores, scores_all, schedule, schedule_season` }),
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
