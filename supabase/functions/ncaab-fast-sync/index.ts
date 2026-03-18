/**
 * ncaab-fast-sync: Fetches today's (and optionally yesterday's) NCAAB schedule
 * from API-Basketball and upserts into the games table.
 * Also sweeps stale "live" games older than 5h → "final".
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const API_BASKETBALL_BASE = "https://v1.basketball.api-sports.io";
const NCAAB_LEAGUE_ID = 116;
const STALE_HOURS = 5;

function mapStatus(short: string): string {
  switch (short) {
    case "Q1": case "Q2": case "Q3": case "Q4":
    case "OT": case "BT": case "HT": case "H1": case "H2":
      return "live";
    case "FT": case "AOT":
      return "final";
    case "NS":
      return "scheduled";
    default:
      return "scheduled";
  }
}

function generateTeamAbbr(teamName: string): string {
  if (!teamName) return "UNK";
  const cleaned = teamName
    .replace(/\s+(Wildcats|Bears|Tigers|Eagles|Bulldogs|Panthers|Lions|Hawks|Mustangs|Cougars|Knights|Wolves|Cardinals|Rams|Hornets|Owls|Bobcats|Terriers|Spartans|Crusaders|Miners|Aggies|Bison|Colonels|Dukes|Flames|Gaels|Governors|Greyhounds|Highlanders|Hoyas|Huskies|Jayhawks|Kangaroos|Leopards|Musketeers|Nittany Lions|Orangemen|Paladins|Quakers|Raiders|Seahawks|Thunderbirds|Utes|Vandals|Warriors|Zips)$/i, "")
    .trim();
  const words = cleaned.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  if (words.length === 2) return (words[0][0] + words[1].slice(0, 2)).toUpperCase();
  return words.map(w => w[0]).join("").toUpperCase().slice(0, 4);
}

async function fetchGamesForDate(apiKey: string, season: string, dateStr: string): Promise<any[]> {
  const resp = await fetch(
    `${API_BASKETBALL_BASE}/games?league=${NCAAB_LEAGUE_ID}&season=${season}&date=${dateStr}`,
    { headers: { "x-apisports-key": apiKey } }
  );
  if (!resp.ok) {
    console.warn(`[ncaab-fast-sync] API returned ${resp.status} for date ${dateStr}`);
    return [];
  }
  const json = await resp.json();
  return json.response || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const apiKey = Deno.env.get("API_BASKETBALL_KEY")!;

    const now = new Date();
    const seasonYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    const season = `${seasonYear}-${seasonYear + 1}`;
    const todayStr = now.toISOString().slice(0, 10);

    // Also fetch yesterday to catch games that ended after nightly cron
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Fetch today + yesterday in parallel
    const [todayGames, yesterdayGames] = await Promise.all([
      fetchGamesForDate(apiKey, season, todayStr),
      fetchGamesForDate(apiKey, season, yesterdayStr),
    ]);

    const allGames = [...todayGames, ...yesterdayGames];

    // Build batch upsert rows
    const rows = allGames.map((g: any) => ({
      external_id: `api-basketball-ncaab-${g.id}`,
      league: "NCAAB",
      home_team: g.teams?.home?.name || "Unknown",
      away_team: g.teams?.away?.name || "Unknown",
      home_abbr: generateTeamAbbr(g.teams?.home?.name || ""),
      away_abbr: generateTeamAbbr(g.teams?.away?.name || ""),
      start_time: g.date || `${todayStr}T00:00:00Z`,
      status: mapStatus(g.status?.short || "NS"),
      home_score: g.scores?.home?.total ?? null,
      away_score: g.scores?.away?.total ?? null,
      venue: g.arena?.name || null,
      source: "api-basketball",
    }));

    // Batch upsert (updates status + scores on conflict)
    const { error: upsertErr } = await supabase
      .from("games")
      .upsert(rows, { onConflict: "external_id" });

    // Stale-game sweep: mark any NCAAB game still "live" after 5h as "final"
    const cutoff = new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000).toISOString();
    const { data: swept, error: sweepErr } = await supabase
      .from("games")
      .update({ status: "final", updated_at: now.toISOString() })
      .eq("league", "NCAAB")
      .eq("status", "live")
      .lt("start_time", cutoff)
      .select("id");

    const sweptCount = swept?.length ?? 0;
    if (sweepErr) console.warn("[ncaab-fast-sync] sweep error:", sweepErr.message);

    return new Response(JSON.stringify({
      success: !upsertErr,
      today_games: todayGames.length,
      yesterday_games: yesterdayGames.length,
      upserted: rows.length,
      stale_swept: sweptCount,
      error: upsertErr?.message || null,
      date: todayStr,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
