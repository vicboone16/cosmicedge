import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const BASE_URL = "https://api.prizepicks.com/projections";
const LOCAL_TZ = "America/Los_Angeles";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeStatName(statName: unknown): string {
  return normalizeText(statName).replace(/\s+/g, "").replace(/\./g, "");
}

function isPRA(statName: unknown): boolean {
  const normalized = normalizeStatName(statName);
  return new Set(["pts+rebs+asts", "points+rebounds+assists", "pra"]).has(normalized);
}

function firstNonEmpty<T>(...values: T[]): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "")) return v;
  }
  return null;
}

function parseDateToLA(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getLocalDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return { ymd: `${year}-${month}-${day}` };
}

function toLocalISOString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Missing env vars" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronSecret = req.headers.get("x-cron-secret");
    const envCronSecret = Deno.env.get("CRON_SECRET");
    if (envCronSecret && cronSecret !== envCronSecret && authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const params = new URLSearchParams({ per_page: "1000", single_stat: "false", league_id: "7" });
    const resp = await fetch(`${BASE_URL}?${params.toString()}`, {
      method: "GET",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://app.prizepicks.com/",
        "Origin": "https://app.prizepicks.com",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ ok: false, error: `PrizePicks fetch failed: ${resp.status}`, body: text.slice(0, 1000) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await resp.json();
    const data = Array.isArray(payload?.data) ? payload.data : [];
    const included = Array.isArray(payload?.included) ? payload.included : [];

    const includedMap = new Map<string, any>();
    for (const item of included) {
      includedMap.set(`${item?.type}:${String(item?.id)}`, item);
    }

    const now = new Date();
    const todayLA = getLocalDateParts(now, LOCAL_TZ).ymd;
    const fetchedAtLocal = toLocalISOString(now, LOCAL_TZ);

    const records: any[] = [];

    for (const proj of data) {
      const attrs = proj?.attributes ?? {};
      const rels = proj?.relationships ?? {};

      const statRel = rels?.stat_type?.data ?? {};
      const playerRel = rels?.new_player?.data ?? rels?.player?.data ?? {};
      const leagueRel = rels?.league?.data ?? {};
      const gameRel = rels?.game?.data ?? {};

      const statObj = includedMap.get(`${statRel?.type}:${String(statRel?.id)}`) ?? {};
      const playerObj = includedMap.get(`${playerRel?.type}:${String(playerRel?.id)}`) ?? {};
      const leagueObj = includedMap.get(`${leagueRel?.type}:${String(leagueRel?.id)}`) ?? {};
      const gameObj = includedMap.get(`${gameRel?.type}:${String(gameRel?.id)}`) ?? {};

      const statName = firstNonEmpty(statObj?.attributes?.name, attrs?.stat_type, attrs?.market, attrs?.display_stat, "");
      if (!isPRA(statName)) continue;

      const leagueName = firstNonEmpty(leagueObj?.attributes?.name, attrs?.league, "NBA");
      if (normalizeText(leagueName) !== "nba") continue;

      const gameAttrs = gameObj?.attributes ?? {};
      const playerAttrs = playerObj?.attributes ?? {};
      const metadata = typeof gameAttrs?.metadata === "object" && gameAttrs?.metadata ? gameAttrs.metadata : {};

      const startTimeUtc = firstNonEmpty(gameAttrs?.start_time, attrs?.start_time, attrs?.board_time) as string | null;
      const dt = parseDateToLA(startTimeUtc);
      const gameDateLA = dt ? getLocalDateParts(dt, LOCAL_TZ).ymd : null;
      if (gameDateLA && gameDateLA !== todayLA) continue;

      const playerName = firstNonEmpty(playerAttrs?.name, attrs?.description, attrs?.name, "Unknown Player");
      const team = firstNonEmpty(playerAttrs?.team, playerAttrs?.team_abbreviation, attrs?.team, "UNK");
      const position = firstNonEmpty(playerAttrs?.position, attrs?.position);
      const homeTeam = firstNonEmpty(gameAttrs?.home_team, gameAttrs?.home, gameAttrs?.home_team_abbr, metadata?.home_team);
      const awayTeam = firstNonEmpty(gameAttrs?.away_team, gameAttrs?.away, gameAttrs?.away_team_abbr, metadata?.away_team);
      const matchup = (awayTeam && homeTeam) ? `${awayTeam} @ ${homeTeam}` : firstNonEmpty(gameAttrs?.title, gameAttrs?.name, `game_${String(gameRel?.id ?? "")}`);

      const lineScoreRaw = attrs?.line_score;
      const lineScore = lineScoreRaw === null || lineScoreRaw === undefined || lineScoreRaw === "" ? null : Number(lineScoreRaw);

      records.push({
        source: "prizepicks",
        league: "NBA",
        market_type: "PRA",
        projection_id: String(proj?.id ?? ""),
        game_id: gameRel?.id != null ? String(gameRel.id) : null,
        matchup,
        player_name: playerName,
        team,
        position,
        stat_type: statName,
        line_score: Number.isFinite(lineScore) ? lineScore : null,
        start_time_utc: startTimeUtc,
        start_time_local: dt ? toLocalISOString(dt, LOCAL_TZ) : null,
        board_time: attrs?.board_time ?? null,
        odds_type: attrs?.odds_type ?? null,
        is_promo: Boolean(attrs?.promo ?? false),
        fetched_at_local: fetchedAtLocal,
      });
    }

    records.sort((a, b) =>
      [a.start_time_local ?? "", a.matchup ?? "", a.team ?? "", a.player_name ?? ""].join("|")
        .localeCompare([b.start_time_local ?? "", b.matchup ?? "", b.team ?? "", b.player_name ?? ""].join("|"))
    );

    const flatPayload = {
      feed: "prizepicks_nba_pra_today_flat",
      date_local: todayLA,
      timezone: LOCAL_TZ,
      count: records.length,
      records,
    };

    const { data: rpcData, error: rpcError } = await supabase.rpc("ingest_prizepicks_props_bundle", { p_payload: flatPayload });

    if (rpcError) {
      return new Response(JSON.stringify({ ok: false, error: rpcError.message, record_count: records.length }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true, local_date: todayLA, timezone: LOCAL_TZ,
      scraped_count: records.length, ingest_result: rpcData,
      sample: records.slice(0, 5),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
