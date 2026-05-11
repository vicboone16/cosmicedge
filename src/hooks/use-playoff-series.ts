/**
 * Hook: usePlayoffSeries — Derives playoff series from games data.
 * Groups playoff games by matchup (team pair) and calculates series records.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlayoffGame {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number | null;
  awayScore: number | null;
  startTime: string;
  status: string;
  venue: string | null;
  league: string;
}

export interface PlayoffSeries {
  /** Stable key: sorted abbr pair e.g. "BOS-MIL" */
  key: string;
  /** Higher-seeded / home-advantage team */
  teamA: { abbr: string; name: string; wins: number; seed: number | null };
  /** Lower-seeded team */
  teamB: { abbr: string; name: string; wins: number; seed: number | null };
  /** All games in this series, chronological */
  games: PlayoffGame[];
  /** Current game number (total played + 1, or series length if over) */
  gameNumber: number;
  /** true if one team has 4 wins */
  isComplete: boolean;
  /** Winner abbreviation if complete */
  winner: string | null;
  /** "First Round" | "Second Round" | "Conference Finals" | "Finals" */
  round: string;
  league: string;
}

/** Map series length to round name based on typical NBA/NHL playoff structure */
function inferRound(seriesGames: PlayoffGame[], allSeries: Map<string, PlayoffGame[]>): string {
  // Use the total number of active series to infer round
  const totalSeries = allSeries.size;
  if (totalSeries >= 7) return "First Round";
  if (totalSeries >= 3) return "Second Round";
  if (totalSeries >= 2) return "Conference Finals";
  return "Finals";
}

function makeSeriesKey(abbr1: string, abbr2: string): string {
  return [abbr1, abbr2].sort().join("-");
}

export function usePlayoffSeries(league: string, season?: number) {
  const currentSeason = season ?? (new Date().getMonth() >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1);

  // For NBA/NHL playoffs, the postseason typically runs April-June
  // We fetch all games in the playoff window
  const playoffStart = `${currentSeason + 1}-04-01`;
  const playoffEnd = `${currentSeason + 1}-07-01`;

  return useQuery({
    queryKey: ["playoff-series", league, currentSeason],
    queryFn: async (): Promise<PlayoffSeries[]> => {
      // Fetch all playoff-window games for this league
      const { data: games } = await supabase
        .from("games")
        .select("id, home_team, away_team, home_abbr, away_abbr, home_score, away_score, start_time, status, venue, league")
        .eq("league", league)
        .gte("start_time", playoffStart)
        .lte("start_time", playoffEnd)
        .order("start_time", { ascending: true })
        .limit(200);

      if (!games?.length) return [];

      // Fetch standings for seeding
      const { data: standings } = await supabase
        .from("standings")
        .select("team_abbr, playoff_seed, conference")
        .eq("league", league)
        .eq("season", currentSeason)
        .not("playoff_seed", "is", null);

      const seedMap = new Map<string, number>();
      for (const s of standings || []) {
        if (s.playoff_seed) seedMap.set(s.team_abbr, s.playoff_seed);
      }

      // Group games into series by team pair
      const seriesMap = new Map<string, PlayoffGame[]>();

      for (const g of games) {
        const key = makeSeriesKey(g.home_abbr, g.away_abbr);
        const pg: PlayoffGame = {
          id: g.id,
          homeTeam: g.home_team,
          awayTeam: g.away_team,
          homeAbbr: g.home_abbr,
          awayAbbr: g.away_abbr,
          homeScore: g.home_score,
          awayScore: g.away_score,
          startTime: g.start_time,
          status: g.status,
          venue: g.venue,
          league: g.league,
        };
        const arr = seriesMap.get(key) || [];
        arr.push(pg);
        seriesMap.set(key, arr);
      }

      // Build series objects
      const seriesList: PlayoffSeries[] = [];

      for (const [key, seriesGames] of seriesMap.entries()) {
        // Only include matchups with 2+ games (filter out regular season stragglers)
        if (seriesGames.length < 2) continue;

        const [abbrA, abbrB] = key.split("-");
        let winsA = 0;
        let winsB = 0;
        let nameA = "";
        let nameB = "";

        for (const g of seriesGames) {
          if (g.status !== "final") continue;
          const homeWon = (g.homeScore ?? 0) > (g.awayScore ?? 0);
          const winnerAbbr = homeWon ? g.homeAbbr : g.awayAbbr;

          if (winnerAbbr === abbrA) winsA++;
          else if (winnerAbbr === abbrB) winsB++;

          if (!nameA) nameA = g.homeAbbr === abbrA ? g.homeTeam : g.awayTeam;
          if (!nameB) nameB = g.homeAbbr === abbrB ? g.homeTeam : g.awayTeam;
        }

        // Fill names from any game if not set from finals
        if (!nameA || !nameB) {
          const g0 = seriesGames[0];
          if (!nameA) nameA = g0.homeAbbr === abbrA ? g0.homeTeam : g0.awayTeam;
          if (!nameB) nameB = g0.homeAbbr === abbrB ? g0.homeTeam : g0.awayTeam;
        }

        const seedA = seedMap.get(abbrA) ?? null;
        const seedB = seedMap.get(abbrB) ?? null;

        // Team with lower seed number (higher rank) is teamA
        const aIsHigher = (seedA ?? 99) <= (seedB ?? 99);

        const isComplete = winsA >= 4 || winsB >= 4;
        const winner = isComplete ? (winsA >= 4 ? abbrA : abbrB) : null;

        seriesList.push({
          key,
          teamA: {
            abbr: aIsHigher ? abbrA : abbrB,
            name: aIsHigher ? nameA : nameB,
            wins: aIsHigher ? winsA : winsB,
            seed: aIsHigher ? seedA : seedB,
          },
          teamB: {
            abbr: aIsHigher ? abbrB : abbrA,
            name: aIsHigher ? nameB : nameA,
            wins: aIsHigher ? winsB : winsA,
            seed: aIsHigher ? seedB : seedA,
          },
          games: seriesGames,
          gameNumber: winsA + winsB + 1,
          isComplete,
          winner,
          round: inferRound(seriesGames, seriesMap),
          league,
        });
      }

      // Sort: active series first, then by seed
      seriesList.sort((a, b) => {
        if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
        return (a.teamA.seed ?? 99) - (b.teamA.seed ?? 99);
      });

      return seriesList;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!league,
  });
}
