import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// NBA team name → abbreviation normalization
const TEAM_MAP: Record<string, string> = {
  "atlanta": "ATL", "atl.": "ATL", "atl": "ATL",
  "boston": "BOS", "bos.": "BOS", "bos": "BOS",
  "brooklyn": "BKN", "bkn.": "BKN", "bkn": "BKN",
  "charlotte": "CHA", "cha.": "CHA", "cha": "CHA",
  "chicago": "CHI", "chi.": "CHI", "chi": "CHI",
  "cleveland": "CLE", "clev.": "CLE", "cle": "CLE", "clev": "CLE",
  "dallas": "DAL", "dall.": "DAL", "dal": "DAL", "dall": "DAL",
  "denver": "DEN", "den.": "DEN", "den": "DEN",
  "detroit": "DET", "det.": "DET", "det": "DET",
  "golden state": "GSW", "g.s.": "GSW", "gs": "GSW", "g.s": "GSW",
  "houston": "HOU", "hou.": "HOU", "hou": "HOU",
  "indiana": "IND", "ind.": "IND", "ind": "IND",
  "l.a. clippers": "LAC", "la-c": "LAC", "lac": "LAC", "la-c.": "LAC",
  "l.a. lakers": "LAL", "la-l": "LAL", "lal": "LAL", "la-l.": "LAL",
  "memphis": "MEM", "mem.": "MEM", "mem": "MEM",
  "miami": "MIA", "mia": "MIA",
  "milwaukee": "MIL", "milw.": "MIL", "mil": "MIL", "milw": "MIL",
  "minnesota": "MIN", "minn.": "MIN", "min": "MIN", "minn": "MIN",
  "new orleans": "NOP", "n.o.": "NOP", "no": "NOP", "n.o": "NOP",
  "new york": "NYK", "n.y.": "NYK", "ny": "NYK", "n.y": "NYK",
  "oklahoma city": "OKC", "okc.": "OKC", "okc": "OKC",
  "orlando": "ORL", "orl.": "ORL", "orl": "ORL",
  "philadelphia": "PHI", "phil.": "PHI", "phi": "PHI", "phil": "PHI",
  "phoenix": "PHX", "phoe.": "PHX", "pho": "PHX", "phoe": "PHX",
  "portland": "POR", "port.": "POR", "por": "POR", "port": "POR",
  "sacramento": "SAC", "sac.": "SAC", "sac": "SAC",
  "san antonio": "SAS", "s.a.": "SAS", "sa": "SAS", "s.a": "SAS",
  "toronto": "TOR", "tor.": "TOR", "tor": "TOR",
  "utah": "UTA", "uta": "UTA",
  "washington": "WAS", "wash.": "WAS", "was": "WAS", "wash": "WAS",
};

function normTeam(raw: string): string {
  const lower = raw.trim().toLowerCase().replace(/\*$/, "");
  return TEAM_MAP[lower] || raw.trim().toUpperCase();
}

