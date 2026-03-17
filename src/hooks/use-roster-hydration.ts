/**
 * Roster hydration confidence hook.
 * Validates player/team entity resolution integrity for a game.
 * Includes lineup readiness from depth_charts.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RosterHydrationStatus {
  confidence: "high" | "medium" | "low" | "none";
  homePlayersCount: number;
  awayPlayersCount: number;
  homeTeam: string;
  awayTeam: string;
  missingTeams: string[];
  stalePlayerCount: number;
  lineupsReady: boolean;
  lineupCount: number;
  lineupDetail: string;
  detail: string;
}

export function useRosterHydration(gameId: string | undefined) {
  return useQuery({
    queryKey: ["roster-hydration", gameId],
    queryFn: async (): Promise<RosterHydrationStatus | null> => {
      if (!gameId) return null;

      const { data: game } = await supabase
        .from("games")
        .select("home_abbr, away_abbr, league")
        .eq("id", gameId)
        .maybeSingle();

      if (!game) return null;

      // Get player_game_stats + depth_charts in parallel
      const [statsRes, lineupsRes] = await Promise.all([
        supabase
          .from("player_game_stats" as any)
          .select("player_id, team_abbr")
          .eq("game_id", gameId)
          .eq("period", "full"),
        supabase
          .from("depth_charts")
          .select("id, team_abbr, position, depth_order")
          .in("team_abbr", [game.home_abbr, game.away_abbr])
          .eq("league", game.league ?? "NBA"),
      ]);

      const players = statsRes.data ?? [];
      const lineups = lineupsRes.data ?? [];
      const homePlayers = players.filter((p: any) => p.team_abbr === game.home_abbr);
      const awayPlayers = players.filter((p: any) => p.team_abbr === game.away_abbr);

      const missingTeams: string[] = [];
      if (homePlayers.length === 0) missingTeams.push(game.home_abbr);
      if (awayPlayers.length === 0) missingTeams.push(game.away_abbr);

      // Check for wrong-team players
      const stalePlayerCount = players.filter(
        (p: any) => p.team_abbr && p.team_abbr !== game.home_abbr && p.team_abbr !== game.away_abbr
      ).length;

      // Lineup readiness
      const homeLineups = lineups.filter((l: any) => l.team_abbr === game.home_abbr);
      const awayLineups = lineups.filter((l: any) => l.team_abbr === game.away_abbr);
      const lineupsReady = homeLineups.length >= 5 && awayLineups.length >= 5;

      let lineupDetail: string;
      if (lineupsReady) {
        lineupDetail = `${homeLineups.length} home + ${awayLineups.length} away depth chart entries`;
      } else if (lineups.length > 0) {
        lineupDetail = `Partial: ${homeLineups.length} home, ${awayLineups.length} away entries`;
      } else {
        lineupDetail = "No depth chart data available";
      }

      let confidence: RosterHydrationStatus["confidence"];
      if (homePlayers.length >= 5 && awayPlayers.length >= 5 && stalePlayerCount === 0) {
        confidence = "high";
      } else if (homePlayers.length >= 1 && awayPlayers.length >= 1) {
        confidence = "medium";
      } else if (players.length > 0) {
        confidence = "low";
      } else {
        confidence = "none";
      }

      return {
        confidence,
        homePlayersCount: homePlayers.length,
        awayPlayersCount: awayPlayers.length,
        homeTeam: game.home_abbr,
        awayTeam: game.away_abbr,
        missingTeams,
        stalePlayerCount,
        lineupsReady,
        lineupCount: lineups.length,
        lineupDetail,
        detail: confidence === "high"
          ? `${homePlayers.length} home + ${awayPlayers.length} away players`
          : confidence === "none"
            ? "No roster data available"
            : `Partial: ${homePlayers.length} home, ${awayPlayers.length} away, ${stalePlayerCount} stale`,
      };
    },
    enabled: !!gameId,
    staleTime: 30_000,
  });
}
