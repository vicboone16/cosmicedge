import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TEAM_MAP: Record<string, string> = {
  PHO: "PHX", BRK: "BKN", CHO: "CHA", NJN: "BKN", NOH: "NOP",
  GS: "GSW", SA: "SAS", NY: "NYK", NO: "NOP", "LA-L": "LAL", "LA-C": "LAC",
  UTH: "UTA", "UTA": "UTA",
};

function normalizeTeam(raw: string): string {
  const t = raw.trim().toUpperCase();
  return TEAM_MAP[t] || t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  console.log("import-period-stats-csv called, method:", req.method);
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const league = (formData.get("league") as string) || "NBA";
    const season = parseInt((formData.get("season") as string) || "2025", 10);

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = await file.text();
    const lines = text.trim().replace(/^\uFEFF/, "").split("\n");
    if (lines.length < 2) {
      return new Response(JSON.stringify({ error: "CSV has no data rows" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const col = (names: string[]) => headers.findIndex((h) => names.includes(h));

    const nameIdx = col(["player", "name"]);
    const teamIdx = col(["team", "tm"]);
    const periodIdx = col(["period"]);
    const minIdx = col(["min", "minutes"]);
    const ptsIdx = col(["pts", "points"]);
    const rebIdx = col(["reb", "rebounds"]);
    const astIdx = col(["ast", "assists"]);
    const stlIdx = col(["stl", "steals"]);
    const blkIdx = col(["blk", "blocks"]);
    const tovIdx = col(["tov", "to", "turnovers"]);
    const fgmIdx = col(["fgm", "fg made"]);
    const fgaIdx = col(["fga", "fg attempted"]);
    const fgPctIdx = col(["fg%"]);
    const tpmIdx = col(["3pm", "3p made"]);
    const tpaIdx = col(["3pa", "3p attempted"]);
    const tpPctIdx = col(["3p%"]);
    const ftmIdx = col(["ftm", "ft made"]);
    const ftaIdx = col(["fta", "ft attempted"]);
    const ftPctIdx = col(["ft%"]);
    const orebIdx = col(["oreb"]);
    const drebIdx = col(["dreb"]);
    const pfIdx = col(["pf"]);
    const pmIdx = col(["+/-"]);
    const dd2Idx = col(["dd2"]);
    const td3Idx = col(["td3"]);
    const fpIdx = col(["fp"]);

    if (nameIdx < 0) {
      return new Response(JSON.stringify({ error: "No PLAYER/Name column found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const num = (vals: string[], idx: number) =>
      idx >= 0 && vals[idx] && vals[idx].trim() !== "" ? parseFloat(vals[idx]) : null;

    // Cache player lookups
    const playerMap = new Map<string, string>();
    let inserted = 0;
    let skipped = 0;
    let playersCreated = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map((v) => v.trim());
      const name = vals[nameIdx];
      if (!name) { skipped++; continue; }

      const team = teamIdx >= 0 ? normalizeTeam(vals[teamIdx] || "") : "";
      const period = periodIdx >= 0 ? vals[periodIdx]?.trim() || "full" : "full";

      // Resolve player
      let playerId = playerMap.get(name.toLowerCase());
      if (!playerId) {
        const { data: found } = await supabase
          .from("players")
          .select("id")
          .eq("league", league)
          .ilike("name", name)
          .limit(1);

        if (found && found.length > 0) {
          playerId = found[0].id;
        } else {
          // Create player
          const { data: created, error: createErr } = await supabase
            .from("players")
            .insert({ name, team: team || null, league })
            .select("id")
            .single();
          if (createErr || !created) {
            errors.push(`Row ${i}: Could not create player "${name}"`);
            skipped++;
            continue;
          }
          playerId = created.id;
          playersCreated++;
        }
        playerMap.set(name.toLowerCase(), playerId!);
      }

      const row: Record<string, any> = {
        player_id: playerId,
        season,
        league,
        stat_type: "averages",
        period,
        minutes_per_game: num(vals, minIdx),
        points_per_game: num(vals, ptsIdx),
        rebounds_per_game: num(vals, rebIdx),
        assists_per_game: num(vals, astIdx),
        steals_per_game: num(vals, stlIdx),
        blocks_per_game: num(vals, blkIdx),
        turnovers_per_game: num(vals, tovIdx),
        fg_made: num(vals, fgmIdx),
        fg_attempted: num(vals, fgaIdx),
        fg_pct: num(vals, fgPctIdx),
        three_made: num(vals, tpmIdx),
        three_attempted: num(vals, tpaIdx),
        three_pct: num(vals, tpPctIdx),
        ft_made: num(vals, ftmIdx),
        ft_attempted: num(vals, ftaIdx),
        ft_pct: num(vals, ftPctIdx),
        off_rebounds: num(vals, orebIdx),
        def_rebounds: num(vals, drebIdx),
        personal_fouls: num(vals, pfIdx),
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from("player_season_stats")
        .upsert(row, { onConflict: "player_id,season,league,stat_type,period" });

      if (upsertErr) {
        errors.push(`Row ${i} (${name}): ${upsertErr.message}`);
        skipped++;
      } else {
        inserted++;
      }
    }

    return new Response(
      JSON.stringify({
        rows_parsed: lines.length - 1,
        stats_inserted: inserted,
        skipped,
        players_created: playersCreated,
        errors: errors.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
