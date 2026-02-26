import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// SDIO team abbreviation maps
const NHL_SDIO: Record<string, string> = {
  ANA: "ANA", ARI: "ARI", BOS: "BOS", BUF: "BUF", CGY: "CGY", CAR: "CAR",
  CHI: "CHI", COL: "COL", CBJ: "CBJ", DAL: "DAL", DET: "DET", EDM: "EDM",
  FLA: "FLA", LAK: "LAK", MIN: "MIN", MTL: "MTL", NSH: "NSH", NJD: "NJD",
  NYI: "NYI", NYR: "NYR", OTT: "OTT", PHI: "PHI", PIT: "PIT", SJS: "SJS",
  SEA: "SEA", STL: "STL", TBL: "TBL", TOR: "TOR", UTA: "UTA", VAN: "VAN",
  VGK: "VGK", WPG: "WPG", WSH: "WSH",
  // SDIO aliases
  "TB": "TBL", "SJ": "SJS", "VEG": "VGK", "WAS": "WSH", "LA": "LAK",
  "NJ": "NJD", "NY": "NYR", "NYR": "NYR",
};

const NFL_SDIO: Record<string, string> = {
  ARI: "ARI", ATL: "ATL", BAL: "BAL", BUF: "BUF", CAR: "CAR", CHI: "CHI",
  CIN: "CIN", CLE: "CLE", DAL: "DAL", DEN: "DEN", DET: "DET", GB: "GB",
  HOU: "HOU", IND: "IND", JAX: "JAX", KC: "KC", LV: "LV", LAC: "LAC",
  LAR: "LAR", MIA: "MIA", MIN: "MIN", NE: "NE", NO: "NO", NYG: "NYG",
  NYJ: "NYJ", PHI: "PHI", PIT: "PIT", SF: "SF", SEA: "SEA", TB: "TB",
  TEN: "TEN", WAS: "WAS",
};