function toNum(v: string | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[*,]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function toInt(v: string | undefined): number | null {
  const n = toNum(v);
  return n !== null ? Math.round(n) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const formData = await req.formData();
    const fileType = (formData.get("file_type") as string) || "auto";
    const file = formData.get("file") as File | null;
    const txtContent = file ? await file.text() : (formData.get("text") as string);
    if (!txtContent) throw new Error("No text data provided");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let result: any;
    const detectedType = fileType === "auto" ? detectFileType(txtContent) : fileType;
    console.log(`[import-nba-txt] Detected type: ${detectedType}`);

    switch (detectedType) {
      case "team_stats": result = await importTeamStats(sb, txtContent); break;
      case "team_misc": result = await importTeamMisc(sb, txtContent); break;
      case "pts_breakdown": result = await importPtsBreakdown(sb, txtContent); break;
      case "standings": result = await importStandings(sb, txtContent); break;
      case "standings_h2h": result = await importStandingsH2H(sb, txtContent); break;
      case "ratios": result = await importRatios(sb, txtContent); break;
      case "day_scores": result = await importDayScores(sb, txtContent); break;
      default: throw new Error(`Unknown file type: ${detectedType}`);
    }

    return new Response(JSON.stringify({ success: true, type: detectedType, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("import-nba-txt error:", e);
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function detectFileType(txt: string): string {
  if (txt.includes("Points-in-the-Paint") || txt.includes("Fast-Break Points") || txt.includes("Second-Chance")) return "pts_breakdown";
  if (txt.includes("FIELD GOALS") && txt.includes("3-PT") && txt.includes("REBOUNDS")) return "team_stats";
  if (txt.includes("TURNOVERS") && txt.includes("REBOUND") && txt.includes("OVERTIME")) return "team_misc";
  if (txt.includes("EASTERN CONFERENCE") || txt.includes("WESTERN CONFERENCE")) return "standings";
  if (txt.includes("ATLANTIC DIVISION") && txt.includes("ATL") && txt.match(/\d+\s+\d+\s+\.\d{3}/)) return "standings_h2h";
  if (txt.includes("Assists Per Turnover") || txt.includes("Steals Per Turnover")) return "ratios";
  if (txt.includes("POINTS: TEAM LEADERS") || txt.includes("REBOUNDS: TEAM LEADERS")) return "day_scores";
  return "team_stats";
}

// ─── TEAM STATS (team_opp.txt) ───────────────────────────────────
async function importTeamStats(sb: any, txt: string) {
  const lines = txt.split(/\r?\n/);
  const season = 2026;
  let upserted = 0;
  const errors: string[] = [];

  // Parse team totals section
  const teamData = new Map<string, any>();

  let section: "own" | "opp" | null = null;
  for (const line of lines) {
    if (line.includes("TEAMS' STATISTICS") && !line.includes("PER GAME") && !line.includes("RANK")) section = "own";
    else if (line.includes("OPPONENTS' STATISTICS") && !line.includes("PER GAME") && !line.includes("RANK")) section = "opp";
    else if (line.includes("PER GAME") || line.includes("RANK") || line.includes("AVG")) section = null;

    if (!section) continue;
    if (line.includes("TEAM") && line.includes("MADE")) continue;
    if (line.includes("FIELD GOALS")) continue;

    // Parse: TEAM G MADE ATT PCT MADE ATT PCT MADE ATT PCT OFF DEF TOT AST PF DQ STL TO BLK PTS AVG
    const parts = line.trim().split(/\s+/);
    if (parts.length < 15) continue;

    // Team name can be multi-word, stats start after team+games
    const teamRaw = parts[0];
    const team = normTeam(teamRaw);
    if (!team || team === "TOTALS" || team.includes("ONE") || team.includes("BOTH")) continue;

    if (section === "own") {
      const g = toInt(parts[1]);
      if (!g) continue;
      const d: any = {
        team_abbr: team, league: "NBA", season,
        games: g,
        fg_made: toInt(parts[2]), fg_attempted: toInt(parts[3]), fg_pct: toNum(parts[4]),
        three_made: toInt(parts[5]), three_attempted: toInt(parts[6]), three_pct: toNum(parts[7]),
        ft_made: toInt(parts[8]), ft_attempted: toInt(parts[9]), ft_pct: toNum(parts[10]),
        off_rebounds: toInt(parts[11]), def_rebounds: toInt(parts[12]), tot_rebounds: toInt(parts[13]),
        assists: toInt(parts[14]), personal_fouls: toInt(parts[15]), disqualifications: toInt(parts[16]),
        steals: toInt(parts[17]), turnovers: toInt(parts[18]), blocks: toInt(parts[19]),
        points: toInt(parts[20]), points_per_game: toNum(parts[21]),
      };
      teamData.set(team, { ...(teamData.get(team) || {}), ...d });
    } else if (section === "opp") {
      // Opp section: TEAM MADE ATT PCT MADE ATT PCT MADE ATT PCT OFF DEF TOT AST PF DQ STL TO BLK PTS AVG DIFF
      const d: any = {
        opp_fg_made: toInt(parts[1]), opp_fg_attempted: toInt(parts[2]), opp_fg_pct: toNum(parts[3]),
        opp_three_made: toInt(parts[4]), opp_three_attempted: toInt(parts[5]), opp_three_pct: toNum(parts[6]),
        opp_ft_made: toInt(parts[7]), opp_ft_attempted: toInt(parts[8]),
        opp_off_rebounds: toInt(parts[10]), opp_def_rebounds: toInt(parts[11]), opp_tot_rebounds: toInt(parts[12]),
        opp_assists: toInt(parts[13]), opp_personal_fouls: toInt(parts[14]), opp_disqualifications: toInt(parts[15]),
        opp_steals: toInt(parts[16]), opp_turnovers: toInt(parts[17]), opp_blocks: toInt(parts[18]),
        opp_points: toInt(parts[19]), opp_points_per_game: toNum(parts[20]),
        point_diff: toNum(parts[21]),
      };
      teamData.set(team, { ...(teamData.get(team) || {}), ...d });
    }
  }

  // Upsert all
  for (const [, data] of teamData) {
    const { error } = await sb.from("team_season_stats").upsert(data, { onConflict: "team_abbr,season,league" });
    if (error) errors.push(`${data.team_abbr}: ${error.message}`);
    else upserted++;
  }

  return { upserted, teams: teamData.size, errors: errors.slice(0, 10) };
}

// ─── TEAM MISC (team_opp_misc.txt) ──────────────────────────────
async function importTeamMisc(sb: any, txt: string) {
  const lines = txt.split(/\r?\n/);
  let upserted = 0;
  const errors: string[] = [];

  for (const line of lines) {
    // Format: TEAM OWN_PPG OPP_PPG OWN_FG% OPP_FG% OWN_TO OPP_TO OFF% DEF% TOT% OWN_B100 OPP_B100 OT_W OT_L D3_W D3_L D10_W D10_L
    const match = line.match(/^(\S[\w\s.]+?)\s{2,}([\d.]+\*?)\s+([\d.]+\*?)\s+(\.\d+\*?)\s+(\.\d+\*?)\s+([\d.]+\*?)\s+([\d.]+\*?)\s+(\.\d+\*?)\s+(\.\d+\*?)\s+(\.\d+\*?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (!match) continue;

    const team = normTeam(match[1]);
    if (!team || team === "COMPOSITE") continue;

    const data: any = {
      team_abbr: team, league: "NBA", season: 2026,
      off_reb_pct: toNum(match[8]),
      def_reb_pct: toNum(match[9]),
      tot_reb_pct: toNum(match[10]),
      below_100_own: toInt(match[11]),
      below_100_opp: toInt(match[12]),
      ot_wins: toInt(match[13]),
      ot_losses: toInt(match[14]),
      decided_3_wins: toInt(match[15]),
      decided_3_losses: toInt(match[16]),
      decided_10_wins: toInt(match[17]),
      decided_10_losses: toInt(match[18]),
    };

    const { error } = await sb.from("team_season_stats").upsert(data, { onConflict: "team_abbr,season,league" });
    if (error) errors.push(`${team}: ${error.message}`);
    else upserted++;
  }

  return { upserted, errors: errors.slice(0, 10) };
}

// ─── POINTS BREAKDOWN (team_opp_pts_breakdown.txt) ───────────────
async function importPtsBreakdown(sb: any, txt: string) {
  const lines = txt.split(/\r?\n/);
  let upserted = 0;
  const errors: string[] = [];
  const teamData = new Map<string, any>();

  let section = "";
  for (const line of lines) {
    if (line.includes("Points-in-the-Paint") && line.includes("Per Game") && line.includes("by Team")) { section = "paint_team"; continue; }
    if (line.includes("Points-in-the-Paint") && line.includes("Per Game") && line.includes("by Opponents")) { section = "paint_opp"; continue; }
    if (line.includes("Fast-Break Points") && line.includes("Per Game") && line.includes("by Team")) { section = "fb_team"; continue; }
    if (line.includes("Fast-Break Points") && line.includes("Per Game") && line.includes("by Opponents")) { section = "fb_opp"; continue; }
    if (line.includes("Percentage of Total") || line.includes("Second-Chance")) { section = ""; continue; }
    if (line.includes("Team") && line.includes("PerGame")) continue;
    if (line.includes("TOTALS") || !line.trim()) continue;

    if (!section) continue;

    // Format: TeamName Value PerGame PctOfTot TotPts Games TotPerGame
    const match = line.match(/^(\S[\w\s.]+?)\s{2,}(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+([\d.]+)/);
    if (!match) continue;

    const team = normTeam(match[1]);
    if (!team) continue;

    const existing = teamData.get(team) || { team_abbr: team, league: "NBA", season: 2026 };

    if (section === "paint_team") {
      existing.points_in_paint = toInt(match[2]);
      existing.points_in_paint_pg = toNum(match[3]);
    } else if (section === "paint_opp") {
      existing.opp_points_in_paint = toInt(match[2]);
      existing.opp_points_in_paint_pg = toNum(match[3]);
    } else if (section === "fb_team") {
      existing.fast_break_points = toInt(match[2]);
      existing.fast_break_points_pg = toNum(match[3]);
    } else if (section === "fb_opp") {
      existing.opp_fast_break_points = toInt(match[2]);
      existing.opp_fast_break_points_pg = toNum(match[3]);
    }
    teamData.set(team, existing);
  }

  for (const [, data] of teamData) {
    const { error } = await sb.from("team_season_stats").upsert(data, { onConflict: "team_abbr,season,league" });
    if (error) errors.push(`${data.team_abbr}: ${error.message}`);
    else upserted++;
  }

  return { upserted, teams: teamData.size, errors: errors.slice(0, 10) };
}

// ─── STANDINGS (stand.txt) ──────────────────────────────────────
async function importStandings(sb: any, txt: string) {
  const lines = txt.split(/\r?\n/);
  let upserted = 0;
  const errors: string[] = [];
  let conference = "";
  let division = "";

  for (const line of lines) {
    if (line.includes("EASTERN CONFERENCE")) conference = "Eastern";
    if (line.includes("WESTERN CONFERENCE")) conference = "Western";
    if (line.includes("ATLANTIC")) division = "Atlantic";
    if (line.includes("CENTRAL")) division = "Central";
    if (line.includes("SOUTHEAST")) division = "Southeast";
    if (line.includes("SOUTHWEST")) division = "Southwest";
    if (line.includes("NORTHWEST")) division = "Northwest";
    if (line.includes("PACIFIC")) division = "Pacific";

    // Match: TeamName W L PCT GB HOME ROAD NEUTRAL LAST-10 STREAK
    const match = line.match(/^\s*(\S[\w\s.]+?)\s{2,}(\d+)\s+(\d+)\s+(\.\d+)\s+([\d.]+|-)\s+(\d+-\s*\d+)\s+(\d+-\s*\d+)\s+(\d+-\s*\d+)\s+([\d-]+)\s+(Won|Lost)\s+(\d+)/);
    if (!match) continue;

    const team = normTeam(match[1]);
    if (!team) continue;

    const parseWL = (s: string) => {
      const p = s.replace(/\s/g, "").split("-");
      return [parseInt(p[0]) || 0, parseInt(p[1]) || 0];
    };

    const [hw, hl] = parseWL(match[6]);
    const [rw, rl] = parseWL(match[7]);
    const [nw, nl] = parseWL(match[8]);

    const data = {
      team_abbr: team, season: 2026, conference, division,
      wins: toInt(match[2]), losses: toInt(match[3]),
      pct: toNum(match[4]), gb: match[5] === "-" ? 0 : toNum(match[5]),
      home_wins: hw, home_losses: hl,
      road_wins: rw, road_losses: rl,
      neutral_wins: nw, neutral_losses: nl,
      last_10: match[9], streak: `${match[10]} ${match[11]}`,
    };

    const { error } = await sb.from("nba_standings").upsert(data, { onConflict: "team_abbr,season,snapshot_date" });
    if (error) errors.push(`${team}: ${error.message}`);
    else upserted++;
  }

  return { upserted, errors: errors.slice(0, 10) };
}

// ─── STANDINGS H2H (stand_tvt.txt) ─────────────────────────────
async function importStandingsH2H(sb: any, txt: string) {
  const lines = txt.split(/\r?\n/);
  let upserted = 0;
  const errors: string[] = [];

  // Parse column headers (team abbreviations)
  const teamCols = [
    "ATL","BOS","BKN","CHA","CHI","CLE","DAL","DEN","DET","GSW",
    "HOU","IND","LAC","LAL","MEM","MIA","MIL","MIN","NOP","NYK",
    "OKC","ORL","PHI","PHX","POR","SAC","SAS","TOR","UTA","WAS"
  ];
  // Map from file abbreviations
  const fileToStd: Record<string, string> = {
    "BOS": "BOS", "NY": "NYK", "TOR": "TOR", "PHI": "PHI", "BKN": "BKN",
    "DET": "DET", "CLE": "CLE", "CHI": "CHI", "MIL": "MIL", "IND": "IND",
    "ORL": "ORL", "MIA": "MIA", "CHA": "CHA", "ATL": "ATL", "WAS": "WAS",
    "SA": "SAS", "HOU": "HOU", "MEM": "MEM", "DAL": "DAL", "NO": "NOP",
    "OKC": "OKC", "DEN": "DEN", "MIN": "MIN", "POR": "POR", "UTA": "UTA",
    "LAL": "LAL", "PHO": "PHX", "GS": "GSW", "LAC": "LAC", "SAC": "SAC",
  };

  for (const line of lines) {
    // Match team rows: ABBR num num num ... W L PCT GB LAST-10 STREAK
    const match = line.match(/^(\w{2,3})\s+([\d\s-]+\d)\s+(\d+)\s+(\d+)\s+(\.\d+)/);
    if (!match) continue;

    const teamAbbr = fileToStd[match[1]] || match[1];
    const numsStr = match[2].trim();
    const nums = numsStr.split(/\s+/).map(n => n === "--" ? -1 : parseInt(n) || 0);

    // Build h2h record
    const h2h: Record<string, number> = {};
    for (let i = 0; i < Math.min(nums.length, teamCols.length); i++) {
      if (nums[i] >= 0 && teamCols[i] !== teamAbbr) {
        h2h[teamCols[i]] = nums[i];
      }
    }

    const { error } = await sb.from("nba_standings").upsert(
      { team_abbr: teamAbbr, season: 2026, h2h_record: h2h },
      { onConflict: "team_abbr,season,snapshot_date" }
    );
    if (error) errors.push(`${teamAbbr}: ${error.message}`);
    else upserted++;
  }

  return { upserted, errors: errors.slice(0, 10) };
}

// ─── RATIOS (ratios_teams.txt + ratios_players.txt) ─────────────
async function importRatios(sb: any, txt: string) {
  const lines = txt.split(/\r?\n/);
  let teamUpserted = 0;
  const errors: string[] = [];

  // Check if this is team ratios or player ratios
  const isPlayerRatios = lines.some(l => l.includes(",") && l.match(/\w+,\s*\w+/));

  if (!isPlayerRatios) {
    // Team ratios
    let section = "";
    const teamData = new Map<string, any>();

    for (const line of lines) {
      if (line.includes("Assists Per Turnover")) { section = "ast"; continue; }
      if (line.includes("Steals Per Turnover")) { section = "stl"; continue; }
      if (line.includes("Name") && line.includes("RATIO")) continue;
      if (!line.trim() || !section) continue;

      const match = line.match(/^(\S[\w\s.]+?)\s{2,}(\d+)\s+(\d+)\s+([\d.]+)/);
      if (!match) continue;

      const team = normTeam(match[1]);
      if (!team) continue;

      const existing = teamData.get(team) || { team_abbr: team, league: "NBA", season: 2026 };
      if (section === "ast") existing.ast_to_ratio = toNum(match[4]);
      if (section === "stl") existing.stl_to_ratio = toNum(match[4]);
      teamData.set(team, existing);
    }

    for (const [, data] of teamData) {
      const { error } = await sb.from("team_season_stats").upsert(data, { onConflict: "team_abbr,season,league" });
      if (error) errors.push(`${data.team_abbr}: ${error.message}`);
      else teamUpserted++;
    }
  }

  return { upserted: teamUpserted, errors: errors.slice(0, 10) };
}

// ─── DAY SCORES (day_scores.txt) ────────────────────────────────
async function importDayScores(sb: any, txt: string) {
  const lines = txt.split(/\r?\n/);
  let gamesUpdated = 0;
  let quartersInserted = 0;
  const errors: string[] = [];

  // Parse game pairs
  const gameLines: { team: string; total: number; q1: number; q2: number; q3: number; q4: number; ot?: number }[] = [];

  for (const line of lines) {
    // Match: TeamName TOT Q1 Q2 Q3 Q4 [OT]
    const match = line.match(/^(\S[\w\s.]+?)\s{2,}(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?\s/);
    if (!match) continue;

    const team = normTeam(match[1]);
    if (!team || team === "TEAM") continue;

    gameLines.push({
      team, total: parseInt(match[2]),
      q1: parseInt(match[3]), q2: parseInt(match[4]),
      q3: parseInt(match[5]), q4: parseInt(match[6]),
      ot: match[7] ? parseInt(match[7]) : undefined,
    });
  }

  // Process in pairs (home, away)
  for (let i = 0; i < gameLines.length - 1; i += 2) {
    const home = gameLines[i];
    const away = gameLines[i + 1];

    // Find the game in the database
    const { data: games } = await sb.from("games")
      .select("id")
      .eq("league", "NBA")
      .or(`and(home_abbr.eq.${home.team},away_abbr.eq.${away.team}),and(home_abbr.eq.${away.team},away_abbr.eq.${home.team})`)
      .gte("start_time", "2026-02-12")
      .lte("start_time", "2026-02-13T12:00:00")
      .limit(1);

    if (!games?.length) {
      errors.push(`Game not found: ${home.team} vs ${away.team}`);
      continue;
    }

    const gameId = games[0].id;

    // Update game scores
    const { error: gErr } = await sb.from("games").update({
      home_score: home.total, away_score: away.total, status: "final"
    }).eq("id", gameId);

    if (gErr) errors.push(`Score update ${home.team}: ${gErr.message}`);
    else gamesUpdated++;

    // Insert quarter scores
    for (let q = 1; q <= 4; q++) {
      const hScore = q === 1 ? home.q1 : q === 2 ? home.q2 : q === 3 ? home.q3 : home.q4;
      const aScore = q === 1 ? away.q1 : q === 2 ? away.q2 : q === 3 ? away.q3 : away.q4;
      const { error } = await sb.from("game_quarters").upsert(
        { game_id: gameId, quarter: q, home_score: hScore, away_score: aScore },
        { onConflict: "game_id,quarter" }
      );
      if (error && !errors.includes(error.message)) errors.push(`Q${q}: ${error.message}`);
      else quartersInserted++;
    }
  }

  return { games_updated: gamesUpdated, quarters_inserted: quartersInserted, errors: errors.slice(0, 10) };
}
