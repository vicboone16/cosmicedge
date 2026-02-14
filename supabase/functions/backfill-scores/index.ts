import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Map SDIO team keys to our abbreviations
const NFL_SDIO: Record<string, string> = {
  ARI: "ARI", ATL: "ATL", BAL: "BAL", BUF: "BUF", CAR: "CAR", CHI: "CHI",
  CIN: "CIN", CLE: "CLE", DAL: "DAL", DEN: "DEN", DET: "DET", GB: "GB",
  HOU: "HOU", IND: "IND", JAX: "JAX", KC: "KC", LV: "LV", LAC: "LAC",
  LAR: "LAR", MIA: "MIA", MIN: "MIN", NE: "NE", NO: "NO", NYG: "NYG",
  NYJ: "NYJ", PHI: "PHI", PIT: "PIT", SF: "SF", SEA: "SEA", TB: "TB",
  TEN: "TEN", WAS: "WAS",
};

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

    // ---------- NFL ----------
    if (leagues.includes("NFL")) {
      try {
        // Fetch all NFL games from DB that need scores
        const { data: nflGames } = await supabase
          .from("games")
          .select("id, external_id, start_time")
          .eq("league", "NFL")
          .eq("status", "scheduled")
          .lt("start_time", new Date().toISOString())
          .not("external_id", "is", null);

        log.push(`NFL: ${nflGames?.length || 0} past games need scores`);

        if (nflGames && nflGames.length > 0) {
          // Fetch scores by season (2024 REG + POST)
          const seasons = ["2024REG", "2024POST"];
          const sdioGames: Record<string, any> = {};

          for (const season of seasons) {
            const url = `https://api.sportsdata.io/v3/nfl/scores/json/Scores/${season}?key=${sportsDataKey}`;
            const resp = await fetch(url);
            if (resp.ok) {
              const data = await resp.json();
              for (const g of data) {
                sdioGames[String(g.GameKey || g.GlobalGameID)] = g;
                sdioGames[String(g.GlobalGameID)] = g;
                sdioGames[String(g.ScoreID)] = g;
              }
              log.push(`NFL ${season}: fetched ${data.length} games from SDIO`);
            } else {
              log.push(`NFL ${season}: SDIO error ${resp.status}`);
              await resp.text();
            }
            await new Promise(r => setTimeout(r, 1200));
          }

          let nflUpdated = 0;
          for (const game of nflGames) {
            const sdio = sdioGames[game.external_id];
            if (sdio && (sdio.Status === "Final" || sdio.Status === "F/OT")) {
              const { error } = await supabase
                .from("games")
                .update({
                  home_score: sdio.HomeScore ?? sdio.HomeTeamScore,
                  away_score: sdio.AwayScore ?? sdio.AwayTeamScore,
                  status: "final",
                })
                .eq("id", game.id);
              if (!error) nflUpdated++;
            }
          }
          totalUpdated += nflUpdated;
          log.push(`NFL: updated ${nflUpdated} games with final scores`);
        }
      } catch (e) {
        log.push(`NFL error: ${e.message}`);
      }
    }

    // ---------- NHL ----------
    if (leagues.includes("NHL")) {
      try {
        const { data: nhlGames } = await supabase
          .from("games")
          .select("id, external_id, start_time")
          .eq("league", "NHL")
          .eq("status", "scheduled")
          .lt("start_time", new Date().toISOString())
          .not("external_id", "is", null);

        log.push(`NHL: ${nhlGames?.length || 0} past games need scores`);

        if (nhlGames && nhlGames.length > 0) {
          // NHL uses season endpoint
          const url = `https://api.sportsdata.io/v3/nhl/scores/json/Games/2025?key=${sportsDataKey}`;
          const resp = await fetch(url);
          if (resp.ok) {
            const data = await resp.json();
            const sdioMap: Record<string, any> = {};
            for (const g of data) {
              sdioMap[String(g.GameID)] = g;
              sdioMap[String(g.GlobalGameID)] = g;
            }
            log.push(`NHL: fetched ${data.length} games from SDIO`);

            let nhlUpdated = 0;
            for (const game of nhlGames) {
              const sdio = sdioMap[game.external_id];
              if (sdio && (sdio.Status === "Final" || sdio.Status === "F/OT" || sdio.Status === "F/SO")) {
                const { error } = await supabase
                  .from("games")
                  .update({
                    home_score: sdio.HomeTeamScore,
                    away_score: sdio.AwayTeamScore,
                    status: "final",
                  })
                  .eq("id", game.id);
                if (!error) nhlUpdated++;
              }
            }
            totalUpdated += nhlUpdated;
            log.push(`NHL: updated ${nhlUpdated} games with final scores`);
          } else {
            log.push(`NHL SDIO error: ${resp.status}`);
            await resp.text();
          }
        }
      } catch (e) {
        log.push(`NHL error: ${e.message}`);
      }
    }

    // ---------- MLB ----------
    if (leagues.includes("MLB")) {
      try {
        const { data: mlbGames } = await supabase
          .from("games")
          .select("id, external_id, start_time")
          .eq("league", "MLB")
          .eq("status", "scheduled")
          .lt("start_time", new Date().toISOString())
          .not("external_id", "is", null);

        log.push(`MLB: ${mlbGames?.length || 0} past games need scores`);

        if (mlbGames && mlbGames.length > 0) {
          const url = `https://api.sportsdata.io/v3/mlb/scores/json/Games/2025?key=${sportsDataKey}`;
          const resp = await fetch(url);
          if (resp.ok) {
            const data = await resp.json();
            const sdioMap: Record<string, any> = {};
            for (const g of data) {
              sdioMap[String(g.GameID)] = g;
              sdioMap[String(g.GlobalGameID)] = g;
            }
            log.push(`MLB: fetched ${data.length} games from SDIO`);

            let mlbUpdated = 0;
            for (const game of mlbGames) {
              const sdio = sdioMap[game.external_id];
              if (sdio && (sdio.Status === "Final" || sdio.Status === "F")) {
                const { error } = await supabase
                  .from("games")
                  .update({
                    home_score: sdio.HomeTeamRuns ?? sdio.HomeTeamScore,
                    away_score: sdio.AwayTeamRuns ?? sdio.AwayTeamScore,
                    status: "final",
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
      } catch (e) {
        log.push(`MLB error: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, updated: totalUpdated, log }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
