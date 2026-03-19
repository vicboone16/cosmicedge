/**
 * Canonical game roster hook.
 * Merges players table + depth_charts for complete team rosters.
 * Ensures no cross-team leakage and handles partial data gracefully.
 * Uses expandTeamAbbrForQuery to catch stale abbreviations in DB.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { expandTeamAbbrForQuery, normalizeTeamAbbr } from "@/lib/team-abbr-normalize";

export interface RosterPlayer {
  id: string;
  name: string;
  position: string | null;
  team: string;
  birth_date: string | null;
  league: string | null;
  headshot_url: string | null;
  source: "players" | "depth_chart";
}

export interface GameRoster {
  away: RosterPlayer[];
  home: RosterPlayer[];
  awayAbbr: string;
  homeAbbr: string;
  awayPartial: boolean;
  homePartial: boolean;
}

export function useGameRoster(
  homeAbbr: string | undefined,
  awayAbbr: string | undefined,
  league: string | undefined,
) {
  return useQuery({
    queryKey: ["game-roster-canonical", homeAbbr, awayAbbr, league],
    queryFn: async (): Promise<GameRoster | null> => {
      if (!homeAbbr || !awayAbbr || !league) return null;

      // Expand abbreviations to catch stale DB entries (e.g. GS → GSW, PHO → PHX)
      const expandedAbbrs = expandTeamAbbrForQuery([homeAbbr, awayAbbr], league);

      // Fetch from both sources in parallel
      const [playersRes, depthRes] = await Promise.all([
        supabase
          .from("players")
          .select("id, name, position, team, birth_date, league, headshot_url")
          .in("team", expandedAbbrs)
          .eq("league", league)
          .eq("status", "active")
          .limit(80),
        supabase
          .from("depth_charts")
          .select("player_id, player_name, team_abbr, position, depth_order")
          .in("team_abbr", expandedAbbrs)
          .eq("league", league)
          .order("depth_order", { ascending: true }),
      ]);

      const players = playersRes.data || [];
      const depthCharts = depthRes.data || [];

      // Build canonical roster: start with players table, fill gaps from depth_charts
      // Normalize all team abbreviations to canonical form for correct assignment
      const buildTeam = (canonicalAbbr: string): RosterPlayer[] => {
        // Match players whose normalized team matches the canonical abbr
        const teamPlayers = players.filter(
          p => normalizeTeamAbbr(p.team, league) === canonicalAbbr
        );
        const teamDepth = depthCharts.filter(
          d => normalizeTeamAbbr(d.team_abbr, league) === canonicalAbbr
        );

        // Index players by name (lowercase) for dedup
        const seen = new Set<string>();
        const roster: RosterPlayer[] = [];

        // Add players table entries first (canonical source)
        for (const p of teamPlayers) {
          const key = p.name.toLowerCase().trim();
          if (seen.has(key)) continue;
          seen.add(key);
          roster.push({
            id: p.id,
            name: p.name,
            position: p.position,
            team: canonicalAbbr, // Always use canonical abbr
            birth_date: p.birth_date,
            league: p.league,
            headshot_url: p.headshot_url,
            source: "players",
          });
        }

        // Fill from depth_charts if players table is sparse
        if (roster.length < 5) {
          for (const d of teamDepth) {
            const key = d.player_name?.toLowerCase().trim();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            roster.push({
              id: d.player_id || `dc-${key}`,
              name: d.player_name,
              position: d.position,
              team: canonicalAbbr,
              birth_date: null,
              league,
              headshot_url: null,
              source: "depth_chart",
            });
          }
        }

        return roster;
      };

      const away = buildTeam(awayAbbr);
      const home = buildTeam(homeAbbr);

      return {
        away,
        home,
        awayAbbr,
        homeAbbr,
        awayPartial: away.length > 0 && away.length < 5,
        homePartial: home.length > 0 && home.length < 5,
      };
    },
    enabled: !!homeAbbr && !!awayAbbr && !!league,
    staleTime: 60_000,
  });
}
