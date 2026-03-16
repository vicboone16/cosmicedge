import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Maps bet-slip stat_type strings to player_game_stats columns.
 */
const STAT_MAP: Record<string, string[]> = {
  points: ["points"], pts: ["points"],
  rebounds: ["rebounds"], reb: ["rebounds"],
  assists: ["assists"], ast: ["assists"],
  steals: ["steals"], stl: ["steals"],
  blocks: ["blocks"], blk: ["blocks"],
  turnovers: ["turnovers"], tov: ["turnovers"],
  three_made: ["three_made"], "3pm": ["three_made"], threes: ["three_made"],
  pra: ["points", "rebounds", "assists"],
  "pts+reb+ast": ["points", "rebounds", "assists"],
  "pts+reb+asts": ["points", "rebounds", "assists"],
  pr: ["points", "rebounds"], "pts+reb": ["points", "rebounds"],
  pa: ["points", "assists"], "pts+ast": ["points", "assists"], "pts+asts": ["points", "assists"],
  ra: ["rebounds", "assists"], "reb+ast": ["rebounds", "assists"], "reb+asts": ["rebounds", "assists"],
  sb: ["steals", "blocks"], "stl+blk": ["steals", "blocks"], "blk+stl": ["steals", "blocks"],
  fantasy_points: ["fantasy_points"], fantasy: ["fantasy_points"],
  "fantasy score": ["fantasy_points"],
  fg_made: ["fg_made"], ft_made: ["ft_made"], minutes: ["minutes"],
};

const LIVE_STATUSES = ["live", "in_progress", "halftime"] as const;
const FINAL_STATUSES = ["final", "ended", "completed"] as const;

const statusRank = (status?: string | null) => {
  const normalized = (status || "").toLowerCase();
  if (normalized === "live" || normalized === "in_progress") return 0;
  if (normalized === "halftime") return 1;
  if (normalized === "scheduled") return 2;
  return 3;
};

function parsePeriod(statType: string): { period: string; cleanStat: string } {
  const idx = statType.indexOf(":");
  if (idx > 0) {
    const prefix = statType.slice(0, idx).toLowerCase();
    if (["q1", "q2", "q3", "q4", "1h", "2h", "ot"].includes(prefix)) {
      return { period: prefix, cleanStat: statType.slice(idx + 1).toLowerCase().trim() };
    }
  }
  return { period: "full", cleanStat: statType.toLowerCase().trim() };
}

function resolveStatValue(row: any, statColumns: string[]): number {
  let total = 0;
  for (const col of statColumns) total += Number(row[col]) || 0;
  return total;
}

interface Pick {
  id: string;
  player_id?: string | null;
  player_name_raw: string;
  game_id?: string | null;
  stat_type: string;
  live_value?: number | null;
  result?: string | null;
}

/**
 * Polls player_game_stats for all picks on live/in_progress games
 * and writes live_value back to bet_slip_picks.
 * Also auto-resolves game_id when missing by looking up the player's team.
 */
