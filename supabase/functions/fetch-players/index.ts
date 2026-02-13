import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SDIO_API_BASE = "https://api.sportsdata.io/v3";

const POSITION_MAP: Record<string, string> = {
  PG: "PG", SG: "SG", SF: "SF", PF: "PF", C: "C",
  G: "G", F: "F", "G-F": "G-F", "F-C": "F-C", "F-G": "F-G",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "NBA";

    const sdioKey = Deno.env.get("SPORTSDATAIO_API_KEY");
    if (!sdioKey) throw new Error("SPORTSDATAIO_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const slug = league.toLowerCase();
    const meta: Record<string, any> = { league };

    // ── Fetch players from SportsDataIO ──
    const playersUrl = `${SDIO_API_BASE}/${slug}/scores/json/Players?key=${sdioKey}`;
    const resp = await fetch(playersUrl);
    if (!resp.ok) throw new Error(`SportsDataIO players error: ${resp.status}`);
    const rawPlayers = await resp.json();

    let upsertCount = 0;
    const batchSize = 50;

    for (let i = 0; i < rawPlayers.length; i += batchSize) {
      const batch = rawPlayers.slice(i, i + batchSize);
      const records = batch.map((p: any) => ({
        external_id: String(p.PlayerID),
        name: `${p.FirstName || ""} ${p.LastName || ""}`.trim(),
        team: p.Team || null,
        league,
        position: POSITION_MAP[p.Position] || p.Position || null,
        birth_date: p.BirthDate ? p.BirthDate.split("T")[0] : null,
        birth_place: [p.BirthCity, p.BirthState, p.BirthCountry].filter(Boolean).join(", ") || null,
        natal_data_quality: p.BirthDate ? "B" : "C", // B = date only, no time
      }));

      const { error } = await supabase
        .from("players")
        .upsert(records, { onConflict: "external_id", ignoreDuplicates: false });

      if (error) {
        console.error(`Batch upsert error at offset ${i}:`, error.message);
      } else {
        upsertCount += records.length;
      }
    }

    meta.players_upserted = upsertCount;
    meta.total_raw = rawPlayers.length;

    // ── Fetch season stats ──
    const currentYear = new Date().getFullYear();
    const season = url.searchParams.get("season") || String(currentYear);

    const statsUrl = `${SDIO_API_BASE}/${slug}/stats/json/PlayerSeasonStats/${season}?key=${sdioKey}`;
    const statsResp = await fetch(statsUrl);

    if (statsResp.ok) {
      const rawStats = await statsResp.json();

      // We need player external_id → UUID mapping
      const externalIds = rawStats.map((s: any) => String(s.PlayerID));
      const { data: playerRows } = await supabase
        .from("players")
        .select("id, external_id")
        .in("external_id", externalIds);

      const idMap = new Map<string, string>();
      for (const row of playerRows || []) {
        idMap.set(row.external_id!, row.id);
      }

      let statsCount = 0;
      for (let i = 0; i < rawStats.length; i += batchSize) {
        const batch = rawStats.slice(i, i + batchSize);
        const records = batch
          .filter((s: any) => idMap.has(String(s.PlayerID)))
          .map((s: any) => ({
            player_id: idMap.get(String(s.PlayerID))!,
            season: Number(season),
            league,
            games_played: s.Games || 0,
            minutes_per_game: s.Minutes ? +(s.Minutes / Math.max(s.Games, 1)).toFixed(1) : null,
            points_per_game: s.Points ? +(s.Points / Math.max(s.Games, 1)).toFixed(1) : null,
            rebounds_per_game: s.Rebounds ? +(s.Rebounds / Math.max(s.Games, 1)).toFixed(1) : null,
            assists_per_game: s.Assists ? +(s.Assists / Math.max(s.Games, 1)).toFixed(1) : null,
            steals_per_game: s.Steals ? +(s.Steals / Math.max(s.Games, 1)).toFixed(1) : null,
            blocks_per_game: s.BlockedShots ? +(s.BlockedShots / Math.max(s.Games, 1)).toFixed(1) : null,
            turnovers_per_game: s.Turnovers ? +(s.Turnovers / Math.max(s.Games, 1)).toFixed(1) : null,
            fg_pct: s.FieldGoalsPercentage || null,
            three_pct: s.ThreePointersPercentage || null,
            ft_pct: s.FreeThrowsPercentage || null,
            usage_rate: s.UsageRatePercentage || null,
            true_shooting_pct: s.TrueShootingPercentage || null,
            effective_fg_pct: s.EffectiveFieldGoalsPercentage || null,
            per: s.PlayerEfficiencyRating || null,
            bpm: s.BoxPlusMinus || null,
            vorp: s.ValueOverReplacementPlayer || null,
            win_shares: s.WinShares || null,
          }));

        if (records.length > 0) {
          const { error } = await supabase
            .from("player_season_stats")
            .upsert(records, { onConflict: "player_id,season,league", ignoreDuplicates: false });
          if (error) console.error(`Season stats batch error at ${i}:`, error.message);
          else statsCount += records.length;
        }
      }
      meta.season_stats_upserted = statsCount;
    }

    return new Response(
      JSON.stringify({ success: true, meta, fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-players error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
