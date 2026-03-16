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
  const repairedRef = useRef<Set<string>>(new Set());

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

      // Rolling window catches US evening games that cross into next UTC day.
      const nowTs = Date.now();
      const windowStart = new Date(nowTs - 8 * 60 * 60 * 1000).toISOString();
      const windowEnd = new Date(nowTs + 36 * 60 * 60 * 1000).toISOString();
      const { data: candidateGames } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, status, start_time")
        .gte("start_time", windowStart)
        .lte("start_time", windowEnd)
        .in("league", ["NBA"])
        .in("status", ["scheduled", ...LIVE_STATUSES]);

      if (!candidateGames?.length) return null;

      // Match each pick to a game
      for (const pick of picksNeedingGameId) {
        const team = teamMap[pick.player_id!];
        if (!team) continue;

        const teamGames = candidateGames
          .filter(g => g.home_abbr === team || g.away_abbr === team)
          .sort((a, b) => {
            const rankDiff = statusRank(a.status) - statusRank(b.status);
            if (rankDiff !== 0) return rankDiff;
            const aDelta = Math.abs(new Date(a.start_time).getTime() - nowTs);
            const bDelta = Math.abs(new Date(b.start_time).getTime() - nowTs);
            return aDelta - bDelta;
          });

        const anyGame = teamGames[0];

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

  // ── Step 0b: Repair stale game links (old finals mapped instead of current live game) ──
  const picksWithLinkedGames = picks.filter(
    p => p.game_id && p.player_id && !p.result && !repairedRef.current.has(p.id),
  );

  useQuery({
    queryKey: ["slip-repair-game-ids", picksWithLinkedGames.map(p => `${p.id}:${p.game_id}`).join(",")],
    queryFn: async () => {
      if (!picksWithLinkedGames.length) return null;

      const linkedGameIds = [...new Set(picksWithLinkedGames.map(p => p.game_id!))];
      const linkedPlayerIds = [...new Set(picksWithLinkedGames.map(p => p.player_id!))];

      const [{ data: linkedGames }, { data: playerRows }] = await Promise.all([
        supabase
          .from("games")
          .select("id, status, start_time")
          .in("id", linkedGameIds),
        supabase
          .from("players")
          .select("id, team")
          .in("id", linkedPlayerIds),
      ]);

      if (!linkedGames?.length || !playerRows?.length) return null;

      const linkedGameMap: Record<string, { status: string | null; start_time: string | null }> = {};
      linkedGames.forEach(g => {
        linkedGameMap[g.id] = { status: g.status, start_time: g.start_time };
      });

      const teamMap: Record<string, string> = {};
      playerRows.forEach(p => { if (p.team) teamMap[p.id] = p.team; });

      const nowTs = Date.now();
      const stalePicks = picksWithLinkedGames.filter((pick) => {
        const linked = pick.game_id ? linkedGameMap[pick.game_id] : null;
        if (!linked) return false;
        const normalized = (linked.status || "").toLowerCase();
        if (!FINAL_STATUSES.includes(normalized as (typeof FINAL_STATUSES)[number])) return false;
        const startTs = linked.start_time ? new Date(linked.start_time).getTime() : 0;
        return startTs > 0 && (nowTs - startTs) > 2 * 60 * 60 * 1000;
      });

      if (!stalePicks.length) return null;

      const teams = [...new Set(stalePicks.map(p => teamMap[p.player_id!]).filter(Boolean))];
      if (!teams.length) return null;

      const windowStart = new Date(nowTs - 8 * 60 * 60 * 1000).toISOString();
      const windowEnd = new Date(nowTs + 12 * 60 * 60 * 1000).toISOString();
      const { data: liveTeamGames } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, status, start_time")
        .gte("start_time", windowStart)
        .lte("start_time", windowEnd)
        .in("league", ["NBA"])
        .in("status", [...LIVE_STATUSES])
        .or(teams.map((t) => `home_abbr.eq.${t},away_abbr.eq.${t}`).join(","));

      if (!liveTeamGames?.length) return null;

      let updated = 0;
      for (const pick of stalePicks) {
        const team = teamMap[pick.player_id!];
        if (!team) continue;

        const replacement = liveTeamGames
          .filter(g => g.home_abbr === team || g.away_abbr === team)
          .sort((a, b) => {
            const rankDiff = statusRank(a.status) - statusRank(b.status);
            if (rankDiff !== 0) return rankDiff;
            const aDelta = Math.abs(new Date(a.start_time).getTime() - nowTs);
            const bDelta = Math.abs(new Date(b.start_time).getTime() - nowTs);
            return aDelta - bDelta;
          })[0];

        if (!replacement || replacement.id === pick.game_id) continue;

        const { error } = await supabase
          .from("bet_slip_picks")
          .update({ game_id: replacement.id })
          .eq("id", pick.id);

        if (!error) {
          repairedRef.current.add(pick.id);
          updated++;
        }
      }

      if (updated > 0) {
        queryClient.invalidateQueries({ queryKey: ["bet-slip-picks"] });
      }

      return updated;
    },
    enabled: enabled && picksWithLinkedGames.length > 0,
    refetchInterval: 60_000,
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
        .in("status", [...LIVE_STATUSES]);
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
