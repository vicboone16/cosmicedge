import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * NBA BDL Burst Loop — Scores, Odds, PBP
 *
 * Runs once per minute via pg_cron, internally loops ~40-60 times
 * with adaptive cadence:
 *   ≤5 live games → 1 s between ticks
 *   6+ live games → 1.5 s between ticks
 *
 * PHASE 0: Pre-resolves ALL BDL game IDs → internal UUIDs before looping.
 * Populates provider_game_map so the props sidecar can use them immediately.
 *
 * Budget: ~290-400 BDL req/min (leaves room for props sidecar)
 */

const BDL_BASE = "https://api.balldontlie.io";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const MAX_RUNTIME_MS = 55_000; // stop before 60 s edge-fn limit

function parseClockToSeconds(clock: string | null | undefined): number | null {
  if (!clock || clock.trim() === "") return null;
  const parts = clock.trim().split(":");
  if (parts.length !== 2) return null;
  const mins = parseInt(parts[0], 10);
  const secs = parseFloat(parts[1]);
  if (isNaN(mins) || isNaN(secs)) return null;
  return mins * 60 + Math.floor(secs);
}

function getProjectRef(): string {
  try {
    return new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname.split(".")[0];
  } catch { return ""; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Guards ──
  const LIVE_PROJECT_REF = Deno.env.get("LIVE_PROJECT_REF") ?? "";
  const currentRef = getProjectRef();
  if (LIVE_PROJECT_REF && currentRef !== LIVE_PROJECT_REF) {
    return new Response(JSON.stringify({ ok: false, reason: "not-live" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const cosmicLive = req.headers.get("x-cosmic-live");
  const authHeader = req.headers.get("authorization");
  if (cosmicLive !== "true" && !authHeader) {
    return new Response(JSON.stringify({ ok: false, reason: "not-live" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BDL_KEY_RAW = Deno.env.get("BALLDONTLIE_KEY")!;
  const BDL_KEY = BDL_KEY_RAW.trim().replace(/^Bearer\s+/i, "");
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const headers = { Authorization: `Bearer ${BDL_KEY}`, "X-Api-Key": BDL_KEY };

  const totals = { ticks: 0, games: 0, odds: 0, plays: 0, errors: 0, preResolved: 0 };
  const startMs = Date.now();

  // ── Pre-seed cosmic_games for today ──
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data: todayGames } = await sb
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, status")
      .eq("league", "NBA")
      .gte("start_time", today + "T00:00:00Z")
      .lte("start_time", today + "T23:59:59Z");

    if (todayGames?.length) {
      for (const g of todayGames) {
        const gameKey = `NBA_${today}_${g.away_abbr}_${g.home_abbr}`;
        await sb.from("cosmic_games").upsert({
          game_key: gameKey, league: "NBA", game_date: today,
          home_team_abbr: g.home_abbr, away_team_abbr: g.away_abbr,
          start_time_utc: g.start_time, season: "2025-26",
          status: g.status || "scheduled",
        }, { onConflict: "game_key" });
      }
    }
  } catch (e) {
    console.warn("[burst] cosmic_games pre-seed error (non-fatal):", e);
  }

  // ── Caches (persist across ALL ticks) ──
  const playerCache = new Map<string, string | null>(); // name → player.id
  const gameKeyMap = new Map<number, string>();          // bdlId → internal UUID

  async function resolvePlayer(name: string): Promise<string | null> {
    if (playerCache.has(name)) return playerCache.get(name)!;
    const { data } = await sb
      .from("players")
      .select("id")
      .eq("name", name)
      .eq("league", "NBA")
      .maybeSingle();
    const id = data?.id ?? null;
    playerCache.set(name, id);
    return id;
  }

  /** Resolve a single BDL game to internal UUID, persist to provider_game_map */
  async function resolveBdlGame(g: any): Promise<string | null> {
    if (gameKeyMap.has(g.id)) return gameKeyMap.get(g.id)!;

    const homeAbbr = g.home_team?.abbreviation ?? "";
    const awayAbbr = g.visitor_team?.abbreviation ?? "";
    const gameDate = g.date ? g.date.split("T")[0] : new Date().toISOString().split("T")[0];
    const d = new Date(gameDate + "T00:00:00Z");
    const dayBefore = new Date(d.getTime() - 86400000).toISOString().split("T")[0];
    const dayAfter = new Date(d.getTime() + 86400000).toISOString().split("T")[0];

    const { data: existing } = await sb
      .from("games")
      .select("id")
      .eq("league", "NBA")
      .eq("home_abbr", homeAbbr)
      .eq("away_abbr", awayAbbr)
      .gte("start_time", dayBefore + "T00:00:00Z")
      .lte("start_time", dayAfter + "T23:59:59Z")
      .maybeSingle();

    if (!existing?.id) {
      console.warn(`[burst] No match for ${awayAbbr}@${homeAbbr} date=${gameDate} bdlId=${g.id}`);
      return null;
    }

    gameKeyMap.set(g.id, existing.id);

    // Persist to provider_game_map so props sidecar can use it immediately
    await sb.from("provider_game_map").upsert({
      game_key: existing.id, league: "NBA", provider: "balldontlie",
      provider_game_id: String(g.id), game_date: gameDate,
      home_team_abbr: homeAbbr, away_team_abbr: awayAbbr,
      start_time_utc: g.date || null, updated_at: new Date().toISOString(),
    }, { onConflict: "game_key,provider" });

    return existing.id;
  }

  // ════════════════════════════════════════════════════════════════════
  // PHASE 0: Pre-resolve ALL BDL game IDs BEFORE the burst loop
  // ════════════════════════════════════════════════════════════════════

  // Load existing mappings from DB (covers games resolved by previous invocations)
  const { data: existingMaps } = await sb
    .from("provider_game_map")
    .select("game_key, provider_game_id")
    .eq("provider", "balldontlie")
    .eq("league", "NBA");

  if (existingMaps) {
    for (const m of existingMaps) {
      const bdlId = parseInt(m.provider_game_id, 10);
      if (!isNaN(bdlId)) gameKeyMap.set(bdlId, m.game_key);
    }
    console.log(`[burst] Loaded ${existingMaps.length} existing BDL→UUID mappings from DB`);
  }

  // Fetch live games once to discover any new BDL IDs
  let initialGames: any[] = [];
  try {
    const initRes = await fetch(`${BDL_BASE}/v1/box_scores/live`, { headers });
    if (initRes.ok) {
      initialGames = (await initRes.json()).data || [];
    }
  } catch (e) {
    console.warn("[burst] initial BDL fetch failed:", e);
  }

  // Resolve any NEW games not already in the cache
  for (const g of initialGames) {
    if (!gameKeyMap.has(g.id)) {
      const resolved = await resolveBdlGame(g);
      if (resolved) totals.preResolved++;
    }
  }

  console.log(`[burst] Pre-resolved ${totals.preResolved} new games, ${gameKeyMap.size} total mappings`);

  // ════════════════════════════════════════════════════════════════════
  // BURST LOOP
  // ════════════════════════════════════════════════════════════════════
  while (Date.now() - startMs < MAX_RUNTIME_MS) {
    totals.ticks++;

    try {
      // 1. Fetch live box scores
      const boxRes = await fetch(`${BDL_BASE}/v1/box_scores/live`, { headers });
      if (!boxRes.ok) {
        console.error(`[burst] box_scores/live ${boxRes.status}`);
        totals.errors++;
        await sleep(2000);
        continue;
      }
      const games: any[] = (await boxRes.json()).data || [];
      totals.games += games.length;

      if (games.length === 0) {
        console.log("[burst] No live games, sleeping 10s");
        await sleep(10000);
        continue;
      }

      // Adaptive cadence
      const cadenceMs = games.length <= 5 ? 1000 : 1500;
      const liveGameIds: number[] = [];

      // 2. Process each game — scores, quarters, snapshots, player stats
      for (const g of games) {
        const homeAbbr = g.home_team?.abbreviation ?? "";
        const awayAbbr = g.visitor_team?.abbreviation ?? "";

        // Resolve on-the-fly if a new game appeared mid-loop (rare)
        const gameKey = gameKeyMap.has(g.id)
          ? gameKeyMap.get(g.id)!
          : await resolveBdlGame(g);

        if (!gameKey) continue;

        // Update scores (realtime push via publication)
        const homeScore = g.home_team_score ?? null;
        const awayScore = g.visitor_team_score ?? null;
        const status = g.status === "Final" ? "final" : g.period > 0 ? "live" : "scheduled";

        await sb.from("games").update({
          home_score: homeScore, away_score: awayScore,
          status, updated_at: new Date().toISOString(),
        }).eq("id", gameKey);

        // Quarter scores
        if (g.home_team_periods && Array.isArray(g.home_team_periods)) {
          for (let i = 0; i < g.home_team_periods.length; i++) {
            await sb.from("game_quarters").upsert({
              game_id: gameKey, quarter: i + 1,
              home_score: g.home_team_periods[i],
              away_score: g.visitor_team_periods?.[i] ?? null,
            }, { onConflict: "game_id,quarter" });
          }
        }

        // Game state snapshot (triggers compute_live_wp → realtime push)
        const clockSec = parseClockToSeconds(g.time);
        await sb.from("game_state_snapshots").insert({
          game_id: gameKey,
          quarter: g.period ? String(g.period) : "0",
          home_score: homeScore, away_score: awayScore,
          clock: g.time ?? null, clock_seconds_remaining: clockSec,
          possession: g.possession?.abbreviation?.toLowerCase() === homeAbbr.toLowerCase() ? "home"
                    : g.possession?.abbreviation?.toLowerCase() === awayAbbr.toLowerCase() ? "away"
                    : null,
          status,
        });

        // Per-player box score stats
        const allPlayers = [
          ...(g.home_team?.players || []).map((p: any) => ({ ...p, teamAbbr: homeAbbr })),
          ...(g.visitor_team?.players || []).map((p: any) => ({ ...p, teamAbbr: awayAbbr })),
        ];

        for (const p of allPlayers) {
          if (!p.player?.id) continue;
          const playerName = `${p.player.first_name || ""} ${p.player.last_name || ""}`.trim();
          if (!playerName) continue;
          const internalId = await resolvePlayer(playerName);
          if (internalId) {
            await sb.from("player_game_stats").upsert({
              player_id: internalId, game_id: gameKey, team_abbr: p.teamAbbr,
              period: "full", points: p.pts ?? 0, rebounds: p.reb ?? 0,
              assists: p.ast ?? 0, steals: p.stl ?? 0, blocks: p.blk ?? 0,
              turnovers: p.turnover ?? 0,
              minutes: p.min ? parseFloat(p.min) : 0,
              fg_made: p.fgm ?? 0, fg_attempted: p.fga ?? 0,
              three_made: p.fg3m ?? 0, three_attempted: p.fg3a ?? 0,
              ft_made: p.ftm ?? 0, ft_attempted: p.fta ?? 0,
            }, { onConflict: "player_id,game_id,period" });
          }
        }

        if (status !== "final") liveGameIds.push(g.id);
      }

      // 3. Fetch odds (batched)
      if (liveGameIds.length > 0) {
        try {
          const idsParam = liveGameIds.map(id => `game_ids[]=${id}`).join("&");
          const oddsRes = await fetch(`${BDL_BASE}/v2/odds?${idsParam}`, { headers });
          if (oddsRes.ok) {
            const oddsItems: any[] = (await oddsRes.json()).data || [];
            for (const o of oddsItems) {
              const gk = gameKeyMap.get(o.game?.id);
              if (!gk) continue;
              for (const book of (o.bookmakers || [])) {
                const vendor = book.name || book.key || "unknown";
                for (const mkt of (book.markets || [])) {
                  const market = mkt.key || mkt.name || "unknown";
                  const outcomes = mkt.outcomes || [];
                  const home = outcomes.find((x: any) => x.name === "Home" || x.name === homeTeamFor(gk, gameKeyMap, games));
                  const away = outcomes.find((x: any) => x.name === "Away" || x.name !== home?.name);
                  const over = outcomes.find((x: any) => x.name === "Over");
                  const under = outcomes.find((x: any) => x.name === "Under");

                  await sb.from("nba_game_odds").upsert({
                    game_key: gk, provider: "balldontlie", vendor, market,
                    home_line: home?.point ?? null, away_line: away?.point ?? null,
                    total: over?.point ?? under?.point ?? null,
                    home_odds: home?.price ?? null, away_odds: away?.price ?? null,
                    over_odds: over?.price ?? null, under_odds: under?.price ?? null,
                    raw: mkt, updated_at: new Date().toISOString(),
                  }, { onConflict: "game_key,provider,vendor,market" });
                  totals.odds++;
                }
              }
            }
          }
        } catch (e) {
          console.error("[burst] odds error:", e);
          totals.errors++;
        }
      }

      // 4. PBP for each live game (parallel, max 5 concurrent)
      const pbpChunks: number[][] = [];
      for (let i = 0; i < liveGameIds.length; i += 5) {
        pbpChunks.push(liveGameIds.slice(i, i + 5));
      }
      for (const chunk of pbpChunks) {
        await Promise.all(chunk.map(async (bdlGameId) => {
          const gk = gameKeyMap.get(bdlGameId);
          if (!gk) return;
          try {
            const pbpRes = await fetch(`${BDL_BASE}/v1/plays?game_id=${bdlGameId}`, { headers });
            if (pbpRes.ok) {
              const plays: any[] = (await pbpRes.json()).data || [];
              for (const play of plays) {
                const eventId = String(play.id || `${play.period}-${play.clock}-${play.description?.slice(0, 20)}`);
                  await sb.from("nba_pbp_events").upsert({
                    game_key: gk, provider: "balldontlie",
                    provider_game_id: String(bdlGameId), provider_event_id: eventId,
                    period: play.period ?? 1,
                    event_ts_game: play.clock ?? play.time ?? null,
                    event_type: play.type ?? play.event_type ?? null,
                    description: play.text ?? play.description ?? null,
                    team_abbr: play.team?.abbreviation ?? null,
                    player_id: play.player?.id ? String(play.player.id) : null,
                    player_name: play.player ? `${play.player.first_name || ""} ${play.player.last_name || ""}`.trim() : null,
                    home_score: play.home_score ?? null,
                    away_score: play.away_score ?? null,
                    raw: play,
                  }, { onConflict: "game_key,provider,provider_event_id" });
                totals.plays++;
              }
            } else if (pbpRes.status === 429) {
              console.warn(`[burst] 429 on plays for game ${bdlGameId}`);
            }
          } catch (e) {
            console.error(`[burst] plays error game ${bdlGameId}:`, e);
            totals.errors++;
          }
        }));
      }

      // Sleep for adaptive cadence before next tick
      await sleep(cadenceMs);

    } catch (e) {
      console.error("[burst] tick error:", e);
      totals.errors++;
      await sleep(2000);
    }
  }

  console.log(`[burst] Done: ${JSON.stringify(totals)}`);
  return new Response(JSON.stringify({ ok: true, totals }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function homeTeamFor(gameKey: string, gameKeyMap: Map<number, string>, games: any[]): string {
  for (const [bdlId, gk] of gameKeyMap) {
    if (gk === gameKey) {
      const g = games.find((x: any) => x.id === bdlId);
      return g?.home_team?.full_name || g?.home_team?.name || "";
    }
  }
  return "";
}
