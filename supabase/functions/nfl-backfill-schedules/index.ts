import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("ROLLING_WAVE_API_KEY")!;
const BASE = "http://rest.datafeeds.rolling-insights.com/api/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { years = [2024, 2025], action = "backfill" } = await req.json().catch(() => ({}));
    const results: any[] = [];

    if (action === "backfill") {
      for (const year of years) {
        const result = await backfillSeason(sb, year);
        results.push(result);
      }
    } else if (action === "weekly") {
      const result = await refreshWeekly(sb);
      results.push(result);
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("NFL backfill error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Cache helpers ──────────────────────────────────────────

function makeFetchKey(endpoint: string, params: Record<string, any>): string {
  const sorted = Object.keys(params).sort().reduce((acc, k) => ((acc as any)[k] = params[k], acc), {} as Record<string, any>);
  // Simple hash via string
  const raw = `${endpoint}|${JSON.stringify(sorted)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `rw_${Math.abs(hash).toString(36)}`;
}

async function cachedFetch(sb: any, endpoint: string, params: Record<string, any>) {
  const key = makeFetchKey(endpoint, params);

  // Check cache
  const { data: logEntry } = await sb
    .from("api_fetch_log")
    .select("cooldown_until")
    .eq("fetch_key", key)
    .maybeSingle();

  if (logEntry?.cooldown_until && new Date(logEntry.cooldown_until) > new Date()) {
    console.log(`Cache hit for ${key}, skipping`);
    return { status: "cached_skip" as const, data: null };
  }

  // Build URL with params
  const url = new URL(endpoint);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  console.log(`Fetching: ${url.toString()}`);
  const res = await fetch(url.toString());

  // Compute cooldown
  const now = new Date();
  let cooldownMinutes = 60; // default 1 hour
  if (res.status === 304) cooldownMinutes = 360; // 6 hours for not-modified
  if (res.status === 429) cooldownMinutes = 30;
  const cooldownUntil = new Date(now.getTime() + cooldownMinutes * 60000).toISOString();

  // Log the fetch
  await sb.from("api_fetch_log").upsert({
    fetch_key: key,
    endpoint,
    params_json: params,
    last_http_status: res.status,
    last_fetched_at: now.toISOString(),
    cooldown_until: cooldownUntil,
  }, { onConflict: "fetch_key" });

  if (res.status === 304) return { status: "not_modified" as const, data: null };
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();

  // Some APIs return 200 with an error payload
  if (data?.error) {
    console.error(`API error in 200 response:`, data.error, data.message);
    throw new Error(`API returned error: ${data.message || data.error}`);
  }

  return { status: "ok" as const, data };
}

// ── Backfill full season ──────────────────────────────────

async function backfillSeason(sb: any, year: number) {
  const { status, data } = await cachedFetch(sb, `${BASE}/schedule-season/${year}/NFL`, {
    RSC_token: API_KEY,
  });

  if (status !== "ok" || !data) return { year, status, games: 0 };

  // Debug: log full response for diagnosis
  console.log(`Year ${year} full response:`, JSON.stringify(data).slice(0, 500));

  // The API may return data in various structures - handle both
  const games = extractGames(data);
  console.log(`Year ${year}: found ${games.length} games`);

  if (games.length === 0) return { year, status: "no_games", games: 0 };

  // Upsert in chunks
  const CHUNK = 100;
  let upserted = 0;
  for (let i = 0; i < games.length; i += CHUNK) {
    const chunk = games.slice(i, i + CHUNK).map(normalizeGame);
    const { error } = await sb.from("nfl_games").upsert(chunk, { onConflict: "game_id" });
    if (error) {
      console.error(`Upsert error chunk ${i}:`, error.message);
    } else {
      upserted += chunk.length;
    }
  }

  return { year, status: "ok", games: upserted };
}

// ── Weekly refresh ────────────────────────────────────────

async function refreshWeekly(sb: any) {
  // Get current week's date range
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1; // NFL season year

  const { status, data } = await cachedFetch(sb, `${BASE}/schedule-season/${year}/NFL`, {
    RSC_token: API_KEY,
  });

  if (status !== "ok" || !data) return { status, updated: 0 };

  // Filter to games within 7 days
  const weekStart = new Date(now.getTime() - 2 * 86400000);
  const weekEnd = new Date(now.getTime() + 7 * 86400000);

  const allGames = extractGames(data);
  const weekGames = allGames.filter((g: any) => {
    const gt = new Date(g.game_time || g.gameTime || g.game_date);
    return gt >= weekStart && gt <= weekEnd;
  });

  const normalized = weekGames.map(normalizeGame);
  if (normalized.length > 0) {
    const { error } = await sb.from("nfl_games").upsert(normalized, { onConflict: "game_id" });
    if (error) console.error("Weekly upsert error:", error.message);
  }

  return { status: "ok", updated: normalized.length };
}

// ── Helpers ───────────────────────────────────────────────

function extractGames(data: any): any[] {
  // Handle various API response shapes
  if (Array.isArray(data)) return data;
  if (data?.body && Array.isArray(data.body)) return data.body;
  if (data?.games && Array.isArray(data.games)) return data.games;
  if (data?.schedule && Array.isArray(data.schedule)) return data.schedule;
  if (data?.data && Array.isArray(data.data)) return data.data;
  // Try finding first array value
  for (const val of Object.values(data)) {
    if (Array.isArray(val) && (val as any[]).length > 0) return val as any[];
  }
  return [];
}

function normalizeGame(row: any) {
  return {
    game_id: String(row.game_ID ?? row.game_id ?? row.gameID ?? row.id),
    season_year: row.season ?? row.season_year,
    season_type: row.season_type ?? row.seasonType,
    week: row.week != null ? Number(row.week) : null,
    round: row.round ?? null,
    event_name: row.event_name ?? row.eventName ?? null,
    status: row.status ?? "scheduled",
    game_time: row.game_time ?? row.gameTime ?? row.game_date ?? null,
    home_team_id: row.home_team_ID ?? row.home_team_id ?? row.homeTeamId ?? null,
    away_team_id: row.away_team_ID ?? row.away_team_id ?? row.awayTeamId ?? null,
    home_team_name: row.home_team ?? row.homeTeam ?? row.home_team_name ?? null,
    away_team_name: row.away_team ?? row.awayTeam ?? row.away_team_name ?? null,
    home_score: row.home_score ?? row.homeScore ?? null,
    away_score: row.away_score ?? row.awayScore ?? null,
    arena: row.arena ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    country: row.country ?? null,
    latitude: row.latitude ? Number(row.latitude) : null,
    longitude: row.longitude ? Number(row.longitude) : null,
    postal_code: row.postal_code ?? row.postalCode ?? null,
    dome: row.dome ?? null,
    field: row.field ?? null,
    raw_json: row,
  };
}
