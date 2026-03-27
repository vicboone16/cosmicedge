import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { computeProjection, getStatStdDev, type PropContext } from "../_shared/prop-projection.ts";
import { normalizeAbbr } from "../_shared/team-mappings.ts";

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

function deriveGameStatus(g: any): "scheduled" | "live" | "final" {
  const statusText = String(g?.status ?? g?.game_status ?? "").toLowerCase();
  const periodNum = Number(g?.period ?? 0);
  const homeScore = Number(g?.home_team_score ?? 0);
  const awayScore = Number(g?.visitor_team_score ?? 0);

  const isFinal = statusText.includes("final");
  const isLiveByText = /(live|in progress|halftime|quarter|q[1-4]|ot)/.test(statusText);
  const isLiveByData = periodNum > 0 || homeScore > 0 || awayScore > 0;

  if (isFinal) return "final";
  if (isLiveByText || isLiveByData) return "live";
  return "scheduled";
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

  const totals: Record<string, number> = { ticks: 0, games: 0, odds: 0, plays: 0, errors: 0, preResolved: 0, quarterStatsTriggers: 0, propStates: 0 };
  const finalizedGames = new Set<number>(); // BDL IDs of games that went final this invocation
  const startMs = Date.now();

  // ── Pre-seed cosmic_games for today ──
  // Use PST-aware window: yesterday 4am UTC → tomorrow 8am UTC covers all PST evening games
  try {
    const now = new Date();
    const yesterdayUTC = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString().split("T")[0];
    const tomorrowUTC = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString().split("T")[0];
    const today = yesterdayUTC; // for cosmic_games key
    const { data: todayGames } = await sb
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, status")
      .eq("league", "NBA")
      .gte("start_time", yesterdayUTC + "T04:00:00Z")
      .lte("start_time", tomorrowUTC + "T07:59:59Z");

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

  // ── Time-based fallback: flip "scheduled" → "live" if start_time has passed ──
  // This ensures games appear on the live slate even if the BDL webhook is delayed.
  try {
    const now = new Date().toISOString();
    const { data: overdue } = await sb
      .from("games")
      .select("id, home_abbr, away_abbr")
      .eq("league", "NBA")
      .eq("status", "scheduled")
      .lte("start_time", now);

    if (overdue?.length) {
      for (const g of overdue) {
        await sb.from("games").update({
          status: "live",
          updated_at: now,
        }).eq("id", g.id);
        console.log(`[burst] Time-fallback: flipped ${g.away_abbr}@${g.home_abbr} (${g.id}) → live`);
      }
      console.log(`[burst] Time-fallback flipped ${overdue.length} overdue games to live`);
    }
  } catch (e) {
    console.warn("[burst] time-fallback error (non-fatal):", e);
  }

  // ── Caches (persist across ALL ticks) ──
  const playerCache = new Map<string, string | null>(); // name → player.id
  const gameKeyMap = new Map<number, string>();          // bdlId → internal UUID

  async function resolvePlayer(name: string, teamAbbr?: string): Promise<string | null> {
    const cacheKey = teamAbbr ? `${name}::${teamAbbr}` : name;
    if (playerCache.has(cacheKey)) return playerCache.get(cacheKey)!;

    // Prefer team-scoped match to avoid same-name collisions
    if (teamAbbr) {
      const { data: teamMatch } = await sb
        .from("players")
        .select("id")
        .eq("name", name)
        .eq("league", "NBA")
        .eq("team", teamAbbr)
        .maybeSingle();
      if (teamMatch?.id) {
        playerCache.set(cacheKey, teamMatch.id);
        playerCache.set(name, teamMatch.id); // also cache without team
        return teamMatch.id;
      }
    }

    // Fallback: league-only match (existing behavior)
    const { data } = await sb
      .from("players")
      .select("id")
      .eq("name", name)
      .eq("league", "NBA")
      .maybeSingle();
    const id = data?.id ?? null;
    playerCache.set(cacheKey, id);
    playerCache.set(name, id);
    return id;
  }

  /** Resolve a single BDL game to internal UUID, persist to provider_game_map */
  async function resolveBdlGame(g: any): Promise<string | null> {
    if (gameKeyMap.has(g.id)) return gameKeyMap.get(g.id)!;

    const homeAbbr = normalizeAbbr("NBA", g.home_team?.abbreviation ?? "");
    const awayAbbr = normalizeAbbr("NBA", g.visitor_team?.abbreviation ?? "");
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
        const homeAbbr = normalizeAbbr("NBA", g.home_team?.abbreviation ?? "");
        const awayAbbr = normalizeAbbr("NBA", g.visitor_team?.abbreviation ?? "");

        // Resolve on-the-fly if a new game appeared mid-loop (rare)
        const gameKey = gameKeyMap.has(g.id)
          ? gameKeyMap.get(g.id)!
          : await resolveBdlGame(g);

        if (!gameKey) continue;

        // Update scores (realtime push via publication)
        const homeScore = g.home_team_score ?? null;
        const awayScore = g.visitor_team_score ?? null;
        const status = g.status === "Final" ? "final" : g.period > 0 ? "live" : "scheduled";

        // ── Freeze pregame odds at tipoff ──
        // On first tick where game becomes live, snapshot current odds into pregame_odds
        if (status === "live" && totals.ticks === 1) {
          try {
            const { data: existingFreeze } = await sb.from("pregame_odds")
              .select("id").eq("game_id", gameKey).limit(1);
            if (!existingFreeze?.length) {
              // Grab earliest odds_snapshots as pregame
              const { data: preOdds } = await sb.from("odds_snapshots")
                .select("market_type, home_price, away_price, line, bookmaker")
                .eq("game_id", gameKey)
                .order("captured_at", { ascending: true })
                .limit(50);
              if (preOdds?.length) {
                const seen = new Set<string>();
                const rows = preOdds.filter(o => {
                  const k = `${o.market_type}_${o.bookmaker || 'consensus'}`;
                  if (seen.has(k)) return false;
                  seen.add(k);
                  return true;
                }).map(o => ({
                  game_id: gameKey,
                  market_type: o.market_type,
                  home_price: o.home_price,
                  away_price: o.away_price,
                  line: o.line,
                  bookmaker: o.bookmaker || "consensus",
                }));
                await sb.from("pregame_odds").upsert(rows, { onConflict: "game_id,market_type,bookmaker" });
                console.log(`[burst] Froze ${rows.length} pregame odds for game ${gameKey}`);
              }
            }
          } catch (e) {
            console.warn(`[burst] pregame freeze error for ${gameKey}:`, e);
          }
        }

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
          const internalId = await resolvePlayer(playerName, p.teamAbbr);
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
              personal_fouls: p.pf ?? 0,
              off_rebounds: p.oreb ?? 0, def_rebounds: p.dreb ?? 0,
              plus_minus: p.plus_minus ?? null,
              starter: p.starter != null ? p.starter : null,
            }, { onConflict: "player_id,game_id,period" });
          }
        }

        if (status !== "final") {
          liveGameIds.push(g.id);
        } else if (!finalizedGames.has(g.id)) {
          // Game just went final — trigger quarter stats backfill
          finalizedGames.add(g.id);
          try {
            const today = new Date().toISOString().split("T")[0];
            const qsUrl = `${SUPABASE_URL}/functions/v1/bdl-quarter-stats?date=${today}&game_ids=${g.id}&season=2025`;
            const qsRes = await fetch(qsUrl, {
              headers: { Authorization: `Bearer ${SERVICE_KEY}` },
            });
            if (qsRes.ok) {
              const qsResult = await qsRes.json();
              console.log(`[burst] Quarter stats triggered for BDL game ${g.id}: ${JSON.stringify(qsResult.stats || {})}`);
              totals.quarterStatsTriggers++;
            } else {
              console.warn(`[burst] Quarter stats trigger failed for ${g.id}: ${qsRes.status}`);
            }
          } catch (e) {
            console.warn(`[burst] Quarter stats trigger error for ${g.id}:`, e);
          }
        }
      }

      // 3. Fetch odds (batched) — supports both v2 flat and legacy nested format
      if (liveGameIds.length > 0) {
        try {
          const idsParam = liveGameIds.map(id => `game_ids[]=${id}`).join("&");
          const oddsRes = await fetch(`${BDL_BASE}/v2/odds?${idsParam}`, { headers });
          if (oddsRes.ok) {
            const oddsItems: any[] = (await oddsRes.json()).data || [];
            for (const o of oddsItems) {
              // v2 flat format: game_id is top-level number
              const bdlGameId = o.game?.id ?? o.game_id ?? null;
              const gk = bdlGameId ? gameKeyMap.get(Number(bdlGameId)) : null;
              if (!gk) continue;
              const vendor = o.vendor || o.bookmaker || "unknown";
              const now = new Date().toISOString();

              // v2 flat format detection (has moneyline_home_odds or spread_home_line)
              if (o.moneyline_home_odds != null || o.spread_home_line != null || o.total_over_odds != null) {
                if (o.moneyline_home_odds != null || o.moneyline_away_odds != null) {
                  await sb.from("nba_game_odds").upsert({
                    game_key: gk, provider: "balldontlie", vendor, market: "moneyline",
                    home_odds: o.moneyline_home_odds ?? null,
                    away_odds: o.moneyline_away_odds ?? null,
                    home_line: null, away_line: null, total: null,
                    over_odds: null, under_odds: null,
                    raw: o, updated_at: now,
                  }, { onConflict: "game_key,provider,vendor,market" });
                  totals.odds++;
                }
                if (o.spread_home_line != null) {
                  await sb.from("nba_game_odds").upsert({
                    game_key: gk, provider: "balldontlie", vendor, market: "spread",
                    home_line: o.spread_home_line ?? null,
                    away_line: o.spread_away_line ?? (o.spread_home_line ? -o.spread_home_line : null),
                    home_odds: o.spread_home_odds ?? null,
                    away_odds: o.spread_away_odds ?? null,
                    total: null, over_odds: null, under_odds: null,
                    raw: o, updated_at: now,
                  }, { onConflict: "game_key,provider,vendor,market" });
                  totals.odds++;
                }
                if (o.total_over_odds != null || o.total_line != null) {
                  await sb.from("nba_game_odds").upsert({
                    game_key: gk, provider: "balldontlie", vendor, market: "total",
                    total: o.total_line ?? null,
                    over_odds: o.total_over_odds ?? null,
                    under_odds: o.total_under_odds ?? null,
                    home_line: null, away_line: null,
                    home_odds: null, away_odds: null,
                    raw: o, updated_at: now,
                  }, { onConflict: "game_key,provider,vendor,market" });
                  totals.odds++;
                }
                continue;
              }

              // Legacy nested bookmakers format fallback
              for (const book of (o.bookmakers || [])) {
                const legacyVendor = book.name || book.key || "unknown";
                for (const mkt of (book.markets || [])) {
                  const market = mkt.key || mkt.name || "unknown";
                  const outcomes = mkt.outcomes || [];
                  const home = outcomes.find((x: any) => x.name === "Home" || x.name === homeTeamFor(gk, gameKeyMap, games));
                  const away = outcomes.find((x: any) => x.name === "Away" || (home && x.name !== home.name));
                  const over = outcomes.find((x: any) => x.name === "Over");
                  const under = outcomes.find((x: any) => x.name === "Under");

                  await sb.from("nba_game_odds").upsert({
                    game_key: gk, provider: "balldontlie", vendor: legacyVendor, market,
                    home_line: home?.point ?? null, away_line: away?.point ?? null,
                    total: over?.point ?? under?.point ?? null,
                    home_odds: home?.price ?? null, away_odds: away?.price ?? null,
                    over_odds: over?.price ?? null, under_odds: under?.price ?? null,
                    raw: mkt, updated_at: now,
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

      // 5. Compute live prop state for all active tracked props + slip picks
      if (liveGameIds.length > 0) {
        try {
          const activeGameKeys = liveGameIds.map(id => gameKeyMap.get(id)).filter(Boolean) as string[];
          
          // Gather all props to compute: tracked_props + bet_slip_picks
          const [{ data: trackedRows }, { data: slipRows }] = await Promise.all([
            sb.from("tracked_props")
              .select("game_id, player_id, player_name, market_type, line, direction, odds")
              .in("game_id", activeGameKeys)
              .not("status", "in", '("hit","missed","push")'),
            sb.from("bet_slip_picks")
              .select("game_id, player_id, player_name_raw, stat_type, line, direction")
              .in("game_id", activeGameKeys)
              .is("result", null),
          ]);

          // Merge into unique prop keys
          const propMap = new Map<string, { gameId: string; playerId: string; propType: string; line: number; periodScope: string; odds: number | null }>();
          
          const parsePeriod = (raw: string) => {
            const idx = raw.indexOf(":");
            if (idx > 0) {
              const prefix = raw.slice(0, idx).toLowerCase();
              if (["q1","q2","q3","q4","1h","2h","full"].includes(prefix)) {
                return { period: prefix, market: raw.slice(idx + 1) };
              }
            }
            return { period: "full", market: raw };
          };

          for (const tp of (trackedRows || [])) {
            if (!tp.player_id || !tp.game_id) continue;
            const { period, market } = parsePeriod(tp.market_type || "");
            const key = `${tp.game_id}:${tp.player_id}:${market}:${tp.line}:${period}`;
            if (!propMap.has(key)) {
              propMap.set(key, { gameId: tp.game_id, playerId: tp.player_id, propType: market, line: Number(tp.line), periodScope: period, odds: tp.odds ? Number(tp.odds) : null });
            }
          }
          for (const sp of (slipRows || [])) {
            if (!sp.player_id || !sp.game_id) continue;
            const { period, market } = parsePeriod(sp.stat_type || "");
            const key = `${sp.game_id}:${sp.player_id}:${market}:${sp.line}:${period}`;
            if (!propMap.has(key)) {
              propMap.set(key, { gameId: sp.game_id, playerId: sp.player_id, propType: market, line: Number(sp.line), periodScope: period, odds: null });
            }
          }

          if (propMap.size > 0) {
            // Get player stats and season averages
            const playerIds = [...new Set([...propMap.values()].map(p => p.playerId))];
            const [{ data: gameStats }, { data: seasonStats }, { data: depthRows }] = await Promise.all([
              sb.from("player_game_stats")
                .select("player_id, game_id, period, points, rebounds, assists, steals, blocks, turnovers, three_made, minutes, fouls, personal_fouls")
                .in("game_id", activeGameKeys)
                .in("player_id", playerIds),
              sb.from("player_season_stats")
                .select("player_id, stat_type, period, average, std_dev")
                .in("player_id", playerIds)
                .eq("period", "full"),
              sb.from("depth_charts")
                .select("player_id, depth_order")
                .in("player_id", playerIds)
                .eq("league", "NBA"),
            ]);

            // Build lookups
            const statsByKey = new Map<string, any>();
            for (const s of (gameStats || [])) {
              statsByKey.set(`${s.player_id}:${s.game_id}:${s.period || "full"}`, s);
            }
            const seasonByPlayer = new Map<string, any>();
            for (const s of (seasonStats || [])) {
              if (!seasonByPlayer.has(s.player_id)) seasonByPlayer.set(s.player_id, {});
              seasonByPlayer.get(s.player_id)![s.stat_type] = s;
            }
            const starterSet = new Set<string>();
            for (const d of (depthRows || [])) {
              if (d.depth_order === 1 && d.player_id) starterSet.add(d.player_id);
            }

            // Get current game snapshots for quarter/clock
            const { data: snapshots } = await sb.from("game_state_snapshots")
              .select("game_id, quarter, clock_seconds_remaining, home_score, away_score")
              .in("game_id", activeGameKeys)
              .order("captured_at", { ascending: false });
            const latestSnap = new Map<string, any>();
            for (const s of (snapshots || [])) {
              if (!latestSnap.has(s.game_id)) latestSnap.set(s.game_id, s);
            }

            // Stat value resolver
            const STAT_COLS: Record<string, string[]> = {
              points: ["points"], rebounds: ["rebounds"], assists: ["assists"],
              steals: ["steals"], blocks: ["blocks"], turnovers: ["turnovers"],
              threes: ["three_made"], three_made: ["three_made"],
              pra: ["points", "rebounds", "assists"],
              player_points_rebounds_assists: ["points", "rebounds", "assists"],
              player_points: ["points"], player_rebounds: ["rebounds"], player_assists: ["assists"],
              player_steals: ["steals"], player_blocks: ["blocks"],
              player_points_rebounds: ["points", "rebounds"],
              player_points_assists: ["points", "assists"],
              player_rebounds_assists: ["rebounds", "assists"],
              player_steals_blocks: ["steals", "blocks"],
            };

            const sumStat = (row: any, propType: string) => {
              const cols = STAT_COLS[propType] || STAT_COLS[propType.replace(/^player_/, "")] || ["points"];
              return cols.reduce((acc, c) => acc + (Number(row?.[c]) || 0), 0);
            };

            // Compute and upsert
            const upserts: any[] = [];
            for (const [, prop] of propMap) {
              const snap = latestSnap.get(prop.gameId);
              const quarter = snap ? parseInt(snap.quarter || "1", 10) : 1;
              const clockSec = snap?.clock_seconds_remaining ?? null;

              // Get current stat value for the period
              const statRow = statsByKey.get(`${prop.playerId}:${prop.gameId}:${prop.periodScope === "full" ? "full" : prop.periodScope}`);
              const currentValue = statRow ? sumStat(statRow, prop.propType) : 0;
              const minutesPlayed = statRow ? Number(statRow.minutes || 0) : 0;
              const foulCount = statRow ? Number(statRow.personal_fouls || statRow.fouls || 0) : 0;

              // Season averages
              const seasonData = seasonByPlayer.get(prop.playerId);
              const avgMinEntry = seasonData?.minutes;
              const historicalAvgMinutes = avgMinEntry?.average ? Number(avgMinEntry.average) : 30;

              // Get historical std dev for this stat type
              const statKey = (STAT_COLS[prop.propType] || STAT_COLS[prop.propType.replace(/^player_/, "")] || ["points"])[0];
              const seasonStatEntry = seasonData?.[statKey];
              const historicalStdDev = seasonStatEntry?.std_dev ? Number(seasonStatEntry.std_dev) : null;

              const ctx: PropContext = {
                currentValue,
                line: prop.line,
                periodScope: prop.periodScope,
                quarter,
                clockSec,
                minutesPlayed,
                historicalAvgMinutes,
                historicalStdDev,
                foulCount,
                homeScore: snap?.home_score ?? 0,
                awayScore: snap?.away_score ?? 0,
                isStarter: starterSet.has(prop.playerId),
                odds: prop.odds,
                // Phase 6: Astro timing overlay (placeholder — populated by astro-batch)
                astroModifier: null,
                astroNote: null,
              };

              const result = computeProjection(ctx);

              upserts.push({
                game_id: prop.gameId,
                player_id: prop.playerId,
                prop_type: prop.propType,
                line: prop.line,
                period_scope: prop.periodScope,
                current_value: currentValue,
                minutes_played: minutesPlayed,
                foul_count: foulCount,
                projected_final: result.projectedFinal,
                projected_minutes: result.projectedMinutes,
                stat_rate: result.statRate,
                pace_pct: result.pacePct,
                hit_probability: result.hitProbability,
                implied_probability: result.impliedProbability,
                live_edge: result.liveEdge,
                expected_return: result.expectedReturn,
                live_confidence: result.liveConfidence,
                volatility: result.volatility,
                minutes_security_score: result.minutesSecurityScore,
                blowout_probability: result.blowoutProbability,
                foul_risk_level: result.foulRiskLevel,
                status_label: result.statusLabel,
                game_quarter: quarter,
                game_clock: snap?.clock_seconds_remaining != null ? `${Math.floor(snap.clock_seconds_remaining / 60)}:${String(Math.floor(snap.clock_seconds_remaining % 60)).padStart(2, "0")}` : null,
                home_score: snap?.home_score ?? null,
                away_score: snap?.away_score ?? null,
                updated_at: new Date().toISOString(),
              });
            }

            // Batch upsert in chunks of 50
            for (let i = 0; i < upserts.length; i += 50) {
              await sb.from("live_prop_state").upsert(
                upserts.slice(i, i + 50),
                { onConflict: "game_id,player_id,prop_type,line,period_scope" }
              );
            }
            totals.propStates = (totals.propStates || 0) + upserts.length;
          }
        } catch (e) {
          console.error("[burst] prop state sync error:", e);
          totals.errors++;
        }
      }

      // Sleep for adaptive cadence before next tick
      await sleep(cadenceMs);

    } catch (e) {
      console.error("[burst] tick error:", e);
      totals.errors++;
      await sleep(2000);
    }
  }

  // ── Post-loop: compute live readiness for all processed games ──
  const readinessResults: Record<string, any> = {};
  const processedGameIds = new Set(gameKeyMap.values());
  for (const gid of processedGameIds) {
    try {
      const { data } = await sb.rpc("compute_live_readiness", { p_game_id: gid });
      readinessResults[gid] = data;
    } catch (e) {
      console.warn(`[burst] readiness compute failed for ${gid}:`, e);
    }
  }
  totals.readinessChecks = Object.keys(readinessResults).length;

  console.log(`[burst] Done: ${JSON.stringify(totals)}`);
  return new Response(JSON.stringify({ ok: true, totals, readiness: readinessResults }), {
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
