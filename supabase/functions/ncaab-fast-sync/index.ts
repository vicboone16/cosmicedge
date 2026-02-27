/**
 * ncaab-fast-sync: Lightweight function that fetches today's NCAAB schedule
 * from API-Basketball and inserts directly into the games table.
 * Skips cosmic_games infrastructure to avoid timeouts.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const API_BASKETBALL_BASE = "https://v1.basketball.api-sports.io";
const NCAAB_LEAGUE_ID = 116;

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

    // Fetch today's games
    const resp = await fetch(
      `${API_BASKETBALL_BASE}/games?league=${NCAAB_LEAGUE_ID}&season=${season}&date=${todayStr}`,
      { headers: { "x-apisports-key": apiKey } }
    );

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `API returned ${resp.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const json = await resp.json();
    const games = json.response || [];
    
    // Build batch insert
    const rows = games.map((g: any) => ({
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

    // Batch upsert
    const { error } = await supabase.from("games").upsert(rows, { onConflict: "external_id" });

    return new Response(JSON.stringify({
      success: !error,
      games_found: games.length,
      inserted: rows.length,
      error: error?.message || null,
      date: todayStr,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
