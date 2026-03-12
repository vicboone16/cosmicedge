import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveOverlayPlayerNames } from "@/lib/resolve-player-names";

export interface TopProp {
  id: string;
  game_id: string;
  player_id: string;
  player_name: string;
  player_team: string;
  headshot_url: string | null;
  prop_type: string;
  line: number | null;
  mu: number;
  sigma: number;
  edge_score: number;
  edge_score_v11: number | null;
  confidence_tier: string | null;
  side: string | null;
  odds: number | null;
  one_liner: string | null;
  hit_l10: number | null;
  streak: number | null;
  home_abbr?: string;
  away_abbr?: string;
  game_start_time?: string;
  league?: string;
}

const PROP_LABELS: Record<string, string> = {
  points: "PTS", rebounds: "REB", assists: "AST", steals: "STL", blocks: "BLK",
  threes: "3PM", pts_reb_ast: "PRA", pts_reb: "P+R", pts_ast: "P+A", reb_ast: "R+A",
  turnovers: "TOV", fantasy_score: "FPTS",
  // BDL / market key variants
  player_points: "PTS", player_rebounds: "REB", player_assists: "AST",
  player_steals: "STL", player_blocks: "BLK", player_threes: "3PM",
  player_turnovers: "TOV", player_points_rebounds_assists: "PRA",
  player_points_rebounds: "P+R", player_points_assists: "P+A",
  player_rebounds_assists: "R+A", player_blocks_steals: "B+S",
  player_double_double: "DD", player_triple_double: "TD",
};

export function getPropLabel(propType: string): string {
  return PROP_LABELS[propType] || propType.replace(/_/g, " ");
}

export function getEdgeTier(score: number): { label: string; className: string } {
  if (score >= 70) return { label: "Elite", className: "bg-cosmic-green/15 text-cosmic-green border-cosmic-green/30" };
  if (score >= 60) return { label: "Strong", className: "bg-primary/15 text-primary border-primary/30" };
  if (score >= 55) return { label: "Playable", className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" };
  return { label: "Watch", className: "bg-muted text-muted-foreground border-border" };
}

export function useTopPropsForGame(gameId: string | undefined, limit = 5) {
  return useQuery({
    queryKey: ["top-props-game", gameId, limit],
    queryFn: async () => {
      const { data } = await supabase
        .from("np_v_prop_overlay" as any)
        .select("*")
        .eq("game_id", gameId!)
        .order("edge_score_v11", { ascending: false, nullsFirst: false } as any)
        .order("edge_score", { ascending: false })
        .limit(limit);
      const rows = (data || []) as unknown as TopProp[];
      return resolveOverlayPlayerNames(rows);
    },
    enabled: !!gameId,
    staleTime: 60_000,
  });
}

export function useTopPropsToday(limit = 10) {
  return useQuery({
    queryKey: ["top-props-today", limit],
    queryFn: async () => {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from("np_v_prop_overlay" as any)
        .select("*")
        .gte("game_start_time", startOfDay.toISOString())
        .lte("game_start_time", endOfDay.toISOString())
        .order("edge_score_v11", { ascending: false, nullsFirst: false } as any)
        .order("edge_score", { ascending: false })
        .limit(limit);
      return (data || []) as unknown as TopProp[];
    },
    staleTime: 60_000,
  });
}
