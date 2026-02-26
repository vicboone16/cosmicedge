import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEAM_MAP: Record<string, string> = {
  "PHO": "PHX", "BRK": "BKN", "CHO": "CHA", "NJN": "BKN", "NOH": "NOP",
  "GS": "GSW", "SA": "SAS", "NY": "NYK", "NO": "NOP", "LA-L": "LAL", "LA-C": "LAC",
  "2TM": "", "3TM": "",
  // NBAstuffer 3-letter abbreviations
  "GOL": "GSW", "SAN": "SAS", "UTH": "UTA", "UTA": "UTA",
  "NOR": "NOP", "BRO": "BKN", "PHE": "PHX",
};

function normalizeTeam(raw: string): string {
  const t = raw.trim().toUpperCase();
  return TEAM_MAP[t] ?? t;
}

/** Detect if headers match NBAstuffer format */
function isNBAstufferFormat(headers: string[]): boolean {
  return headers.includes("NAME") && headers.includes("PpG") && headers.includes("MpG");
}

/** Parse NBAstuffer row into a stat record */
function parseNBAstufferRow(
  vals: string[],
  headers: string[],
  playerId: string,
  season: number,
  effectiveTeam: string,
  statType: string,
) {
  const col = (name: string) => headers.indexOf(name);
  const num = (idx: number) => idx >= 0 && vals[idx] ? parseFloat(vals[idx]) : null;
  const pct100 = (idx: number) => {
    const v = num(idx);
    return v != null ? +(v * 100).toFixed(1) : null;
  };

  return {
    player_id: playerId,
    season,
    league: "NBA",
    stat_type: statType,
    period: "full",
    games_played: num(col("GP")),
    games_started: null,
    minutes_per_game: num(col("MpG")),
    points_per_game: num(col("PpG")),
    rebounds_per_game: num(col("RpG")),
    assists_per_game: num(col("ApG")),
    steals_per_game: num(col("SpG")),
    blocks_per_game: num(col("BpG")),
    turnovers_per_game: num(col("TOpG")),
    // Totals (NBAstuffer gives season totals for attempts)
    ft_attempted: num(col("FTA")),
    two_attempted: num(col("2PA")),
    three_attempted: num(col("3PA")),
    // Percentages (stored as decimals like 0.781 → 78.1)
    ft_pct: pct100(col("FT%")),
    two_pct: pct100(col("2P%")),
    three_pct: pct100(col("3P%")),
    effective_fg_pct: pct100(col("eFG%")),
    true_shooting_pct: pct100(col("TS%")),
    // Already percentage values (37.9 = 37.9%)
    usage_rate: num(col("USG%")),
    updated_at: new Date().toISOString(),
  };
}

/** Parse Basketball Reference row into a stat record */
function parseBBRefRow(
  vals: string[],
  headers: string[],
  playerId: string,
  season: number,
  statType: string,
) {
  const col = (name: string) => headers.indexOf(name);
  const num = (idx: number) => idx >= 0 && vals[idx] ? parseFloat(vals[idx]) : null;
  const pct100 = (idx: number) => {
    const v = num(idx);
    return v != null ? +(v * 100).toFixed(1) : null;
  };

  return {
    player_id: playerId,
    season,
    league: "NBA",
    stat_type: statType,
    period: "full",
    games_played: num(col("G")),
    games_started: num(col("GS")),
    minutes_per_game: num(col("MP")),
    fg_made: num(col("FG")),
    fg_attempted: num(col("FGA")),
    fg_pct: pct100(col("FG%")),
    three_made: num(col("3P")),
    three_attempted: num(col("3PA")),
    three_pct: pct100(col("3P%")),
    two_made: num(col("2P")),
    two_attempted: num(col("2PA")),
    two_pct: pct100(col("2P%")),
    effective_fg_pct: pct100(col("eFG%")),
    ft_made: num(col("FT")),
    ft_attempted: num(col("FTA")),
    ft_pct: pct100(col("FT%")),
    off_rebounds: num(col("ORB")),
    def_rebounds: num(col("DRB")),
    rebounds_per_game: num(col("TRB")),
    assists_per_game: num(col("AST")),
    steals_per_game: num(col("STL")),
    blocks_per_game: num(col("BLK")),
    turnovers_per_game: num(col("TOV")),
    personal_fouls: num(col("PF")),
    points_per_game: num(col("PTS")),
    triple_doubles: col("Trp-Dbl") >= 0 ? num(col("Trp-Dbl")) : null,
    updated_at: new Date().toISOString(),
  };
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
    const isStuffer = isNBAstufferFormat(headers);

    // Auto-detect stat type
    let detectedType = statType;
    if (statType === "auto") {
      if (isStuffer) {
        detectedType = "averages"; // NBAstuffer is always per-game averages
      } else {
        const firstRow = lines[1].split(",");
        const fgIdx = headers.findIndex(h => h === "FG");
        if (fgIdx >= 0) {
          const fgVal = parseFloat(firstRow[fgIdx]);
          detectedType = fgVal < 50 ? "averages" : "totals";
        } else {
          detectedType = "averages";
        }
      }
    }

    // Detect season
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

    // Column indices for name/team/pos differ by format
    const nameCol = isStuffer ? headers.indexOf("NAME") : (headers.indexOf("Player") >= 0 ? headers.indexOf("Player") : headers.indexOf("Name"));
    const teamCol = isStuffer ? headers.indexOf("TEAM") : headers.indexOf("Team");
    const posCol = isStuffer ? headers.indexOf("POS") : headers.indexOf("Pos");

    let upserted = 0;
    let playersCreated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map(v => v.trim().replace(/['"]/g, ""));
      let name = vals[nameCol];
      if (!name) continue;
      // Normalize "Last, First" → "First Last"
      if (name.includes(",")) {
        name = name.split(",").map(s => s.trim()).reverse().join(" ");
      }

      const teamRaw = vals[teamCol] || "";
      const team = normalizeTeam(teamRaw);
      const isTot = teamRaw.trim().toUpperCase() === "TOT";
      if (!team && !isTot) { skipped++; continue; }

      // Find or create player
      let playerId = playerMap.get(name.toLowerCase());
      if (!playerId) {
        const { data: newP, error: pErr } = await supabase
          .from("players")
          .insert({ name, team, league: "NBA", position: vals[posCol] || null })
          .select("id")
          .single();
        if (pErr) {
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

      // For TOT rows, resolve current team
      let effectiveTeam = team;
      let effectiveStatType = detectedType;
      if (isTot) {
        effectiveStatType = detectedType === "averages" ? "averages_combined" : "totals_combined";
        const { data: pRow } = await supabase.from("players").select("team").eq("id", playerId!).single();
        effectiveTeam = pRow?.team || "UNK";
      } else {
        // Only update position, NOT team — team assignments are manually curated
        if (vals[posCol]) {
          await supabase.from("players").update({ position: vals[posCol] }).eq("id", playerId!);
        }
      }

      // Build the row based on format
      const row = isStuffer
        ? parseNBAstufferRow(vals, headers, playerId!, season, effectiveTeam, effectiveStatType)
        : parseBBRefRow(vals, headers, playerId!, season, effectiveStatType);

      const { error: uErr } = await supabase
        .from("player_season_stats")
        .upsert(row, { onConflict: "player_id,season,league,stat_type,period" });

      if (uErr) {
        errors.push(`${name}: ${uErr.message}`);
      } else {
        upserted++;
      }
    }

    return new Response(JSON.stringify({
      format: isStuffer ? "nbastuffer" : "bbref",
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
