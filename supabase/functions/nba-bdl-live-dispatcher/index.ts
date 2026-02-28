import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const LIVE_REF = "gwfgmlfggeyxexclwybk";
const BDL_BASE = "https://api.balldontlie.io";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── LIVE-PROJECT GUARD ──
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  if (!SUPABASE_URL.includes(LIVE_REF)) {
    console.warn("[nba-bdl] Not live project, aborting");
    return new Response(JSON.stringify({ ok: false, reason: "not-live" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Header guard for cron invocations ──
  const cosmicLive = req.headers.get("x-cosmic-live");
  const authHeader = req.headers.get("authorization");
  // Allow either the header guard OR a valid bearer token (for manual invocations)
  if (cosmicLive !== "true" && !authHeader) {
    return new Response(JSON.stringify({ ok: false, reason: "not-live" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BDL_KEY_RAW = Deno.env.get("BALLDONTLIE_KEY")!;
    const BDL_KEY = BDL_KEY_RAW.trim().replace(/^Bearer\s+/i, "");
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const headers = { Authorization: BDL_KEY, "X-Api-Key": BDL_KEY };
    const stats = { games: 0, odds: 0, plays: 0, props: 0, errors: 0 };

    // ── 1. Fetch live box scores ──
    const boxRes = await fetch(`${BDL_BASE}/v1/box_scores/live`, { headers });
    if (!boxRes.ok) {
      console.error(`[nba-bdl] box_scores/live ${boxRes.status}`);
      stats.errors++;
      return new Response(JSON.stringify({ ok: false, stats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const boxData = await boxRes.json();
    const games: any[] = boxData.data || [];
    stats.games = games.length;

    if (games.length === 0) {
      console.log("[nba-bdl] No live games");
      return new Response(JSON.stringify({ ok: true, stats, msg: "no-live-games" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Map games → provider_game_map + update scores ──
    const liveGameIds: number[] = [];
    const gameKeyMap = new Map<number, string>(); // bdl_id → game_key (uuid)

    for (const g of games) {
      const bdlId = String(g.id);
      const homeAbbr = g.home_team?.abbreviation ?? "";
      const awayAbbr = g.visitor_team?.abbreviation ?? "";
      const gameDate = g.date ? g.date.split("T")[0] : new Date().toISOString().split("T")[0];

      // Try to find existing internal game
      const { data: existing } = await sb
        .from("games")
        .select("id")
        .eq("league", "NBA")
        .eq("home_abbr", homeAbbr)
        .eq("away_abbr", awayAbbr)
        .gte("start_time", gameDate + "T00:00:00Z")
        .lte("start_time", gameDate + "T23:59:59Z")
        .maybeSingle();

      const gameKey = existing?.id;
      if (!gameKey) continue;

      gameKeyMap.set(g.id, gameKey);

      // Upsert provider_game_map
      await sb.from("provider_game_map").upsert({
        game_key: gameKey,
        league: "NBA",
        provider: "balldontlie",
        provider_game_id: bdlId,
        game_date: gameDate,
        home_team_abbr: homeAbbr,
        away_team_abbr: awayAbbr,
        start_time_utc: g.date || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "game_key,provider" });

      // Update live scores on games table
      const homeScore = g.home_team_score ?? null;
      const awayScore = g.visitor_team_score ?? null;
      const status = g.status === "Final" ? "final" : g.period > 0 ? "live" : "scheduled";

      await sb.from("games").update({
        home_score: homeScore,
        away_score: awayScore,
        status,
        updated_at: new Date().toISOString(),
      }).eq("id", gameKey);

      // Upsert quarter scores from box score periods if available
      if (g.home_team_periods && Array.isArray(g.home_team_periods)) {
        for (let i = 0; i < g.home_team_periods.length; i++) {
          const homePeriodScore = g.home_team_periods[i];
          const awayPeriodScore = g.visitor_team_periods?.[i] ?? null;
          await sb.from("game_quarters").upsert({
            game_id: gameKey,
            quarter: i + 1,
            home_score: homePeriodScore,
            away_score: awayPeriodScore,
          }, { onConflict: "game_id,quarter" }).select("id");
        }
      }

      // Snapshot game state
      await sb.from("game_state_snapshots").insert({
        game_id: gameKey,
        quarter: g.period ? String(g.period) : "0",
        home_score: homeScore,
        away_score: awayScore,
        clock: g.time ?? null,
        status,
      });

      // Upsert per-player box score stats
      const allPlayers = [
        ...(g.home_team?.players || []).map((p: any) => ({ ...p, teamAbbr: homeAbbr })),
        ...(g.visitor_team?.players || []).map((p: any) => ({ ...p, teamAbbr: awayAbbr })),
      ];

      for (const p of allPlayers) {
        if (!p.player?.id) continue;
        // Find internal player by name
        const playerName = `${p.player.first_name || ""} ${p.player.last_name || ""}`.trim();
        if (!playerName) continue;

        const { data: internalPlayer } = await sb
          .from("players")
          .select("id")
          .eq("name", playerName)
          .eq("league", "NBA")
          .maybeSingle();

        if (internalPlayer) {
          await sb.from("player_game_stats").upsert({
            player_id: internalPlayer.id,
            game_id: gameKey,
            team_abbr: p.teamAbbr,
            period: "full",
            points: p.pts ?? 0,
            rebounds: p.reb ?? 0,
            assists: p.ast ?? 0,
            steals: p.stl ?? 0,
            blocks: p.blk ?? 0,
            turnovers: p.turnover ?? 0,
            minutes: p.min ? parseFloat(p.min) : 0,
            fg_made: p.fgm ?? 0,
            fg_attempted: p.fga ?? 0,
            three_made: p.fg3m ?? 0,
            three_attempted: p.fg3a ?? 0,
            ft_made: p.ftm ?? 0,
            ft_attempted: p.fta ?? 0,
          }, { onConflict: "player_id,game_id,period" });
        }
      }

      if (status !== "final") liveGameIds.push(g.id);
    }

    // ── 3. Fetch odds for all live games ──
    if (liveGameIds.length > 0) {
      try {
        const idsParam = liveGameIds.map(id => `game_ids[]=${id}`).join("&");
        const oddsRes = await fetch(`${BDL_BASE}/v2/odds?${idsParam}`, { headers });
        if (oddsRes.ok) {
          const oddsData = await oddsRes.json();
          const oddsItems: any[] = oddsData.data || [];
          for (const o of oddsItems) {
            const gk = gameKeyMap.get(o.game?.id);
            if (!gk) continue;
            const books = o.bookmakers || [];
            for (const book of books) {
              const vendor = book.name || book.key || "unknown";
              const markets = book.markets || [];
              for (const mkt of markets) {
                const market = mkt.key || mkt.name || "unknown";
                const outcomes = mkt.outcomes || [];
                const home = outcomes.find((x: any) => x.name === "Home" || x.name === homeTeamFor(gk, gameKeyMap, games));
                const away = outcomes.find((x: any) => x.name === "Away" || x.name !== home?.name);
                const over = outcomes.find((x: any) => x.name === "Over");
                const under = outcomes.find((x: any) => x.name === "Under");

                await sb.from("nba_game_odds").upsert({
                  game_key: gk,
                  provider: "balldontlie",
                  vendor,
                  market,
                  home_line: home?.point ?? null,
                  away_line: away?.point ?? null,
                  total: over?.point ?? under?.point ?? null,
                  home_odds: home?.price ?? null,
                  away_odds: away?.price ?? null,
                  over_odds: over?.price ?? null,
                  under_odds: under?.price ?? null,
                  raw: mkt,
                  updated_at: new Date().toISOString(),
                }, { onConflict: "game_key,provider,vendor,market" });
                stats.odds++;
              }
            }
          }
        }
      } catch (e) {
        console.error("[nba-bdl] odds error:", e);
        stats.errors++;
      }
    }

    // ── 4. Fetch PBP + Props per live game ──
    // Limit concurrency to 5
    const concurrency = 5;
    const chunks: number[][] = [];
    for (let i = 0; i < liveGameIds.length; i += concurrency) {
      chunks.push(liveGameIds.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (bdlGameId) => {
        const gk = gameKeyMap.get(bdlGameId);
        if (!gk) return;

        // ── PBP ──
        try {
          const pbpRes = await fetch(`${BDL_BASE}/v1/plays?game_id=${bdlGameId}`, { headers });
          if (pbpRes.ok) {
            const pbpData = await pbpRes.json();
            const plays: any[] = pbpData.data || [];
            for (const play of plays) {
              const eventId = String(play.id || `${play.period}-${play.clock}-${play.description?.slice(0,20)}`);
              await sb.from("nba_pbp_events").upsert({
                game_key: gk,
                provider: "balldontlie",
                provider_game_id: String(bdlGameId),
                provider_event_id: eventId,
                period: play.period ?? 1,
                event_ts_game: play.clock ?? play.time ?? null,
                event_type: play.type ?? play.event_type ?? null,
                description: play.description ?? null,
                team_abbr: play.team?.abbreviation ?? null,
                player_id: play.player?.id ? String(play.player.id) : null,
                player_name: play.player ? `${play.player.first_name || ""} ${play.player.last_name || ""}`.trim() : null,
                home_score: play.home_score ?? null,
                away_score: play.visitor_score ?? null,
                raw: play,
              }, { onConflict: "game_key,provider,provider_event_id" });
              stats.plays++;
            }
          } else if (pbpRes.status === 429) {
            console.warn(`[nba-bdl] 429 on plays for game ${bdlGameId}, backing off`);
          }
        } catch (e) {
          console.error(`[nba-bdl] plays error game ${bdlGameId}:`, e);
          stats.errors++;
        }

        // ── Player Props ──
        try {
          const propsRes = await fetch(`${BDL_BASE}/v2/odds/player_props?game_id=${bdlGameId}`, { headers });
          if (propsRes.ok) {
            const propsData = await propsRes.json();
            const propItems: any[] = propsData.data || [];
            for (const prop of propItems) {
              const player = prop.player;
              const playerId = player?.id ? String(player.id) : "unknown";
              const playerName = player ? `${player.first_name || ""} ${player.last_name || ""}`.trim() : null;
              const books = prop.bookmakers || [];
              for (const book of books) {
                const vendor = book.name || book.key || "unknown";
                const markets = book.markets || [];
                for (const mkt of markets) {
                  const propType = mkt.key || mkt.name || "unknown";
                  const outcomes = mkt.outcomes || [];
                  const over = outcomes.find((x: any) => x.name === "Over");
                  const under = outcomes.find((x: any) => x.name === "Under");
                  const line = over?.point ?? under?.point ?? 0;

                  await sb.from("nba_player_props_live").upsert({
                    game_key: gk,
                    provider: "balldontlie",
                    vendor,
                    player_id: playerId,
                    player_name: playerName,
                    prop_type: propType,
                    line_value: line,
                    market_type: "over_under",
                    over_odds: over?.price ?? null,
                    under_odds: under?.price ?? null,
                    raw: mkt,
                    updated_at: new Date().toISOString(),
                  }, { onConflict: "game_key,provider,vendor,player_id,prop_type,line_value,market_type" });
                  stats.props++;
                }
              }
            }

            // Archive snapshot
            if (propItems.length > 0) {
              const archiveRows = [];
              for (const prop of propItems) {
                const player = prop.player;
                const books = prop.bookmakers || [];
                for (const book of books) {
                  for (const mkt of book.markets || []) {
                    const over = (mkt.outcomes || []).find((x: any) => x.name === "Over");
                    const under = (mkt.outcomes || []).find((x: any) => x.name === "Under");
                    archiveRows.push({
                      game_key: gk,
                      provider: "balldontlie",
                      vendor: book.name || book.key || "unknown",
                      player_id: player?.id ? String(player.id) : null,
                      player_name: player ? `${player.first_name || ""} ${player.last_name || ""}`.trim() : null,
                      prop_type: mkt.key || mkt.name,
                      line_value: over?.point ?? under?.point ?? 0,
                      market_type: "over_under",
                      over_odds: over?.price ?? null,
                      under_odds: under?.price ?? null,
                    });
                  }
                }
              }
              if (archiveRows.length > 0) {
                await sb.from("nba_player_props_archive").insert(archiveRows);
              }
            }
          } else if (propsRes.status === 429) {
            console.warn(`[nba-bdl] 429 on props for game ${bdlGameId}, backing off`);
          }
        } catch (e) {
          console.error(`[nba-bdl] props error game ${bdlGameId}:`, e);
          stats.errors++;
        }
      }));
    }

    console.log(`[nba-bdl] Done: ${JSON.stringify(stats)}`);
    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[nba-bdl] Fatal:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper: get home team name for a game_key
function homeTeamFor(gameKey: string, gameKeyMap: Map<number, string>, games: any[]): string {
  for (const [bdlId, gk] of gameKeyMap) {
    if (gk === gameKey) {
      const g = games.find((x: any) => x.id === bdlId);
      return g?.home_team?.full_name || g?.home_team?.name || "";
    }
  }
  return "";
}
