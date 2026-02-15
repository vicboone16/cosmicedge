import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Basketball Reference abbreviation → our DB abbreviation
const BREF_TO_ABBR: Record<string, string> = {
  ATL: "ATL", BOS: "BOS", BRK: "BKN", CHI: "CHI", CHO: "CHA", CLE: "CLE",
  DAL: "DAL", DEN: "DEN", DET: "DET", GSW: "GSW", HOU: "HOU", IND: "IND",
  LAC: "LAC", LAL: "LAL", MEM: "MEM", MIA: "MIA", MIL: "MIL", MIN: "MIN",
  NOP: "NOP", NYK: "NYK", OKC: "OKC", ORL: "ORL", PHI: "PHI", PHO: "PHX",
  PHX: "PHX", POR: "POR", SAC: "SAC", SAS: "SAS", TOR: "TOR", UTA: "UTA",
  WAS: "WAS",
};

const ABBR_TO_FULL: Record<string, string> = {
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons",
  GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
  LAC: "Los Angeles Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
  MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
};

const FILENAME_TO_ABBR: Record<string, string> = {
  atlanta_hawks: "ATL", boston_celtics: "BOS", brooklyn_nets: "BKN",
  charlotte_hornets: "CHA", chicago_bulls: "CHI", cleveland_cavaliers: "CLE",
  dallas_mavericks: "DAL", denver_nuggets: "DEN", detroit_pistons: "DET",
  golden_state_warriors: "GSW", houston_rockets: "HOU", indiana_pacers: "IND",
  la_clippers: "LAC", los_angeles_clippers: "LAC", la_lakers: "LAL",
  los_angeles_lakers: "LAL", memphis_grizzlies: "MEM", miami_heat: "MIA",
  milwaukee_bucks: "MIL", minnesota_timberwolves: "MIN",
  new_orleans_pelicans: "NOP", new_york_knicks: "NYK",
  oklahoma_city_thunder: "OKC", orlando_magic: "ORL",
  philadelphia_76ers: "PHI", phoenix_suns: "PHX",
  portland_trail_blazers: "POR", sacramento_kings: "SAC",
  san_antonio_spurs: "SAS", toronto_raptors: "TOR", utah_jazz: "UTA",
  washington_wizards: "WAS", was: "WAS",
};

function num(v: string | undefined | null): number | null {
  if (!v || v === "") return null;
  const cleaned = v.replace(/[%,]/g, "");
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

function parseHtmlTable(html: string): Record<string, string>[] {
  // Parse BOTH basic (team_game_log_reg) and advanced (team_game_log_adv_reg) tables
  // and merge them by game number (ranker)

  const parseRows = (regex: RegExp): Map<string, Record<string, string>> => {
    const map = new Map<string, Record<string, string>>();
    let trMatch;
    while ((trMatch = regex.exec(html)) !== null) {
      const trContent = trMatch[1];
      const row: Record<string, string> = {};

      const cellRegex = /data-stat="([^"]+)"(?:\s+csk="([^"]*)")?[^>]*>([^<]*)/g;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(trContent)) !== null) {
        const statName = cellMatch[1];
        const cskVal = cellMatch[2];
        const displayVal = cellMatch[3].trim();
        row[statName] = cskVal || displayVal;
      }

      if (row.ranker && row.date) {
        map.set(row.ranker, row);
      }
    }
    return map;
  };

  // Log all tr IDs found in the HTML for debugging
  const allTrIds = [...html.matchAll(/<tr\s+id="([^"]+)"/g)].map(m => m[1]);
  const uniquePrefixes = [...new Set(allTrIds.map(id => id.replace(/\.\d+$/, "")))];
  console.log(`[parseHtmlTable] Found tr id prefixes: ${uniquePrefixes.join(", ")}`);

  // Basic stats table — try multiple possible ID patterns
  const basicRegex = /<tr\s+id="(?:team_game_log_reg|tgl_basic|team_and_opponent)\.\d+"[^>]*>([\s\S]*?)<\/tr>/g;
  const basicMap = parseRows(basicRegex);

  // If basic didn't match, try matching ALL non-advanced game log rows
  if (basicMap.size === 0) {
    // Try any tr with an id containing a dot and number that ISN'T the advanced table
    const fallbackRegex = /<tr\s+id="(?!team_game_log_adv)[a-z_]+\.\d+"[^>]*>([\s\S]*?)<\/tr>/g;
    const fallbackMap = parseRows(fallbackRegex);
    console.log(`[parseHtmlTable] fallback basic parse found ${fallbackMap.size} rows`);
    for (const [k, v] of fallbackMap) basicMap.set(k, v);
  }

  // Advanced stats table: id="team_game_log_adv_reg.X"
  const advRegex = /<tr\s+id="team_game_log_adv[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
  const advMap = parseRows(advRegex);

  // Merge: start with basic, overlay advanced
  const merged: Record<string, string>[] = [];
  const allKeys = new Set([...basicMap.keys(), ...advMap.keys()]);

  for (const key of allKeys) {
    const basic = basicMap.get(key) || {};
    const adv = advMap.get(key) || {};
    const combined = { ...basic, ...adv };
    if (combined.date) merged.push(combined);
  }

  console.log(`[parseHtmlTable] basic=${basicMap.size}, adv=${advMap.size}, merged=${merged.length}`);
  return merged;
}

function detectTeamFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  for (const [pattern, abbr] of Object.entries(FILENAME_TO_ABBR)) {
    if (lower.includes(pattern)) return abbr;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { html_content, team_abbr: providedAbbr, filename } = body;

    console.log(`[import-team-gamelog] filename=${filename}, team_abbr=${providedAbbr}, html_length=${html_content?.length || 0}`);

    if (!html_content) {
      return new Response(
        JSON.stringify({ success: false, error: "No html_content provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const teamAbbr = providedAbbr || detectTeamFromFilename(filename || "");
    console.log(`[import-team-gamelog] detected team: ${teamAbbr}`);
    if (!teamAbbr || !ABBR_TO_FULL[teamAbbr]) {
      return new Response(
        JSON.stringify({ success: false, error: `Cannot detect team from filename "${filename}". Provide team_abbr.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const teamFull = ABBR_TO_FULL[teamAbbr];
    const gameRows = parseHtmlTable(html_content);
    console.log(`[import-team-gamelog] parsed ${gameRows.length} game rows`);

    if (gameRows.length === 0) {
      // Log a sample of the HTML to debug
      console.log(`[import-team-gamelog] HTML sample (first 500 chars): ${html_content.substring(0, 500)}`);
      return new Response(
        JSON.stringify({ success: false, error: "No game rows found in HTML" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of gameRows) {
      try {
        const gameDate = row.date;
        const isAway = row.game_location === "@";
        const oppBref = row.opp_name_abbr;
        const oppAbbr = BREF_TO_ABBR[oppBref];
        if (!oppAbbr) {
          errors.push(`Unknown opponent: ${oppBref}`);
          skipped++;
          continue;
        }

        const homeAbbr = isAway ? oppAbbr : teamAbbr;
        const awayAbbr = isAway ? teamAbbr : oppAbbr;

        // Find matching game in DB by date + teams
        const dateStart = `${gameDate}T00:00:00Z`;
        const dateEnd = `${gameDate}T23:59:59Z`;

        const { data: matchingGames } = await supabase
          .from("games")
          .select("id")
          .eq("league", "NBA")
          .eq("home_abbr", homeAbbr)
          .eq("away_abbr", awayAbbr)
          .gte("start_time", dateStart)
          .lte("start_time", dateEnd)
          .limit(1);

        let gameId: string;

        if (matchingGames && matchingGames.length > 0) {
          gameId = matchingGames[0].id;

          // Update scores on the game
          const teamScore = num(row.team_game_score);
          const oppScore = num(row.opp_team_game_score);
          if (teamScore !== null && oppScore !== null) {
            const homeScore = isAway ? oppScore : teamScore;
            const awayScore = isAway ? teamScore : oppScore;
            const ot = row.overtimes && row.overtimes !== "" ? row.overtimes : null;
            await supabase.from("games").update({
              home_score: homeScore,
              away_score: awayScore,
              status: ot ? `Final/${ot}` : "Final",
            }).eq("id", gameId);
          }
        } else {
          // Create the game
          const oppFull = ABBR_TO_FULL[oppAbbr] || oppAbbr;
          const homeFull = isAway ? oppFull : teamFull;
          const awayFull = isAway ? teamFull : oppFull;
          const teamScore = num(row.team_game_score);
          const oppScore = num(row.opp_team_game_score);
          const ot = row.overtimes && row.overtimes !== "" ? row.overtimes : null;

          const { data: newGame, error: insertErr } = await supabase.from("games").insert({
            league: "NBA",
            home_team: homeFull,
            away_team: awayFull,
            home_abbr: homeAbbr,
            away_abbr: awayAbbr,
            start_time: `${gameDate}T19:00:00Z`,
            status: ot ? `Final/${ot}` : "Final",
            home_score: isAway ? oppScore : teamScore,
            away_score: isAway ? teamScore : oppScore,
            source: "bref",
          }).select("id").single();

          if (insertErr) {
            errors.push(`Game ${gameDate} ${awayAbbr}@${homeAbbr}: ${insertErr.message}`);
            skipped++;
            continue;
          }
          gameId = newGame.id;
        }

        // Check if team_game_stats already exists
        const { data: existingStat } = await supabase
          .from("team_game_stats")
          .select("id")
          .eq("game_id", gameId)
          .eq("team_abbr", teamAbbr)
          .limit(1);

        // Map Basketball Reference data-stat names to our columns
        // csk values are raw decimals (e.g., 0.478 for eFG%), display values vary
        // For percentages stored as decimals in csk, multiply by 100 for our schema
        const statRow: Record<string, unknown> = {
          game_id: gameId,
          team_abbr: teamAbbr,
          is_home: !isAway,
          points: num(row.team_game_score) ?? num(row.pts),
          // Basic box score stats (from team_game_log_reg table)
          fg_made: num(row.fg),
          fg_attempted: num(row.fga),
          three_made: num(row.fg3),
          three_attempted: num(row.fg3a),
          ft_made: num(row.ft),
          ft_attempted: num(row.fta),
          off_rebounds: num(row.orb),
          def_rebounds: num(row.drb),
          rebounds: num(row.trb),
          assists: num(row.ast),
          steals: num(row.stl),
          blocks: num(row.blk),
          turnovers: num(row.tov),
          // Advanced stats (from team_game_log_adv_reg table)
          off_rating: num(row.team_off_rtg),
          def_rating: num(row.team_def_rtg),
          pace: num(row.pace),
          ts_pct: num(row.ts_pct),
          ftr: num(row.fta_per_fga_pct),
          three_par: num(row.fg3a_per_fga_pct),
          trb_pct: num(row.team_trb_pct),
          ast_pct: num(row.team_ast_pct),
          stl_pct: num(row.team_stl_pct),
          blk_pct: num(row.team_blk_pct),
          efg_pct: num(row.efg_pct),
          tov_pct: num(row.team_tov_pct),
          orb_pct: num(row.team_orb_pct),
          ft_per_fga: num(row.ft_rate),
          opp_efg_pct: num(row.opp_efg_pct),
          opp_tov_pct: num(row.opp_tov_pct),
          opp_orb_pct: num(row.opp_orb_pct),
          opp_ft_per_fga: num(row.opp_ft_rate),
          overtimes: (row.overtimes && row.overtimes !== "") ? row.overtimes : null,
          source: "bref",
        };

        if (existingStat && existingStat.length > 0) {
          const { error } = await supabase
            .from("team_game_stats")
            .update(statRow)
            .eq("id", existingStat[0].id);
          if (error) errors.push(`Update stats ${gameDate}: ${error.message}`);
          else inserted++;
        } else {
          const { error } = await supabase.from("team_game_stats").insert(statRow);
          if (error) errors.push(`Insert stats ${gameDate}: ${error.message}`);
          else inserted++;
        }
      } catch (e) {
        errors.push(`Row error: ${e.message}`);
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, inserted, skipped, total: gameRows.length, errors: errors.slice(0, 20) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
