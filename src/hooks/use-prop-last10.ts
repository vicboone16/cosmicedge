import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface StatRow {
  game_id: string;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  three_made: number | null;
  steals: number | null;
  blocks: number | null;
  minutes: number | null;
  team_abbr: string | null;
  created_at: string;
}

const EXTRACTORS: Record<string, (s: StatRow) => number | null> = {
  points: (s) => s.points,
  pts: (s) => s.points,
  rebounds: (s) => s.rebounds,
  reb: (s) => s.rebounds,
  assists: (s) => s.assists,
  ast: (s) => s.assists,
  threes: (s) => s.three_made,
  pra: (s) => (s.points ?? 0) + (s.rebounds ?? 0) + (s.assists ?? 0),
  pts_reb_ast: (s) => (s.points ?? 0) + (s.rebounds ?? 0) + (s.assists ?? 0),
  pts_reb: (s) => (s.points ?? 0) + (s.rebounds ?? 0),
  pts_ast: (s) => (s.points ?? 0) + (s.assists ?? 0),
  reb_ast: (s) => (s.rebounds ?? 0) + (s.assists ?? 0),
  steals: (s) => s.steals,
  blocks: (s) => s.blocks,
};

export interface PropSplitRow {
  game_id: string;
  game_date: string;
  opponent: string | null;
  is_home: boolean;
  stat: number | null;
  hit: boolean | null;
}

export interface PropLast10Result {
  rows: PropSplitRow[];
  hits: number;
  total: number;
  avg: number | null;
  loading: boolean;
}

export function usePropLast10(
  playerId: string | null,
  propType: string | null,
  line: number | null,
): PropLast10Result {
  const q = useQuery({
    queryKey: ["prop-last10", playerId, propType, line],
    enabled: !!(playerId && propType),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const extractor = EXTRACTORS[String(propType).toLowerCase()];
      if (!extractor) return [];

      const { data: stats } = await supabase
        .from("player_game_stats" as any)
        .select("game_id, points, rebounds, assists, three_made, steals, blocks, minutes, team_abbr, created_at")
        .eq("player_id", playerId!)
        .order("created_at", { ascending: false })
        .limit(20);

      const statRows = ((stats ?? []) as unknown as StatRow[]);
      const played = statRows.filter((s) => (s.minutes ?? 0) > 0).slice(0, 10);
      if (played.length === 0) return [];

      const gameIds = played.map((s) => s.game_id);
      const { data: games } = await supabase
        .from("games")
        .select("id, start_time, home_abbr, away_abbr")
        .in("id", gameIds);
      const gameMap = new Map<string, any>();
      for (const g of (games ?? []) as any[]) gameMap.set(g.id, g);

      return played.map((s): PropSplitRow => {
        const g = gameMap.get(s.game_id);
        const stat = extractor(s);
        const hit = stat != null && line != null ? stat > line : null;
        const isHome = g?.home_abbr === s.team_abbr;
        const opponent = isHome ? (g?.away_abbr ?? null) : (g?.home_abbr ?? null);
        return { game_id: s.game_id, game_date: g?.start_time ?? s.created_at, opponent, is_home: !!isHome, stat, hit };
      }).sort((a, b) => b.game_date.localeCompare(a.game_date));
    },
  });

  const rows = q.data ?? [];
  const hits = rows.filter((r) => r.hit === true).length;
  const total = rows.filter((r) => r.hit != null).length;
  const valid = rows.filter((r) => r.stat != null).map((r) => r.stat as number);
  const avg = valid.length ? +(valid.reduce((s, v) => s + v, 0) / valid.length).toFixed(1) : null;

  return { rows, hits, total, avg, loading: q.isLoading };
}
