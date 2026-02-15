import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEAM_MAP: Record<string, string> = {
  "PHO": "PHX", "BRK": "BKN", "CHO": "CHA", "NJN": "BKN", "NOH": "NOP",
  "GS": "GSW", "SA": "SAS", "NY": "NYK", "NO": "NOP", "LA-L": "LAL", "LA-C": "LAC",
  "2TM": "", "3TM": "", "TOT": "",
};

function normalizeTeam(raw: string): string {
  const t = raw.trim().toUpperCase();
  return TEAM_MAP[t] ?? t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const statType = (formData.get("stat_type") as string) || "auto";
    const seasonOverride = formData.get("season") as string;

    if (!file) throw new Error("No file uploaded");

    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, "").trim().split("\n");
    if (lines.length < 2) throw new Error("File too short");

    const headers = lines[0].split(",").map(h => h.trim().replace(/['"]/g, ""));

    // Auto-detect: if first data row has decimals in FG column, it's averages
    let detectedType = statType;
    if (statType === "auto") {
      const firstRow = lines[1].split(",");
      const fgIdx = headers.findIndex(h => h === "FG");
      if (fgIdx >= 0) {
        const fgVal = parseFloat(firstRow[fgIdx]);
        detectedType = fgVal < 50 ? "averages" : "totals"; // season totals would be 50+
      } else {
        detectedType = "averages";
      }
    }

    // Detect season from filename or default
    let season = 2026;
    if (seasonOverride) season = parseInt(seasonOverride);
    else {
      const m = file.name.match(/(\d{4})-?(\d{2,4})/);
      if (m) season = m[2].length === 2 ? 2000 + parseInt(m[2]) : parseInt(m[2]);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Build player name -> id cache
    const { data: allPlayers } = await supabase
      .from("players")
      .select("id, name, team, league")
      .eq("league", "NBA");
    const playerMap = new Map<string, string>();
    for (const p of allPlayers || []) {
      playerMap.set(p.name.toLowerCase(), p.id);
    }

    const col = (name: string) => headers.indexOf(name);
    const playerCol = col("Player") >= 0 ? col("Player") : col("Name");
    const ageCol = col("Age");
    const teamCol = col("Team");
    const posCol = col("Pos");
    const gCol = col("G");
    const gsCol = col("GS");
    const mpCol = col("MP");
    const fgCol = col("FG");
    const fgaCol = col("FGA");
    const fgPctCol = col("FG%");
    const threePCol = col("3P");
    const threePACol = col("3PA");
    const threePctCol = col("3P%");
    const twoPCol = col("2P");
    const twoPACol = col("2PA");
    const twoPctCol = col("2P%");
    const efgCol = col("eFG%");
    const ftCol = col("FT");
    const ftaCol = col("FTA");
    const ftPctCol = col("FT%");
    const orbCol = col("ORB");
    const drbCol = col("DRB");
    const trbCol = col("TRB");
    const astCol = col("AST");
    const stlCol = col("STL");
    const blkCol = col("BLK");
    const tovCol = col("TOV");
    const pfCol = col("PF");
    const ptsCol = col("PTS");
    const trpDblCol = col("Trp-Dbl");

    let upserted = 0;
    let playersCreated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map(v => v.trim());
      const name = vals[playerCol]?.replace(/['"]/g, "");
      if (!name) continue;

      const teamRaw = vals[teamCol] || "";
      const team = normalizeTeam(teamRaw);
      // Skip multi-team aggregate rows
      if (!team) { skipped++; continue; }

      const num = (idx: number) => idx >= 0 && vals[idx] ? parseFloat(vals[idx]) : null;

      // Find or create player
      let playerId = playerMap.get(name.toLowerCase());
      if (!playerId) {
        const { data: newP, error: pErr } = await supabase
          .from("players")
          .insert({ name, team, league: "NBA", position: vals[posCol] || null })
          .select("id")
          .single();
        if (pErr) {
          // Try lookup again (race condition)
          const { data: existing } = await supabase
            .from("players")
            .select("id")
            .eq("name", name)
            .eq("league", "NBA")
            .maybeSingle();
          if (existing) playerId = existing.id;
          else { errors.push(`Player create failed: ${name} - ${pErr.message}`); continue; }
        } else {
          playerId = newP.id;
          playersCreated++;
        }
        playerMap.set(name.toLowerCase(), playerId!);
      }

      // Also update player team/position
      await supabase.from("players").update({ team, position: vals[posCol] || null }).eq("id", playerId!);

      const row: Record<string, any> = {
        player_id: playerId,
        season,
        league: "NBA",
        stat_type: detectedType,
        games_played: num(gCol),
        games_started: num(gsCol),
        minutes_per_game: num(mpCol),
        fg_made: num(fgCol),
        fg_attempted: num(fgaCol),
        fg_pct: num(fgPctCol) != null ? num(fgPctCol)! * 100 : null,
        three_made: num(threePCol),
        three_attempted: num(threePACol),
        three_pct: num(threePctCol) != null ? num(threePctCol)! * 100 : null,
        two_made: num(twoPCol),
        two_attempted: num(twoPACol),
        two_pct: num(twoPctCol) != null ? num(twoPctCol)! * 100 : null,
        effective_fg_pct: num(efgCol) != null ? num(efgCol)! * 100 : null,
        ft_made: num(ftCol),
        ft_attempted: num(ftaCol),
        ft_pct: num(ftPctCol) != null ? num(ftPctCol)! * 100 : null,
        off_rebounds: num(orbCol),
        def_rebounds: num(drbCol),
        rebounds_per_game: num(trbCol),
        assists_per_game: num(astCol),
        steals_per_game: num(stlCol),
        blocks_per_game: num(blkCol),
        turnovers_per_game: num(tovCol),
        personal_fouls: num(pfCol),
        points_per_game: num(ptsCol),
        triple_doubles: trpDblCol >= 0 ? num(trpDblCol) : null,
        updated_at: new Date().toISOString(),
      };

      const { error: uErr } = await supabase
        .from("player_season_stats")
        .upsert(row, { onConflict: "player_id,season,league,stat_type" });

      if (uErr) {
        errors.push(`${name}: ${uErr.message}`);
      } else {
        upserted++;
      }
    }

    return new Response(JSON.stringify({
      stat_type: detectedType,
      season,
      rows_parsed: lines.length - 1,
      upserted,
      players_created: playersCreated,
      skipped,
      errors: errors.slice(0, 20),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
