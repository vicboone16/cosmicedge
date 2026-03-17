/**
 * Roster hydration confidence hook.
 * Validates player/team entity resolution integrity for a game.
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

      // Get player_game_stats to check roster presence
      const { data: stats } = await supabase
        .from("player_game_stats" as any)
        .select("player_id, team_abbr")
        .eq("game_id", gameId)
        .eq("period", "full");

      const players = stats ?? [];
      const homePlayers = players.filter((p: any) => p.team_abbr === game.home_abbr);
      const awayPlayers = players.filter((p: any) => p.team_abbr === game.away_abbr);

      const missingTeams: string[] = [];
      if (homePlayers.length === 0) missingTeams.push(game.home_abbr);
      if (awayPlayers.length === 0) missingTeams.push(game.away_abbr);

      // Check for players with wrong teams (not matching either game team)
      const stalePlayerCount = players.filter(
        (p: any) => p.team_abbr && p.team_abbr !== game.home_abbr && p.team_abbr !== game.away_abbr
      ).length;

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
