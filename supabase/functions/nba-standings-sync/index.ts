import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const BDL_KEY = Deno.env.get("BALLDONTLIE_KEY");
    if (!BDL_KEY) throw new Error("BALLDONTLIE_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date().toISOString().slice(0, 10);

    // Fetch NBA standings from BDL
    const resp = await fetch("https://api.balldontlie.io/v2/standings?season=2025", {
      headers: { Authorization: BDL_KEY },
    });

    if (!resp.ok) {
      console.error("BDL standings error:", resp.status, await resp.text());
      return await computeStandingsFromGames(supabase, today, corsHeaders);
    }

    const json = await resp.json();
    const standings = json.data || [];

    if (standings.length === 0) {
      return await computeStandingsFromGames(supabase, today, corsHeaders);
    }

    const ABBR_NORMALIZE: Record<string, string> = {
      PHO: "PHX", GS: "GSW", SA: "SAS", NY: "NYK", NO: "NOP",
    };

    const rows = standings.map((s: any) => {
      const rawAbbr = s.team?.abbreviation || "";
      const abbr = ABBR_NORMALIZE[rawAbbr] || rawAbbr;
      return {
        team_abbr: abbr,
        season: 2025,
        snapshot_date: today,
        conference: s.conference || null,
        division: s.division || null,
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        pct: s.wins > 0 ? Number((s.wins / (s.wins + s.losses)).toFixed(3)) : 0,
        home_wins: s.home_record ? parseInt(s.home_record.split("-")[0]) : null,
        home_losses: s.home_record ? parseInt(s.home_record.split("-")[1]) : null,
        road_wins: s.road_record ? parseInt(s.road_record.split("-")[0]) : null,
        road_losses: s.road_record ? parseInt(s.road_record.split("-")[1]) : null,
        streak: s.streak || null,
        last_10: s.last_ten || null,
      };
    });

    const { error } = await supabase
      .from("nba_standings")
      .upsert(rows, { onConflict: "team_abbr,season,snapshot_date" });

    if (error) {
      console.error("Upsert error:", error);
      throw error;
    }

    return new Response(JSON.stringify({ success: true, count: rows.length, source: "bdl" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("standings sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function computeStandingsFromGames(supabase: any, today: string, corsHeaders: Record<string, string>) {
  const now = new Date();
  const seasonStartYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const seasonStart = `${seasonStartYear}-10-01T00:00:00Z`;

  const { data: games, error } = await supabase
    .from("games")
    .select("home_abbr, away_abbr, home_score, away_score")
    .eq("league", "NBA")
    .eq("status", "final")
    .gte("start_time", seasonStart);

  if (error || !games?.length) {
    return new Response(JSON.stringify({ success: false, error: "No games found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const teams: Record<string, { wins: number; losses: number; homeW: number; homeL: number; roadW: number; roadL: number }> = {};
  for (const g of games) {
    if (g.home_score == null || g.away_score == null) continue;
    for (const abbr of [g.home_abbr, g.away_abbr]) {
      if (!teams[abbr]) teams[abbr] = { wins: 0, losses: 0, homeW: 0, homeL: 0, roadW: 0, roadL: 0 };
    }
    if (g.home_score > g.away_score) {
      teams[g.home_abbr].wins++; teams[g.home_abbr].homeW++;
      teams[g.away_abbr].losses++; teams[g.away_abbr].roadL++;
    } else {
      teams[g.away_abbr].wins++; teams[g.away_abbr].roadW++;
      teams[g.home_abbr].losses++; teams[g.home_abbr].homeL++;
    }
  }

  const rows = Object.entries(teams).map(([abbr, t]) => ({
    team_abbr: abbr,
    season: 2025,
    snapshot_date: today,
    wins: t.wins,
    losses: t.losses,
    pct: t.wins > 0 ? Number((t.wins / (t.wins + t.losses)).toFixed(3)) : 0,
    home_wins: t.homeW,
    home_losses: t.homeL,
    road_wins: t.roadW,
    road_losses: t.roadL,
  }));

  const { error: upsertErr } = await supabase
    .from("nba_standings")
    .upsert(rows, { onConflict: "team_abbr,season,snapshot_date" });

  return new Response(JSON.stringify({ success: !upsertErr, count: rows.length, source: "computed" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
