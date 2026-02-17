import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Canonical abbreviation aliases (non-canonical → canonical)
const ABBR_ALIASES: Record<string, Record<string, string>> = {
  NBA: { GS: "GSW", SA: "SAS", NO: "NOP", NOH: "NOP", NOK: "NOP", NY: "NYK", PHO: "PHX", BRK: "BKN", CHO: "CHA" },
  NHL: { UM: "UTA", TB: "TBL", LA: "LAK", SJ: "SJS", NJ: "NJD", MON: "MTL", WAS: "WSH", VEG: "VGK", VGS: "VGK" },
  NFL: { JAC: "JAX", WFT: "WAS", ARZ: "ARI", BLT: "BAL", CLV: "CLE", HST: "HOU" },
  MLB: { CWS: "CHW", SD: "SDP", SF: "SFG", TB: "TBR", WSH: "WSN" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { dry_run = true } = await req.json().catch(() => ({}));
    const log: string[] = [];
    let totalUpdates = 0;

    // 1. Normalize abbreviations in games table
    for (const [league, aliases] of Object.entries(ABBR_ALIASES)) {
      for (const [bad, good] of Object.entries(aliases)) {
        for (const col of ["home_abbr", "away_abbr"]) {
          const { count } = await supabase
            .from("games")
            .select("*", { count: "exact", head: true })
            .eq("league", league)
            .eq(col, bad);

          if (count && count > 0) {
            if (!dry_run) {
              await supabase
                .from("games")
                .update({ [col]: good })
                .eq("league", league)
                .eq(col, bad);
            }
            log.push(`games.${col}: ${league} ${bad}→${good} (${count} rows)`);
            totalUpdates += count;
          }
        }
      }
    }

    // 2. Normalize player team abbreviations
    for (const [league, aliases] of Object.entries(ABBR_ALIASES)) {
      for (const [bad, good] of Object.entries(aliases)) {
        const { count } = await supabase
          .from("players")
          .select("*", { count: "exact", head: true })
          .eq("league", league)
          .eq("team", bad);

        if (count && count > 0) {
          if (!dry_run) {
            await supabase
              .from("players")
              .update({ team: good })
              .eq("league", league)
              .eq("team", bad);
          }
          log.push(`players.team: ${league} ${bad}→${good} (${count} rows)`);
          totalUpdates += count;
        }
      }
    }

    // 3. Normalize player_game_stats team_abbr
    for (const [league, aliases] of Object.entries(ABBR_ALIASES)) {
      for (const [bad, good] of Object.entries(aliases)) {
        const { count } = await supabase
          .from("player_game_stats")
          .select("*", { count: "exact", head: true })
          .eq("league", league)
          .eq("team_abbr", bad);

        if (count && count > 0) {
          if (!dry_run) {
            await supabase
              .from("player_game_stats")
              .update({ team_abbr: good })
              .eq("league", league)
              .eq("team_abbr", bad);
          }
          log.push(`player_game_stats.team_abbr: ${league} ${bad}→${good} (${count} rows)`);
          totalUpdates += count;
        }
      }
    }

    // 4. Normalize injuries team_abbr
    for (const [league, aliases] of Object.entries(ABBR_ALIASES)) {
      for (const [bad, good] of Object.entries(aliases)) {
        const { count } = await supabase
          .from("injuries")
          .select("*", { count: "exact", head: true })
          .eq("league", league)
          .eq("team_abbr", bad);

        if (count && count > 0) {
          if (!dry_run) {
            await supabase
              .from("injuries")
              .update({ team_abbr: good })
              .eq("league", league)
              .eq("team_abbr", bad);
          }
          log.push(`injuries.team_abbr: ${league} ${bad}→${good} (${count} rows)`);
          totalUpdates += count;
        }
      }
    }

    // 5. Normalize depth_charts team_abbr
    for (const [league, aliases] of Object.entries(ABBR_ALIASES)) {
      for (const [bad, good] of Object.entries(aliases)) {
        const { count } = await supabase
          .from("depth_charts")
          .select("*", { count: "exact", head: true })
          .eq("league", league)
          .eq("team_abbr", bad);

        if (count && count > 0) {
          if (!dry_run) {
            await supabase
              .from("depth_charts")
              .update({ team_abbr: good })
              .eq("league", league)
              .eq("team_abbr", bad);
          }
          log.push(`depth_charts.team_abbr: ${league} ${bad}→${good} (${count} rows)`);
          totalUpdates += count;
        }
      }
    }

    // 6. Normalize nba_standings team_abbr
    for (const [bad, good] of Object.entries(ABBR_ALIASES.NBA || {})) {
      const { count } = await supabase
        .from("nba_standings")
        .select("*", { count: "exact", head: true })
        .eq("team_abbr", bad);

      if (count && count > 0) {
        if (!dry_run) {
          await supabase
            .from("nba_standings")
            .update({ team_abbr: good })
            .eq("team_abbr", bad);
        }
        log.push(`nba_standings.team_abbr: ${bad}→${good} (${count} rows)`);
        totalUpdates += count;
      }
    }

    // 7. Normalize player_projections team_abbr
    for (const [league, aliases] of Object.entries(ABBR_ALIASES)) {
      for (const [bad, good] of Object.entries(aliases)) {
        const { count } = await supabase
          .from("player_projections")
          .select("*", { count: "exact", head: true })
          .eq("league", league)
          .eq("team_abbr", bad);

        if (count && count > 0) {
          if (!dry_run) {
            await supabase
              .from("player_projections")
              .update({ team_abbr: good })
              .eq("league", league)
              .eq("team_abbr", bad);
          }
          log.push(`player_projections.team_abbr: ${league} ${bad}→${good} (${count} rows)`);
          totalUpdates += count;
        }
      }
    }

    return new Response(
      JSON.stringify({
        mode: dry_run ? "dry_run" : "applied",
        total_updates: totalUpdates,
        changes: log,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
