// bdl-backfill-multi-league — Backfill final scores + period scores for NHL, MLB, NCAAB via BDL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BDL_BASE = "https://api.balldontlie.io";

// BDL league path segments
const LEAGUE_PATH: Record<string, string> = {
  NHL: "nhl",
  MLB: "mlb",
  NCAAB: "ncaab",
  NBA: "nba",
};

// BDL abbreviation normalization per league
const BDL_ABBR_NORMALIZE: Record<string, Record<string, string>> = {
  NHL: {
    NJ: "NJD", TB: "TBL", LA: "LAK", SJ: "SJS", VEG: "VGK", WAS: "WSH", MON: "MTL",
  },
  MLB: {
    CWS: "CHW", SD: "SDP", SF: "SFG", TB: "TBR", WSH: "WSN", WAS: "WSN",
    KC: "KCR",
  },
  NCAAB: {},
  NBA: {},
};

function normAbbr(league: string, abbr: string): string {
  if (!abbr) return abbr;
  const raw = abbr.trim().toUpperCase();
  return BDL_ABBR_NORMALIZE[league]?.[raw] || raw;
}

// Extract period scores from BDL game object per league
interface PeriodScore { quarter: number; home_score: number; away_score: number }

function extractPeriodScores(league: string, g: any): PeriodScore[] {
  const periods: PeriodScore[] = [];

  if (league === "NHL") {
    // NHL: 3 periods + optional OT/SO
    const pairs = [
      [1, g.home_p1, g.visitor_p1],
      [2, g.home_p2, g.visitor_p2],
      [3, g.home_p3, g.visitor_p3],
      [4, g.home_ot, g.visitor_ot],
    ];
    for (const [q, h, a] of pairs) {
      if (h != null && a != null) periods.push({ quarter: q as number, home_score: h as number, away_score: a as number });
    }
  } else if (league === "MLB") {
    // MLB: up to 9+ innings
    for (let i = 1; i <= 15; i++) {
      const h = g[`home_i${i}`] ?? g[`home_inning_${i}`];
      const a = g[`visitor_i${i}`] ?? g[`visitor_inning_${i}`] ?? g[`away_i${i}`];
      if (h != null && a != null) periods.push({ quarter: i, home_score: h, away_score: a });
    }
  } else if (league === "NCAAB") {
    // NCAAB: 2 halves + optional OT
    const pairs = [
      [1, g.home_h1, g.visitor_h1],
      [2, g.home_h2, g.visitor_h2],
      [3, g.home_ot, g.visitor_ot],
      [4, g.home_ot2, g.visitor_ot2],
    ];
    for (const [q, h, a] of pairs) {
      if (h != null && a != null) periods.push({ quarter: q as number, home_score: h as number, away_score: a as number });
    }
  } else {
    // NBA fallback
    const pairs = [
      [1, g.home_q1, g.visitor_q1],
      [2, g.home_q2, g.visitor_q2],
      [3, g.home_q3, g.visitor_q3],
      [4, g.home_q4, g.visitor_q4],
    ];
    for (const [q, h, a] of pairs) {
      if (h != null && a != null) periods.push({ quarter: q as number, home_score: h as number, away_score: a as number });
    }
  }

  return periods;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const BDL_KEY = (Deno.env.get("BALLDONTLIE_KEY") || "").trim().replace(/^Bearer\s+/i, "");
    if (!BDL_KEY) throw new Error("BALLDONTLIE_KEY not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const hdrs = { Authorization: `Bearer ${BDL_KEY}`, "X-Api-Key": BDL_KEY };

    const url = new URL(req.url);
    const leaguesParam = url.searchParams.get("leagues") || "NHL,MLB,NCAAB";
    const leagues = leaguesParam.split(",").map(l => l.trim().toUpperCase());
    const seasonParam = url.searchParams.get("season"); // optional override

    const log: string[] = [];
    const stats = { total_games_updated: 0, total_periods_upserted: 0, leagues: {} as Record<string, { games: number; periods: number }> };

    // Determine season start/end based on league
    function getSeasonDates(league: string): { start: string; end: string; season: number } {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      if (league === "MLB") {
        // MLB: season runs ~Feb-Oct within same year
        const seasonYear = seasonParam ? parseInt(seasonParam) : year;
        return { start: `${seasonYear}-02-01`, end: `${seasonYear}-11-30`, season: seasonYear };
      }
      if (league === "NCAAB") {
        // NCAAB: Nov-Apr
        const seasonYear = seasonParam ? parseInt(seasonParam) : (month >= 8 ? year : year - 1);
        return { start: `${seasonYear}-11-01`, end: `${seasonYear + 1}-04-30`, season: seasonYear };
      }
      // NHL: Oct-Jun
      const seasonYear = seasonParam ? parseInt(seasonParam) : (month >= 8 ? year : year - 1);
      return { start: `${seasonYear}-10-01`, end: `${seasonYear + 1}-06-30`, season: seasonYear };
    }

    for (const league of leagues) {
      const pathSeg = LEAGUE_PATH[league];
      if (!pathSeg) {
        log.push(`⚠ Unknown league: ${league}`);
        continue;
      }

      stats.leagues[league] = { games: 0, periods: 0 };
      const { start, end, season } = getSeasonDates(league);
      log.push(`\n═══ ${league} (season ${season}, ${start} → ${end}) ═══`);

      // 1. Get all DB games for this league that are still "scheduled" and in the past
      const { data: dbGames } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time, status, external_id")
        .eq("league", league)
        .in("status", ["scheduled", "in_progress", "live"])
        .lt("start_time", new Date().toISOString())
        .gte("start_time", start + "T00:00:00Z")
        .lte("start_time", end + "T23:59:59Z")
        .order("start_time", { ascending: true });

      if (!dbGames || dbGames.length === 0) {
        log.push(`  No pending games found`);
        continue;
      }
      log.push(`  ${dbGames.length} DB games need scores`);

      // 2. Fetch BDL games for the season in date chunks (BDL paginates, max ~100 per page)
      const bdlGames: any[] = [];
      const chunkSize = 7; // fetch 7 days at a time
      let cursor = new Date(start + "T00:00:00Z");
      const endDate = new Date(end + "T23:59:59Z");
      const today = new Date();
      if (endDate > today) endDate.setTime(today.getTime());

      while (cursor <= endDate) {
        const dates: string[] = [];
        for (let d = 0; d < chunkSize && cursor <= endDate; d++) {
          dates.push(cursor.toISOString().split("T")[0]);
          cursor.setDate(cursor.getDate() + 1);
        }

        const dateParams = dates.map(d => `dates[]=${d}`).join("&");
        try {
          let page = 1;
          let hasMore = true;
          while (hasMore) {
            const apiUrl = `${BDL_BASE}/${pathSeg}/v1/games?${dateParams}&per_page=100&page=${page}`;
            const res = await fetch(apiUrl, { headers: hdrs });
            
            if (res.status === 429) {
              log.push(`  ⚠ Rate limited, waiting 30s...`);
              await new Promise(r => setTimeout(r, 30000));
              continue;
            }
            if (!res.ok) {
              log.push(`  ⚠ BDL ${league} games ${res.status} for ${dates[0]}`);
              break;
            }

            const data = await res.json();
            const items = data.data || [];
            bdlGames.push(...items);
            
            // Check pagination
            const meta = data.meta;
            if (meta && meta.next_cursor) {
              page++;
            } else {
              hasMore = false;
            }
          }
        } catch (e: any) {
          log.push(`  ⚠ Fetch error: ${e.message}`);
        }

        // Small delay between chunks
        await new Promise(r => setTimeout(r, 300));
      }

      log.push(`  Fetched ${bdlGames.length} BDL games`);

      // Filter to final games only
      const finalBdl = bdlGames.filter(g => {
        const s = (g.status || "").toLowerCase();
        return s === "final" || s.startsWith("final") || s === "f" || s === "f/ot" || s === "f/so";
      });
      log.push(`  ${finalBdl.length} are final`);

      // 3. Match BDL games to DB games and update
      for (const dbGame of dbGames) {
        const dbDate = dbGame.start_time.split("T")[0];
        const dbDateObj = new Date(dbDate + "T00:00:00Z");

        const match = finalBdl.find(bg => {
          const bgHome = normAbbr(league, bg.home_team?.abbreviation || "");
          const bgAway = normAbbr(league, bg.visitor_team?.abbreviation || "");
          if (bgHome !== dbGame.home_abbr || bgAway !== dbGame.away_abbr) return false;
          // Date match ±2 days
          const bgDate = new Date((bg.date || "").split("T")[0] + "T00:00:00Z");
          return Math.abs(bgDate.getTime() - dbDateObj.getTime()) < 2 * 86400000;
        });

        if (!match) continue;

        const homeScore = match.home_team_score ?? match.home_score;
        const awayScore = match.visitor_team_score ?? match.visitor_score ?? match.away_team_score;

        if (homeScore == null || awayScore == null) continue;

        // Update game scores
        const { error: updateErr } = await supabase.from("games").update({
          home_score: homeScore,
          away_score: awayScore,
          status: "final",
          updated_at: new Date().toISOString(),
        }).eq("id", dbGame.id);

        if (updateErr) {
          log.push(`  ✗ ${dbGame.away_abbr}@${dbGame.home_abbr}: ${updateErr.message}`);
          continue;
        }

        stats.total_games_updated++;
        stats.leagues[league].games++;

        // Extract and upsert period scores
        const periods = extractPeriodScores(league, match);
        if (periods.length > 0) {
          for (const p of periods) {
            await supabase.from("game_quarters").upsert({
              game_id: dbGame.id,
              quarter: p.quarter,
              home_score: p.home_score,
              away_score: p.away_score,
            }, { onConflict: "game_id,quarter" });
          }
          stats.total_periods_upserted += periods.length;
          stats.leagues[league].periods += periods.length;
          log.push(`  ✅ ${dbGame.away_abbr}@${dbGame.home_abbr}: ${homeScore}-${awayScore} (${periods.length} periods)`);
        } else {
          log.push(`  ✅ ${dbGame.away_abbr}@${dbGame.home_abbr}: ${homeScore}-${awayScore} (no period data)`);
        }
      }

      log.push(`  ${league} done: ${stats.leagues[league].games} games, ${stats.leagues[league].periods} periods`);
    }

    log.push(`\n═══ TOTAL: ${stats.total_games_updated} games, ${stats.total_periods_upserted} periods ═══`);
    console.log(`[bdl-multi] Done:`, JSON.stringify(stats));

    return new Response(JSON.stringify({ ok: true, stats, log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[bdl-multi] Fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
