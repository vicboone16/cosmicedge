import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveOverlayPlayerNames } from "@/lib/resolve-player-names";

export interface NebulaOverlay {
  id: string;
  game_id: string;
  player_id: string;
  prop_type: string;
  book: string;
  edge_score: number;
  edge_score_v11: number | null;
  edge_score_v20: number | null;
  confidence_tier: string | null;
  p_model: number | null;
  p_implied: number | null;
  edge_raw: number | null;
  pace_mu_adjust: number | null;
  pace_sigma_adjust: number | null;
  transit_boost_factor: number | null;
  volatility_shift: number | null;
  confidence_adjustment: number | null;
  confidence: number;
  risk: number;
  mu: number;
  sigma: number;
  line: number | null;
  odds: number | null;
  side: string | null;
  hit_l10: number | null;
  hit_l20: number | null;
  streak: number | null;
  microbars: any[];
  one_liner: string | null;
  pred_ts: string;
  astro: any;
  // joined fields
  game_start_time?: string;
  home_abbr?: string;
  away_abbr?: string;
  league?: string;
  player_name?: string;
  player_team?: string;
  headshot_url?: string | null;
}

export type SelectedModel = "nebula_v1" | "nebula_v1_transitlift";

export function overlayKey(gameId: string, playerId: string, propType: string) {
  return `${gameId}:${playerId}:${propType}`;
}

export function useNebulaOverlayByPlayer(playerId: string | undefined) {
  return useQuery({
    queryKey: ["nebula-overlay-player", playerId],
    queryFn: async () => {
      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + 7);
      const { data } = await supabase
        .from("np_v_prop_overlay" as any)
        .select("*")
        .eq("player_id", playerId!)
        .gte("game_start_time", now.toISOString())
        .lte("game_start_time", future.toISOString())
        .order("edge_score_v11", { ascending: false, nullsFirst: false } as any)
        .order("edge_score", { ascending: false });
      const rows = (data || []) as unknown as NebulaOverlay[];
      return resolveOverlayPlayerNames(rows);
    },
    enabled: !!playerId,
    staleTime: 60_000,
  });
}

export function useNebulaOverlayByGame(gameId: string | undefined) {
  return useQuery({
    queryKey: ["nebula-overlay-game", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("np_v_prop_overlay" as any)
        .select("*")
        .eq("game_id", gameId!)
        .order("edge_score_v11", { ascending: false, nullsFirst: false } as any)
        .order("edge_score", { ascending: false });
      const rows = (data || []) as unknown as NebulaOverlay[];
      return resolveOverlayPlayerNames(rows);
    },
    enabled: !!gameId,
    staleTime: 60_000,
  });
}

export function useNebulaOverlayByTeam(teamAbbr: string | undefined) {
  return useQuery({
    queryKey: ["nebula-overlay-team", teamAbbr],
    queryFn: async () => {
      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + 7);
      const { data } = await supabase
        .from("np_v_prop_overlay" as any)
        .select("*")
        .eq("player_team", teamAbbr!)
        .gte("game_start_time", now.toISOString())
        .lte("game_start_time", future.toISOString())
        .order("edge_score_v11", { ascending: false, nullsFirst: false } as any)
        .order("edge_score", { ascending: false });
      const rows = (data || []) as unknown as NebulaOverlay[];
      return resolveOverlayPlayerNames(rows);
    },
    enabled: !!teamAbbr,
    staleTime: 60_000,
  });
}

export function buildOverlayMap(rows: NebulaOverlay[]): Record<string, NebulaOverlay> {
  const map: Record<string, NebulaOverlay> = {};
  for (const r of rows) {
    map[overlayKey(r.game_id, r.player_id, r.prop_type)] = r;
  }
  return map;
}