export function useSlipLiveSync(picks: Pick[], enabled = true) {
  const queryClient = useQueryClient();
  const lastWrittenRef = useRef<Record<string, number>>({});
  const resolvedRef = useRef<Set<string>>(new Set());

  // ── Step 0: Auto-resolve game_id for picks missing it ──
  const picksNeedingGameId = picks.filter(p => !p.game_id && p.player_id && !resolvedRef.current.has(p.id));

  useQuery({
    queryKey: ["slip-resolve-game-ids", picksNeedingGameId.map(p => p.id).join(",")],
    queryFn: async () => {
      if (!picksNeedingGameId.length) return null;

      const playerIds = [...new Set(picksNeedingGameId.map(p => p.player_id!))];
      const { data: playerRows } = await supabase
        .from("players")
        .select("id, team")
        .in("id", playerIds);

      if (!playerRows?.length) return null;

      const teamMap: Record<string, string> = {};
      playerRows.forEach(p => { if (p.team) teamMap[p.id] = p.team; });

      const uniqueTeams = [...new Set(Object.values(teamMap))];
      if (!uniqueTeams.length) return null;

      // Find today's games for these teams — prioritize live, then scheduled
      const today = new Date().toISOString().slice(0, 10);
      const { data: todayGames } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, status")
        .gte("start_time", `${today}T00:00:00Z`)
        .lte("start_time", `${today}T23:59:59Z`)
        .in("league", ["NBA"]);

      if (!todayGames?.length) return null;

      // Match each pick to a game
      for (const pick of picksNeedingGameId) {
        const team = teamMap[pick.player_id!];
        if (!team) continue;

        // Prioritize live games
        const liveGame = todayGames.find(g =>
          (g.home_abbr === team || g.away_abbr === team) &&
          (g.status === "live" || g.status === "in_progress")
        );
        const anyGame = liveGame || todayGames.find(g =>
          g.home_abbr === team || g.away_abbr === team
        );

        if (anyGame) {
          // Write game_id to DB
          await supabase.from("bet_slip_picks")
            .update({ game_id: anyGame.id })
            .eq("id", pick.id);
          resolvedRef.current.add(pick.id);
        }
      }

      // Invalidate to reload picks with new game_ids
      queryClient.invalidateQueries({ queryKey: ["bet-slip-picks"] });
      return true;
    },
    enabled: enabled && picksNeedingGameId.length > 0,
    refetchInterval: 60_000, // retry every minute for picks without game_id
    staleTime: 30_000,
  });

  // ── Step 1: Check which games are live ──
  const gameIds = [...new Set(picks.map(p => p.game_id).filter(Boolean) as string[])];

  const { data: liveGameIds } = useQuery({
    queryKey: ["slip-live-game-status", gameIds.join(",")],
    queryFn: async () => {
      if (!gameIds.length) return [];
      const { data } = await supabase
        .from("games")
        .select("id, status")
        .in("id", gameIds)
        .in("status", ["live", "in_progress"]);
      return data?.map(g => g.id) || [];
    },
    enabled: enabled && gameIds.length > 0,
    refetchInterval: 15_000,
  });

  // ── Step 2: Fetch live stats ──
  const livePicks = picks.filter(p => p.game_id && liveGameIds?.includes(p.game_id) && p.player_id);

  const { data: liveStats } = useQuery({
    queryKey: ["slip-live-player-stats", livePicks.map(p => `${p.player_id}:${p.game_id}`).join(",")],
    queryFn: async () => {
      if (!livePicks.length) return [];
      const uniqueGameIds = [...new Set(livePicks.map(p => p.game_id!))];
      const uniquePlayerIds = [...new Set(livePicks.map(p => p.player_id!))];
      const { data } = await supabase
        .from("player_game_stats")
        .select("player_id, game_id, period, points, rebounds, assists, steals, blocks, turnovers, three_made, fg_made, ft_made, fantasy_points, minutes, fouls")
        .in("game_id", uniqueGameIds)
        .in("player_id", uniquePlayerIds);
      return data || [];
    },
    enabled: livePicks.length > 0,
    refetchInterval: 15_000,
  });

  // ── Step 3: Write live_value updates ──
  useEffect(() => {
    if (!liveStats?.length || !livePicks.length) return;

    const updates: { id: string; live_value: number }[] = [];

    for (const pick of livePicks) {
      const { period, cleanStat } = parsePeriod(pick.stat_type);
      const columns = STAT_MAP[cleanStat];
      if (!columns) continue;

      const statRow = liveStats.find(
        s => s.player_id === pick.player_id && s.game_id === pick.game_id && s.period === period
      );
      if (!statRow) continue;

      const val = resolveStatValue(statRow, columns);
      if (lastWrittenRef.current[pick.id] === val) continue;
      lastWrittenRef.current[pick.id] = val;
      updates.push({ id: pick.id, live_value: val });
    }

    if (updates.length === 0) return;

    (async () => {
      for (const u of updates) {
        await supabase.from("bet_slip_picks").update({ live_value: u.live_value }).eq("id", u.id);
      }
      queryClient.invalidateQueries({ queryKey: ["bet-slip-picks"] });
    })();
  }, [liveStats, livePicks, queryClient]);

  return { liveGameCount: liveGameIds?.length || 0 };
}
