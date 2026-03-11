// bdl-backfill-day — One-shot backfill: odds + PBP + props + quarter stats for NBA games via BDL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BDL_BASE = "https://api.balldontlie.io";

function bdlPropToMarketKey(key: string): string {
  const map: Record<string, string> = {
    pts: "player_points", reb: "player_rebounds", ast: "player_assists",
    fg3m: "player_threes", blk: "player_blocks", stl: "player_steals",
    turnover: "player_turnovers", pra: "player_points_rebounds_assists",
    pr: "player_points_rebounds", pa: "player_points_assists",
    ra: "player_rebounds_assists", dd: "player_double_double",
    points: "player_points", rebounds: "player_rebounds", assists: "player_assists",
    threes: "player_threes", blocks: "player_blocks", steals: "player_steals",
    turnovers: "player_turnovers",
  };
  return map[key] || `player_${key}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const BDL_KEY = (Deno.env.get("BALLDONTLIE_KEY") || "").trim().replace(/^Bearer\s+/i, "");
    if (!BDL_KEY) throw new Error("BALLDONTLIE_KEY not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const hdrs = { Authorization: `Bearer ${BDL_KEY}`, "X-Api-Key": BDL_KEY };

    const url = new URL(req.url);
    const targetDate = url.searchParams.get("date") || new Date().toISOString().split("T")[0];
    const singleGameId = url.searchParams.get("game_id");
    const skipOdds = url.searchParams.get("skip_odds") === "1";
    const skipPbp = url.searchParams.get("skip_pbp") === "1";
    const skipProps = url.searchParams.get("skip_props") === "1";
    const onlyQuarters = url.searchParams.get("only_quarters") === "1";

    const d = new Date(targetDate + "T00:00:00Z");
    const dayBefore = new Date(d.getTime() - 86400000).toISOString().split("T")[0];
    const dayAfter = new Date(d.getTime() + 86400000).toISOString().split("T")[0];

    let gamesQuery = supabase.from("games")
      .select("id, home_abbr, away_abbr, start_time, status, external_id")
      .eq("league", "NBA");

    if (singleGameId) {
      gamesQuery = gamesQuery.eq("id", singleGameId);
    } else {
      gamesQuery = gamesQuery
        .gte("start_time", dayBefore + "T00:00:00Z")
        .lte("start_time", dayAfter + "T23:59:59Z");
    }

    const { data: dbGames } = await gamesQuery;

    if (!dbGames || dbGames.length === 0) {
      return new Response(JSON.stringify({ ok: true, msg: "no games found", date: targetDate }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[bdl-backfill] ${dbGames.length} games around ${targetDate}`);
    const stats = { games: dbGames.length, odds: 0, plays: 0, props: 0, mapped: 0, quarter_stats: 0 };

    // Step 1: Resolve BDL IDs
    const gameMap = new Map<string, { dbGame: typeof dbGames[0]; bdlId: number }>();

    for (const game of dbGames) {
      const { data: mapped } = await supabase.from("provider_game_map")
        .select("provider_game_id").eq("game_key", game.id).eq("provider", "balldontlie").maybeSingle();

      if (mapped?.provider_game_id) {
        gameMap.set(game.id, { dbGame: game, bdlId: Number(mapped.provider_game_id) });
        continue;
      }

      const gameDate = game.start_time.split("T")[0];
      const prevDate = new Date(new Date(gameDate + "T00:00:00Z").getTime() - 86400000).toISOString().split("T")[0];

      for (const tryDate of [gameDate, prevDate]) {
        if (gameMap.has(game.id)) break;
        try {
          const res = await fetch(`${BDL_BASE}/v1/games?dates[]=${tryDate}`, { headers: hdrs });
          if (!res.ok) continue;
          const data = await res.json();
          const match = (data.data || []).find((g: any) =>
            g.home_team?.abbreviation === game.home_abbr &&
            g.visitor_team?.abbreviation === game.away_abbr
          );
          if (match) {
            gameMap.set(game.id, { dbGame: game, bdlId: match.id });
            await supabase.from("provider_game_map").upsert({
              game_key: game.id, league: "NBA", provider: "balldontlie",
              provider_game_id: String(match.id), game_date: tryDate,
              home_team_abbr: game.home_abbr, away_team_abbr: game.away_abbr,
              start_time_utc: game.start_time, updated_at: new Date().toISOString(),
            }, { onConflict: "game_key,provider" });
            stats.mapped++;
            console.log(`[bdl-backfill] Mapped ${game.home_abbr} vs ${game.away_abbr} → BDL ${match.id}`);
          }
        } catch (e) {
          console.warn(`[bdl-backfill] search error:`, e);
        }
      }
    }

    // Step 2: Fetch odds for all mapped games
    const allBdlIds = [...gameMap.values()].map(v => v.bdlId);
    if (allBdlIds.length > 0 && !skipOdds && !onlyQuarters) {
      const idsParam = allBdlIds.map(id => `game_ids[]=${id}`).join("&");
      try {
        const oddsRes = await fetch(`${BDL_BASE}/v2/odds?${idsParam}`, { headers: hdrs });
        if (oddsRes.ok) {
          const oddsData = await oddsRes.json();
          const oddsItems: any[] = oddsData.data || [];

          const bdlToGame = new Map<number, string>();
          for (const [gk, { bdlId }] of gameMap) bdlToGame.set(bdlId, gk);

          for (const item of oddsItems) {
            const bdlGameId = item.game_id || item.game?.id;
            const gk = bdlToGame.get(bdlGameId);
            if (!gk) continue;

            const vendor = item.vendor || "unknown";
            const now = new Date().toISOString();

            if (item.moneyline_home_odds != null) {
              await supabase.from("nba_game_odds").upsert({
                game_key: gk, provider: "balldontlie", vendor, market: "moneyline",
                home_odds: item.moneyline_home_odds, away_odds: item.moneyline_away_odds ?? null,
                home_line: null, away_line: null, total: null, over_odds: null, under_odds: null,
                raw: item, updated_at: now,
              }, { onConflict: "game_key,provider,vendor,market" });
              stats.odds++;
            }
            if (item.spread_home_value != null) {
              await supabase.from("nba_game_odds").upsert({
                game_key: gk, provider: "balldontlie", vendor, market: "spread",
                home_line: Number(item.spread_home_value), away_line: item.spread_away_value ? Number(item.spread_away_value) : null,
                home_odds: item.spread_home_odds ?? null, away_odds: item.spread_away_odds ?? null,
                total: null, over_odds: null, under_odds: null,
                raw: item, updated_at: now,
              }, { onConflict: "game_key,provider,vendor,market" });
              stats.odds++;
            }
            if (item.total_value != null) {
              await supabase.from("nba_game_odds").upsert({
                game_key: gk, provider: "balldontlie", vendor, market: "total",
                total: Number(item.total_value), over_odds: item.total_over_odds ?? null, under_odds: item.total_under_odds ?? null,
                home_line: null, away_line: null, home_odds: null, away_odds: null,
                raw: item, updated_at: now,
              }, { onConflict: "game_key,provider,vendor,market" });
              stats.odds++;
            }

            for (const book of (item.bookmakers || [])) {
              const bkVendor = book.name || book.key || "unknown";
              for (const mkt of (book.markets || [])) {
                const market = mkt.key || mkt.name || "unknown";
                const outcomes = mkt.outcomes || [];
                const home = outcomes.find((x: any) => x.name === "Home");
                const away = outcomes.find((x: any) => x.name === "Away");
                const over = outcomes.find((x: any) => x.name === "Over");
                const under = outcomes.find((x: any) => x.name === "Under");
                await supabase.from("nba_game_odds").upsert({
                  game_key: gk, provider: "balldontlie", vendor: bkVendor, market,
                  home_line: home?.point ?? null, away_line: away?.point ?? null,
                  total: over?.point ?? under?.point ?? null,
                  home_odds: home?.price ?? null, away_odds: away?.price ?? null,
                  over_odds: over?.price ?? null, under_odds: under?.price ?? null,
                  raw: mkt, updated_at: now,
                }, { onConflict: "game_key,provider,vendor,market" });
                stats.odds++;
              }
            }
          }
        }
      } catch (e) { console.error("[bdl-backfill] odds error:", e); }
    }

    // Step 3: Fetch PBP + Props per game
    for (const [gk, { bdlId }] of gameMap) {
      // PBP
      if (!skipPbp && !onlyQuarters) {
        try {
          const pbpRes = await fetch(`${BDL_BASE}/v1/plays?game_id=${bdlId}`, { headers: hdrs });
          if (pbpRes.ok) {
            const pbpData = await pbpRes.json();
            const plays: any[] = pbpData.data || [];
            const rows = plays.map((play: any) => ({
              game_key: gk, provider: "balldontlie", provider_game_id: String(bdlId),
              provider_event_id: String(play.id || `${play.period}-${play.clock}-${(play.description||"").slice(0,20)}`),
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
            }));
            for (let i = 0; i < rows.length; i += 100) {
              const chunk = rows.slice(i, i + 100);
              await supabase.from("nba_pbp_events").upsert(chunk, { onConflict: "game_key,provider,provider_event_id" });
            }
            stats.plays += rows.length;
            console.log(`[bdl-backfill] ${rows.length} PBP events for game ${gk}`);
          } else if (pbpRes.status === 429) {
            console.warn("[bdl-backfill] Rate limited on PBP, stopping");
            break;
          }
        } catch (e) { console.error(`[bdl-backfill] PBP error game ${gk}:`, e); }
      }

      // Player Props
      if (!skipProps && !onlyQuarters) {
        try {
          const propsRes = await fetch(`${BDL_BASE}/v2/odds/player_props?game_id=${bdlId}`, { headers: hdrs });
          if (propsRes.ok) {
            const propsData = await propsRes.json();
            const propItems: any[] = propsData.data || [];

            for (const prop of propItems) {
              const player = prop.player;
              const playerId = player?.id ? String(player.id) : "unknown";
              const playerName = player ? `${player.first_name || ""} ${player.last_name || ""}`.trim() : null;

              const flatKeys = ["pts", "reb", "ast", "fg3m", "blk", "stl", "turnover", "pra", "pr", "pa", "ra", "dd", "td", "fgm"];
              for (const fk of flatKeys) {
                const overKey = `${fk}_over_odds`;
                const underKey = `${fk}_under_odds`;
                const lineKey = `${fk}_line`;
                if (prop[overKey] != null || prop[underKey] != null || prop[lineKey] != null) {
                  const mktKey = bdlPropToMarketKey(fk);
                  const line = prop[lineKey] != null ? Number(prop[lineKey]) : 0;
                  await supabase.from("nba_player_props_live").upsert({
                    game_key: gk, provider: "balldontlie", vendor: "balldontlie",
                    player_id: playerId, player_name: playerName,
                    prop_type: mktKey, line_value: line, market_type: "over_under",
                    over_odds: prop[overKey] ?? null, under_odds: prop[underKey] ?? null,
                    raw: prop, updated_at: new Date().toISOString(),
                  }, { onConflict: "game_key,provider,vendor,player_id,prop_type,line_value,market_type" });
                  stats.props++;
                }
              }

              for (const book of (prop.bookmakers || [])) {
                const vendor = book.name || book.key || "unknown";
                for (const mkt of (book.markets || [])) {
                  const propType = bdlPropToMarketKey(mkt.key || mkt.name || "unknown");
                  const outcomes = mkt.outcomes || [];
                  const over = outcomes.find((x: any) => x.name === "Over");
                  const under = outcomes.find((x: any) => x.name === "Under");
                  const line = over?.point ?? under?.point ?? 0;
                  await supabase.from("nba_player_props_live").upsert({
                    game_key: gk, provider: "balldontlie", vendor,
                    player_id: playerId, player_name: playerName,
                    prop_type: propType, line_value: Number(line), market_type: "over_under",
                    over_odds: over?.price ?? null, under_odds: under?.price ?? null,
                    raw: mkt, updated_at: new Date().toISOString(),
                  }, { onConflict: "game_key,provider,vendor,player_id,prop_type,line_value,market_type" });
                  stats.props++;
                }
              }
            }
            console.log(`[bdl-backfill] Props for game ${gk}: ${propItems.length} players`);
          } else if (propsRes.status === 429) {
            console.warn("[bdl-backfill] Rate limited on props, stopping");
            break;
          }
        } catch (e) { console.error(`[bdl-backfill] Props error game ${gk}:`, e); }
      }

      // Step 4: Fetch box scores for per-quarter player stats
      try {
        // Try BDL box_scores endpoint (GOAT/ALL-STAR tier)
        const bsRes = await fetch(`${BDL_BASE}/v1/box_scores?game_ids[]=${bdlId}`, { headers: hdrs });
        
        if (bsRes.ok) {
          const bsData = await bsRes.json();
          const boxScores: any[] = bsData.data || [];
          
          if (boxScores.length > 0) {
            const bs = boxScores[0];
            // Box score has home_team_stats and away_team_stats with per-player per-period data
            const allPlayerStats = [
              ...(bs.home_team?.players || bs.home_team_stats || []),
              ...(bs.away_team?.players || bs.away_team_stats || []),
            ];

            // If box score has period-level data, use it
            let hasPerPeriod = false;
            const resolvedPlayers = new Map<string, string | null>();
            const qRows: any[] = [];

            for (const ps of allPlayerStats) {
              // Check if player has quarters array or period stats
              const quarters = ps.quarters || ps.periods || ps.period_stats;
              if (!quarters || !Array.isArray(quarters)) continue;
              hasPerPeriod = true;

              const playerName = ps.player ? `${ps.player.first_name || ""} ${ps.player.last_name || ""}`.trim()
                : (ps.first_name ? `${ps.first_name} ${ps.last_name}`.trim() : null);
              if (!playerName) continue;
              const teamAbbr = ps.team?.abbreviation || ps.team_abbr || null;

              let playerId = resolvedPlayers.get(playerName);
              if (playerId === undefined) {
                const { data: match } = await supabase.from("players").select("id")
                  .ilike("name", playerName).limit(1).maybeSingle();
                playerId = match?.id || null;
                resolvedPlayers.set(playerName, playerId);
              }
              if (!playerId) continue;

              for (const q of quarters) {
                const period = q.period || q.quarter;
                if (!period) continue;
                const periodLabel = typeof period === "number" ? `Q${period}` : period;

                qRows.push({
                  game_id: gk, player_id: playerId, team_abbr: teamAbbr, period: periodLabel,
                  points: q.pts ?? q.points ?? 0,
                  rebounds: q.reb ?? q.rebounds ?? 0,
                  assists: q.ast ?? q.assists ?? 0,
                  steals: q.stl ?? q.steals ?? 0,
                  blocks: q.blk ?? q.blocks ?? 0,
                  turnovers: q.turnover ?? q.turnovers ?? q.tov ?? 0,
                  minutes: q.min ? parseInt(String(q.min), 10) : 0,
                  fg_made: q.fgm ?? q.fg_made ?? 0,
                  fg_attempted: q.fga ?? q.fg_attempted ?? 0,
                  three_made: q.fg3m ?? q.three_made ?? 0,
                  three_attempted: q.fg3a ?? q.three_attempted ?? 0,
                  ft_made: q.ftm ?? q.ft_made ?? 0,
                  ft_attempted: q.fta ?? q.ft_attempted ?? 0,
                  off_rebounds: q.oreb ?? q.off_rebounds ?? 0,
                  def_rebounds: q.dreb ?? q.def_rebounds ?? 0,
                  fouls: q.pf ?? q.fouls ?? 0,
                });
              }
            }

            if (hasPerPeriod && qRows.length > 0) {
              for (let i = 0; i < qRows.length; i += 200) {
                const chunk = qRows.slice(i, i + 200);
                const { error: upsertErr } = await supabase
                  .from("player_game_stats")
                  .upsert(chunk, { onConflict: "game_id,player_id,period" });
                if (upsertErr) console.error(`[bdl-backfill] Box score quarter stats upsert error:`, upsertErr.message);
                else stats.quarter_stats += chunk.length;
              }
              console.log(`[bdl-backfill] ${qRows.length} quarter stats from box score for game ${gk}`);

              // Auto-compute 1H and 2H
              for (const [halfLabel, quarters] of [["1H", ["Q1", "Q2"]], ["2H", ["Q3", "Q4"]]] as const) {
                const byPlayer = new Map<string, any[]>();
                for (const r of qRows) {
                  if (!(quarters as readonly string[]).includes(r.period)) continue;
                  if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []);
                  byPlayer.get(r.player_id)!.push(r);
                }
                const halfRows: any[] = [];
                for (const [pid, rows] of byPlayer) {
                  if (rows.length < 2) continue;
                  const sum: any = {
                    game_id: gk, player_id: pid, team_abbr: rows[0].team_abbr, period: halfLabel,
                    points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0,
                    fg_made: 0, fg_attempted: 0, three_made: 0, three_attempted: 0,
                    ft_made: 0, ft_attempted: 0, off_rebounds: 0, def_rebounds: 0, fouls: 0,
                  };
                  for (const q of rows) {
                    for (const k of ["points","rebounds","assists","steals","blocks","turnovers",
                      "fg_made","fg_attempted","three_made","three_attempted","ft_made","ft_attempted",
                      "off_rebounds","def_rebounds","fouls"]) {
                      sum[k] += q[k] ?? 0;
                    }
                  }
                  halfRows.push(sum);
                }
                if (halfRows.length > 0) {
                  await supabase.from("player_game_stats").upsert(halfRows, { onConflict: "game_id,player_id,period" });
                  stats.quarter_stats += halfRows.length;
                  console.log(`[bdl-backfill] ${halfRows.length} ${halfLabel} computed for game ${gk}`);
                }
              }
            } else {
              console.log(`[bdl-backfill] Box score available but no per-period player data for game ${gk}`);
              // Log what structure we got for debugging
              if (allPlayerStats.length > 0) {
                console.log(`[bdl-backfill] Sample player keys: ${JSON.stringify(Object.keys(allPlayerStats[0]))}`);
              } else {
                console.log(`[bdl-backfill] Box score keys: ${JSON.stringify(Object.keys(bs))}`);
              }
            }
          }
        } else if (bsRes.status === 402 || bsRes.status === 403) {
          console.log(`[bdl-backfill] Box scores not available on current BDL tier (${bsRes.status})`);
        } else if (bsRes.status === 429) {
          console.warn("[bdl-backfill] Rate limited on box scores, stopping");
          break;
        } else {
          console.warn(`[bdl-backfill] Box scores returned ${bsRes.status}`);
        }
      } catch (e) { console.error(`[bdl-backfill] Box score error game ${gk}:`, e); }

      // Small delay between games to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[bdl-backfill] Done: ${JSON.stringify(stats)}`);
    return new Response(JSON.stringify({ ok: true, date: targetDate, stats }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[bdl-backfill] Fatal:", msg);
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});