function normalizeAbbr(league: string, sdioAbbr: string): string {
  if (league === "NHL") return NHL_SDIO[sdioAbbr] || sdioAbbr;
  if (league === "NFL") return NFL_SDIO[sdioAbbr] || sdioAbbr;
  return sdioAbbr;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sportsDataKey = Deno.env.get("SPORTSDATAIO_API_KEY");
    if (!sportsDataKey) throw new Error("SPORTSDATAIO_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const leagues = body.leagues || ["NFL", "NHL", "MLB"];
    const log: string[] = [];
    let totalUpdated = 0;

    // Helper: match SDIO game to DB game by team abbr + date (±1 day)
    const matchByTeamDate = (
      dbGames: { id: string; home_abbr: string; away_abbr: string; start_time: string }[],
      sdioHomeAbbr: string,
      sdioAwayAbbr: string,
      sdioDateStr: string,
      league: string
    ) => {
      const homeNorm = normalizeAbbr(league, sdioHomeAbbr);
      const awayNorm = normalizeAbbr(league, sdioAwayAbbr);
      const sdioDate = new Date(sdioDateStr);

      return dbGames.find(g => {
        if (g.home_abbr !== homeNorm || g.away_abbr !== awayNorm) return false;
        const dbDate = new Date(g.start_time);
        const diffMs = Math.abs(dbDate.getTime() - sdioDate.getTime());
        return diffMs < 2 * 24 * 60 * 60 * 1000; // ±2 days
      });
    };

    // ---------- NFL ----------
    if (leagues.includes("NFL")) {
      try {
        const { data: nflGames } = await supabase
          .from("games")
          .select("id, external_id, start_time, home_abbr, away_abbr")
          .eq("league", "NFL")
          .eq("status", "scheduled")
          .lt("start_time", new Date().toISOString());

        log.push(`NFL: ${nflGames?.length || 0} past games need scores`);

        if (nflGames && nflGames.length > 0) {
          const seasons = ["2024REG", "2024POST", "2025REG"];
          const sdioGames: any[] = [];

          for (const season of seasons) {
            const url = `https://api.sportsdata.io/v3/nfl/scores/json/Scores/${season}?key=${sportsDataKey}`;
            const resp = await fetch(url);
            if (resp.ok) {
              const data = await resp.json();
              sdioGames.push(...data);
              log.push(`NFL ${season}: fetched ${data.length} games from SDIO`);
            } else {
              log.push(`NFL ${season}: SDIO error ${resp.status}`);
              await resp.text();
            }
            await new Promise(r => setTimeout(r, 1200));
          }

          // Build lookup by external_id
          const sdioById: Record<string, any> = {};
          for (const g of sdioGames) {
            sdioById[String(g.GameKey || "")] = g;
            sdioById[String(g.GlobalGameID || "")] = g;
            sdioById[String(g.ScoreID || "")] = g;
          }

          let nflUpdated = 0;
          for (const game of nflGames) {
            // Try external_id match first, then team+date fallback
            let sdio = game.external_id ? sdioById[game.external_id] : null;
            if (!sdio) {
              for (const sg of sdioGames) {
                if ((sg.Status === "Final" || sg.Status === "F/OT") &&
                    normalizeAbbr("NFL", sg.HomeTeam) === game.home_abbr &&
                    normalizeAbbr("NFL", sg.AwayTeam) === game.away_abbr) {
                  const diffMs = Math.abs(new Date(game.start_time).getTime() - new Date(sg.DateTime || sg.Day).getTime());
                  if (diffMs < 2 * 24 * 60 * 60 * 1000) { sdio = sg; break; }
                }
              }
            }

            if (sdio && (sdio.Status === "Final" || sdio.Status === "F/OT")) {
              const { error } = await supabase
                .from("games")
                .update({
                  home_score: sdio.HomeScore ?? sdio.HomeTeamScore,
                  away_score: sdio.AwayScore ?? sdio.AwayTeamScore,
                  status: "final",
                  external_id: String(sdio.GlobalGameID || sdio.GameKey || game.external_id),
                })
                .eq("id", game.id);
              if (!error) nflUpdated++;
            }
          }
          totalUpdated += nflUpdated;
          log.push(`NFL: updated ${nflUpdated} games with final scores`);
        }
      } catch (e: any) {
        log.push(`NFL error: ${e.message}`);
      }
    }

    // ---------- NHL ----------
    if (leagues.includes("NHL")) {
      try {
        const { data: nhlGames } = await supabase
          .from("games")
          .select("id, external_id, start_time, home_abbr, away_abbr")
          .eq("league", "NHL")
          .eq("status", "scheduled")
          .lt("start_time", new Date().toISOString());

        log.push(`NHL: ${nhlGames?.length || 0} past games need scores`);

        if (nhlGames && nhlGames.length > 0) {
          const url = `https://api.sportsdata.io/v3/nhl/scores/json/Games/2025?key=${sportsDataKey}`;
          const resp = await fetch(url);
          if (resp.ok) {
            const sdioGames = await resp.json();
            log.push(`NHL: fetched ${sdioGames.length} games from SDIO`);

            // Build lookup by ID
            const sdioById: Record<string, any> = {};
            for (const g of sdioGames) {
              sdioById[String(g.GameID)] = g;
              sdioById[String(g.GlobalGameID)] = g;
            }

            let nhlUpdated = 0;
            for (const game of nhlGames) {
              // Try external_id match first
              let sdio = game.external_id ? sdioById[game.external_id] : null;

              // Fallback: match by team abbreviation + date
              if (!sdio) {
                for (const sg of sdioGames) {
                  if (sg.Status !== "Final" && sg.Status !== "F/OT" && sg.Status !== "F/SO") continue;
                  const sHome = normalizeAbbr("NHL", sg.HomeTeam);
                  const sAway = normalizeAbbr("NHL", sg.AwayTeam);
                  if (sHome !== game.home_abbr || sAway !== game.away_abbr) continue;
                  const diffMs = Math.abs(new Date(game.start_time).getTime() - new Date(sg.DateTime || sg.Day).getTime());
                  if (diffMs < 2 * 24 * 60 * 60 * 1000) { sdio = sg; break; }
                }
              }

              if (sdio && (sdio.Status === "Final" || sdio.Status === "F/OT" || sdio.Status === "F/SO")) {
                const { error } = await supabase
                  .from("games")
                  .update({
                    home_score: sdio.HomeTeamScore,
                    away_score: sdio.AwayTeamScore,
                    status: "final",
                    external_id: String(sdio.GlobalGameID || sdio.GameID || game.external_id),
                  })
                  .eq("id", game.id);
                if (!error) {
                  nhlUpdated++;
                  log.push(`NHL ✓ ${game.away_abbr}@${game.home_abbr}: ${sdio.AwayTeamScore}-${sdio.HomeTeamScore}`);
                }
              }
            }
            totalUpdated += nhlUpdated;
            log.push(`NHL: updated ${nhlUpdated} games with final scores`);
          } else {
            log.push(`NHL SDIO error: ${resp.status}`);
            await resp.text();
          }
        }
      } catch (e: any) {
        log.push(`NHL error: ${e.message}`);
      }
    }

    // ---------- MLB ----------
    if (leagues.includes("MLB")) {
      try {
        const { data: mlbGames } = await supabase
          .from("games")
          .select("id, external_id, start_time, home_abbr, away_abbr")
          .eq("league", "MLB")
          .eq("status", "scheduled")
          .lt("start_time", new Date().toISOString());

        log.push(`MLB: ${mlbGames?.length || 0} past games need scores`);

        if (mlbGames && mlbGames.length > 0) {
          const url = `https://api.sportsdata.io/v3/mlb/scores/json/Games/2025?key=${sportsDataKey}`;
          const resp = await fetch(url);
          if (resp.ok) {
            const sdioGames = await resp.json();
            log.push(`MLB: fetched ${sdioGames.length} games from SDIO`);

            const sdioById: Record<string, any> = {};
            for (const g of sdioGames) {
              sdioById[String(g.GameID)] = g;
              sdioById[String(g.GlobalGameID)] = g;
            }

            let mlbUpdated = 0;
            for (const game of mlbGames) {
              let sdio = game.external_id ? sdioById[game.external_id] : null;
              if (!sdio) {
                for (const sg of sdioGames) {
                  if (sg.Status !== "Final" && sg.Status !== "F") continue;
                  if (sg.HomeTeam === game.home_abbr && sg.AwayTeam === game.away_abbr) {
                    const diffMs = Math.abs(new Date(game.start_time).getTime() - new Date(sg.DateTime || sg.Day).getTime());
                    if (diffMs < 2 * 24 * 60 * 60 * 1000) { sdio = sg; break; }
                  }
                }
              }

              if (sdio && (sdio.Status === "Final" || sdio.Status === "F")) {
                const { error } = await supabase
                  .from("games")
                  .update({
                    home_score: sdio.HomeTeamRuns ?? sdio.HomeTeamScore,
                    away_score: sdio.AwayTeamRuns ?? sdio.AwayTeamScore,
                    status: "final",
                    external_id: String(sdio.GlobalGameID || sdio.GameID || game.external_id),
                  })
                  .eq("id", game.id);
                if (!error) mlbUpdated++;
              }
            }
            totalUpdated += mlbUpdated;
            log.push(`MLB: updated ${mlbUpdated} games with final scores`);
          } else {
            log.push(`MLB SDIO error: ${resp.status}`);
            await resp.text();
          }
        }
      } catch (e: any) {
        log.push(`MLB error: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, updated: totalUpdated, log }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
