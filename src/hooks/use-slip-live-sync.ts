import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Maps bet-slip stat_type strings to player_game_stats columns.
 * Handles period prefixes like "q1:points" → period="q1", col="points"
 * and combo stats like "pra" → points + rebounds + assists
 */
const STAT_MAP: Record<string, string[]> = {
  points: ["points"],
  pts: ["points"],
  rebounds: ["rebounds"],
  reb: ["rebounds"],
  assists: ["assists"],
  ast: ["assists"],
  steals: ["steals"],
  stl: ["steals"],
  blocks: ["blocks"],
  blk: ["blocks"],
  turnovers: ["turnovers"],
  tov: ["turnovers"],
  three_made: ["three_made"],
  "3pm": ["three_made"],
  threes: ["three_made"],
  pra: ["points", "rebounds", "assists"],
  "pts+reb+ast": ["points", "rebounds", "assists"],
  "pts+reb+asts": ["points", "rebounds", "assists"],
  pr: ["points", "rebounds"],
  "pts+reb": ["points", "rebounds"],
  pa: ["points", "assists"],
  "pts+ast": ["points", "assists"],
  "pts+asts": ["points", "assists"],
  ra: ["rebounds", "assists"],
  "reb+ast": ["rebounds", "assists"],
  "reb+asts": ["rebounds", "assists"],
  sb: ["steals", "blocks"],
  "stl+blk": ["steals", "blocks"],
  "blk+stl": ["steals", "blocks"],
  fantasy_points: ["fantasy_points"],
  fantasy: ["fantasy_points"],
  fg_made: ["fg_made"],
  ft_made: ["ft_made"],
  minutes: ["minutes"],
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
  for (const col of statColumns) {
    total += Number(row[col]) || 0;
  }
  return total;
}

interface Pick {
  id: string;
  player_id?: string | null;
  player_name_raw: string;
  game_id?: string | null;
  stat_type: string;
  live_value?: number | null;
}

/**
 * Polls player_game_stats for all picks on live/in_progress games
 * and writes live_value back to bet_slip_picks.
 */
export function useSlipLiveSync(picks: Pick[], enabled = true) {
  const queryClient = useQueryClient();
  const lastWrittenRef = useRef<Record<string, number>>({});

  // Get unique game IDs from picks
  const gameIds = [...new Set(picks.map(p => p.game_id).filter(Boolean) as string[])];

  // Check which games are live
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

  // Get player IDs we need stats for (only for live games)
  const livePicks = picks.filter(p => p.game_id && liveGameIds?.includes(p.game_id) && p.player_id);

  // Fetch live stats for those players
  const { data: liveStats } = useQuery({
    queryKey: ["slip-live-player-stats", livePicks.map(p => `${p.player_id}:${p.game_id}`).join(",")],
    queryFn: async () => {
      if (!livePicks.length) return [];
      
      // Build unique (player_id, game_id) pairs
      const pairs = livePicks.map(p => ({ player_id: p.player_id!, game_id: p.game_id! }));
      const uniqueGameIds = [...new Set(pairs.map(p => p.game_id))];
      const uniquePlayerIds = [...new Set(pairs.map(p => p.player_id))];

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

  // Write live_value updates back to bet_slip_picks
  useEffect(() => {
    if (!liveStats?.length || !livePicks.length) return;

    const updates: { id: string; live_value: number }[] = [];

    for (const pick of livePicks) {
      const { period, cleanStat } = parsePeriod(pick.stat_type);
      const columns = STAT_MAP[cleanStat];
      if (!columns) continue;

      // Find matching stat row
      const statRow = liveStats.find(
        s => s.player_id === pick.player_id && s.game_id === pick.game_id && s.period === period
      );
      if (!statRow) continue;

      const val = resolveStatValue(statRow, columns);
      
      // Only write if value changed
      if (lastWrittenRef.current[pick.id] === val) continue;
      lastWrittenRef.current[pick.id] = val;
      updates.push({ id: pick.id, live_value: val });
    }

    if (updates.length === 0) return;

    // Batch update
    (async () => {
      for (const u of updates) {
        await supabase
          .from("bet_slip_picks")
          .update({ live_value: u.live_value })
          .eq("id", u.id);
      }
      // Invalidate picks cache so UI refreshes
      queryClient.invalidateQueries({ queryKey: ["bet-slip-picks"] });
    })();
  }, [liveStats, livePicks, queryClient]);

  return { liveGameCount: liveGameIds?.length || 0 };
}
