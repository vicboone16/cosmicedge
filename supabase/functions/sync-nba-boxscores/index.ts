import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function todayISO(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const date = todayISO();

    // Get today's NBA games to determine which teams to pull
    const { data: games } = await supabase
      .from("games")
      .select("id, home_abbr, away_abbr, status")
      .eq("league", "NBA")
      .gte("start_time", `${date}T00:00:00Z`)
      .lte("start_time", `${date}T23:59:59Z`);

    const teams = new Set<string>();
    for (const g of games ?? []) {
      if (g.home_abbr) teams.add(g.home_abbr);
      if (g.away_abbr) teams.add(g.away_abbr);
    }

    if (teams.size === 0) {
      console.log("[sync-nba-boxscores] No NBA games today");
      return new Response(JSON.stringify({ ok: true, teams: 0, rows: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Team abbreviation → actor team name mapping
    const TEAM_MAP: Record<string, string> = {
      ATL: "Hawks", BOS: "Celtics", BKN: "Nets", CHA: "Hornets",
      CHI: "Bulls", CLE: "Cavaliers", DAL: "Mavericks", DEN: "Nuggets",
      DET: "Pistons", GSW: "Warriors", HOU: "Rockets", IND: "Pacers",
      LAC: "Clippers", LAL: "Lakers", MEM: "Grizzlies", MIA: "Heat",
      MIL: "Bucks", MIN: "Timberwolves", NOP: "Pelicans", NYK: "Knicks",
      OKC: "Thunder", ORL: "Magic", PHI: "76ers", PHX: "Suns",
      POR: "Trail Blazers", SAC: "Kings", SAS: "Spurs", TOR: "Raptors",
      UTA: "Jazz", WAS: "Wizards",
    };

    const actorId = "sportsverse/nba-player-box-scores-scraper";
    let totalRows = 0;

    for (const abbr of teams) {
      const teamName = TEAM_MAP[abbr] ?? abbr;
      const url =
        `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}` +
        `/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}&format=json`;

      console.log(`[sync-nba-boxscores] Fetching: ${teamName} (${abbr})`);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team: teamName }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.warn(`[sync-nba-boxscores] Failed for ${teamName}: ${res.status}`, errText);
          continue;
        }

        const items = await res.json();
        if (!Array.isArray(items) || items.length === 0) continue;

        // Store raw for later normalization
        await supabase.from("player_boxscores_raw").insert(
          items.map((x: unknown) => ({
            payload: { team_abbr: abbr, ...(x as Record<string, unknown>) },
            captured_at: new Date().toISOString(),
          }))
        );

        totalRows += items.length;
      } catch (err) {
        console.warn(`[sync-nba-boxscores] Error for ${teamName}:`, err);
      }
    }

    console.log(`[sync-nba-boxscores] Done: ${teams.size} teams, ${totalRows} box scores`);

    return new Response(JSON.stringify({ ok: true, teams: teams.size, rows: totalRows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[sync-nba-boxscores] Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
