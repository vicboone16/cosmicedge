import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SDIO_API_BASE = "https://api.sportsdata.io/v3";

// ── Position maps per league ────────────────────────────────────────────────
const POSITION_MAP: Record<string, Record<string, string>> = {
  NBA: {
    PG: "PG", SG: "SG", SF: "SF", PF: "PF", C: "C",
    G: "G", F: "F", "G-F": "G-F", "F-C": "F-C", "F-G": "F-G",
  },
  NFL: {
    QB: "QB", RB: "RB", WR: "WR", TE: "TE", K: "K", P: "P",
    OL: "OL", OT: "OT", OG: "OG", C: "C",
    DL: "DL", DE: "DE", DT: "DT", NT: "NT",
    LB: "LB", ILB: "ILB", OLB: "OLB", MLB: "MLB",
    DB: "DB", CB: "CB", S: "S", FS: "FS", SS: "SS",
    FB: "FB", LS: "LS", KR: "KR", PR: "PR",
  },
  NHL: {
    C: "C", LW: "LW", RW: "RW", D: "D", G: "G",
    F: "F", W: "W",
  },
  MLB: {
    P: "P", C: "C", "1B": "1B", "2B": "2B", "3B": "3B", SS: "SS",
    LF: "LF", CF: "CF", RF: "RF", DH: "DH", OF: "OF",
    SP: "SP", RP: "RP", CL: "CL",
    IF: "IF", UT: "UT",
  },
};

// ── Season stats field mappers per league ───────────────────────────────────
function mapNbaStats(s: any, season: number, league: string, playerId: string) {
  const g = Math.max(s.Games || 1, 1);
  return {
    player_id: playerId, season, league,
    games_played: s.Games || 0,
    minutes_per_game: s.Minutes ? +(s.Minutes / g).toFixed(1) : null,
    points_per_game: s.Points ? +(s.Points / g).toFixed(1) : null,
    rebounds_per_game: s.Rebounds ? +(s.Rebounds / g).toFixed(1) : null,
    assists_per_game: s.Assists ? +(s.Assists / g).toFixed(1) : null,
    steals_per_game: s.Steals ? +(s.Steals / g).toFixed(1) : null,
    blocks_per_game: s.BlockedShots ? +(s.BlockedShots / g).toFixed(1) : null,
    turnovers_per_game: s.Turnovers ? +(s.Turnovers / g).toFixed(1) : null,
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
  };
}

// For NFL/NHL/MLB we only store basic per-game avgs in the same table
function mapGenericStats(s: any, season: number, league: string, playerId: string) {
  const g = Math.max(s.Games || s.Started || 1, 1);
  return {
    player_id: playerId, season, league,
    games_played: s.Games || s.Started || 0,
    // Store whatever per-game stats make sense; nulls for basketball-specific fields
    minutes_per_game: null,
    points_per_game: null,
    rebounds_per_game: null,
    assists_per_game: null,
    steals_per_game: null,
    blocks_per_game: null,
    turnovers_per_game: null,
    fg_pct: null, three_pct: null, ft_pct: null,
    usage_rate: null, true_shooting_pct: null, effective_fg_pct: null,
    per: null, bpm: null, vorp: null, win_shares: null,
  };
}

// ── Season stats URL patterns per league ────────────────────────────────────
function getStatsUrl(league: string, slug: string, season: string, sdioKey: string): string {
  switch (league) {
    case "NBA":
      return `${SDIO_API_BASE}/${slug}/stats/json/PlayerSeasonStats/${season}?key=${sdioKey}`;
    case "NFL":
      return `${SDIO_API_BASE}/${slug}/stats/json/PlayerSeasonStats/${season}?key=${sdioKey}`;
    case "NHL":
      return `${SDIO_API_BASE}/${slug}/stats/json/PlayerSeasonStats/${season}?key=${sdioKey}`;
    case "MLB":
      return `${SDIO_API_BASE}/${slug}/stats/json/PlayerSeasonStats/${season}?key=${sdioKey}`;
    default:
      return `${SDIO_API_BASE}/${slug}/stats/json/PlayerSeasonStats/${season}?key=${sdioKey}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "roster";
    const league = (url.searchParams.get("league") || "NBA").toUpperCase();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── GEOCODE MODE ──────────────────────────────────────────────
    if (mode === "geocode") {
      const sb = createClient(supabaseUrl, supabaseKey);
      const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);

      let q = sb.from("players").select("id, name, birth_place")
        .not("birth_place", "is", null).is("birth_lat", null).limit(limit);
      if (league) q = q.eq("league", league);

      const { data: players, error: fe } = await q;
      if (fe) throw new Error(fe.message);
      if (!players?.length) {
        return new Response(JSON.stringify({ success: true, geocoded: 0, message: "All geocoded" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log(`[geocode] Processing ${players.length} players`);
      let geocoded = 0, failed = 0;
      const errors: string[] = [];

      for (const p of players) {
        try {
          const enc = encodeURIComponent(p.birth_place!);
          const r = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${enc}&format=json&limit=1`,
            { headers: { "User-Agent": "CosmicEdge/1.0" } }
          );
          if (!r.ok) { errors.push(`${p.name}: ${r.status}`); failed++; await delay(1100); continue; }
          const res = await r.json();
          if (!res?.length) { errors.push(`${p.name}: not found`); failed++; await delay(1100); continue; }

          const { error: ue } = await sb.from("players")
            .update({ birth_lat: parseFloat(res[0].lat), birth_lng: parseFloat(res[0].lon) })
            .eq("id", p.id);
          if (ue) { errors.push(`${p.name}: ${ue.message}`); failed++; } else { geocoded++; }
          await delay(1100);
        } catch (e) { errors.push(`${p.name}: ${e.message}`); failed++; }
      }

      return new Response(JSON.stringify({ success: true, geocoded, failed, total: players.length, errors: errors.slice(0, 20) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ROSTER MODE (default) ─────────────────────────────────────
    const sdioKey = Deno.env.get("SPORTSDATAIO_API_KEY");
    if (!sdioKey) throw new Error("SPORTSDATAIO_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const slug = league.toLowerCase();
    const posMap = POSITION_MAP[league] || {};
    const meta: Record<string, any> = { league };

    // ── Fetch players from SportsDataIO ──
    const playersUrl = `${SDIO_API_BASE}/${slug}/scores/json/Players?key=${sdioKey}`;
    console.log(`[fetch-players] Fetching ${league} players from ${playersUrl.replace(sdioKey, "***")}`);
    const resp = await fetch(playersUrl);
    if (!resp.ok) throw new Error(`SportsDataIO players error: ${resp.status} ${resp.statusText}`);
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
        position: posMap[p.Position] || p.Position || null,
        birth_date: p.BirthDate ? p.BirthDate.split("T")[0] : null,
        birth_place: [p.BirthCity, p.BirthState, p.BirthCountry].filter(Boolean).join(", ") || null,
        natal_data_quality: p.BirthDate ? "B" : "C",
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

    // ── Fetch season stats (best-effort — may 403 for non-NBA) ──
    const currentYear = new Date().getFullYear();
    const season = url.searchParams.get("season") || String(currentYear);
    const statsUrl = getStatsUrl(league, slug, season, sdioKey);

    console.log(`[fetch-players] Fetching ${league} season stats...`);
    const statsResp = await fetch(statsUrl);

    if (statsResp.ok) {
      const rawStats = await statsResp.json();
      const externalIds = rawStats.map((s: any) => String(s.PlayerID));
      const { data: playerRows } = await supabase
        .from("players")
        .select("id, external_id")
        .in("external_id", externalIds);

      const idMap = new Map<string, string>();
      for (const row of playerRows || []) {
        idMap.set(row.external_id!, row.id);
      }

      const mapFn = league === "NBA" ? mapNbaStats : mapGenericStats;
      let statsCount = 0;

      for (let i = 0; i < rawStats.length; i += batchSize) {
        const batch = rawStats.slice(i, i + batchSize);
        const records = batch
          .filter((s: any) => idMap.has(String(s.PlayerID)))
          .map((s: any) => mapFn(s, Number(season), league, idMap.get(String(s.PlayerID))!));

        if (records.length > 0) {
          const { error } = await supabase
            .from("player_season_stats")
            .upsert(records, { onConflict: "player_id,season,league", ignoreDuplicates: false });
          if (error) console.error(`Season stats batch error at ${i}:`, error.message);
          else statsCount += records.length;
        }
      }
      meta.season_stats_upserted = statsCount;
    } else {
      console.warn(`[fetch-players] Stats fetch returned ${statsResp.status} for ${league} — skipping stats`);
      meta.season_stats_skipped = true;
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

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
