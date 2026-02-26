/**
 * Hook: useOracle — Fetches team ratings and computes Oracle predictions for a game
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import {
  computePregame,
  computeQuarterPredictions,
  computeLiveWP,
  americanToImplied,
  type Sport,
  type TeamRatings,
  type PregameOutput,
  type QuarterPrediction,
  type LiveWPOutput,
} from "@/lib/oracle-engine";

interface OracleResult {
  pregame: PregameOutput | null;
  quarters: QuarterPrediction[];
  liveWP: LiveWPOutput | null;
  isLoading: boolean;
  homeRatings: TeamRatings | null;
  awayRatings: TeamRatings | null;
}

function getCurrentSeason(): number {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
}

const DEFAULT_RATINGS: TeamRatings = {
  offRtg: 110,
  defRtg: 110,
  netRtg: 0,
  pace: 100,
  gamesPlayed: 0,
};

export function useOracle(
  gameId: string | undefined,
  homeAbbr: string,
  awayAbbr: string,
  league: string,
  bookMLHome?: number,
  bookMLAway?: number,
  bookSpread?: number,
  bookTotal?: number,
  // Live state (optional)
  liveScoreDiff?: number,
  liveTimeRemaining?: number,
  livePossession?: number,
  liveQuarter?: number,
  isLive?: boolean,
): OracleResult {
  const season = getCurrentSeason();
  const sport = league as Sport;

  // Fetch team ratings from team_season_pace
  const { data: paceData, isLoading } = useQuery({
    queryKey: ["team-pace-oracle", homeAbbr, awayAbbr, season, league],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_season_pace")
        .select("*")
        .eq("league", league)
        .eq("season", season)
        .in("team_abbr", [homeAbbr, awayAbbr]);
      return data || [];
    },
    staleTime: 300_000, // 5 min cache
    enabled: !!gameId && !!homeAbbr && !!awayAbbr,
  });

  const homeRatings = useMemo(() => {
    const row = paceData?.find(r => r.team_abbr === homeAbbr);
    if (!row) return null;
    return {
      offRtg: Number(row.off_rating) || 110,
      defRtg: Number(row.def_rating) || 110,
      netRtg: Number(row.net_rating) || 0,
      pace: Number(row.avg_pace) || 100,
      gamesPlayed: row.games_played || 0,
    } as TeamRatings;
  }, [paceData, homeAbbr]);

  const awayRatings = useMemo(() => {
    const row = paceData?.find(r => r.team_abbr === awayAbbr);
    if (!row) return null;
    return {
      offRtg: Number(row.off_rating) || 110,
      defRtg: Number(row.def_rating) || 110,
      netRtg: Number(row.net_rating) || 0,
      pace: Number(row.avg_pace) || 100,
      gamesPlayed: row.games_played || 0,
    } as TeamRatings;
  }, [paceData, awayAbbr]);

  const pregame = useMemo(() => {
    if (!homeRatings || !awayRatings) return null;
    // Need at least some data
    if (homeRatings.gamesPlayed < 1 && awayRatings.gamesPlayed < 1) return null;
    
    return computePregame({
      sport,
      homeRatings: homeRatings.gamesPlayed > 0 ? homeRatings : DEFAULT_RATINGS,
      awayRatings: awayRatings.gamesPlayed > 0 ? awayRatings : DEFAULT_RATINGS,
      bookMLHome,
      bookMLAway,
      bookSpread,
      bookTotal,
    });
  }, [homeRatings, awayRatings, sport, bookMLHome, bookMLAway, bookSpread, bookTotal]);

  const quarters = useMemo(() => {
    if (!pregame) return [];
    return computeQuarterPredictions(pregame, sport);
  }, [pregame, sport]);

  const liveWP = useMemo(() => {
    if (!isLive || liveScoreDiff == null || liveTimeRemaining == null) return null;
    return computeLiveWP({
      sport,
      scoreDiff: liveScoreDiff,
      timeRemaining: liveTimeRemaining,
      possession: livePossession ?? 0,
      isHome: true,
      paceEstimate: pregame?.expectedPossessions,
      quarter: liveQuarter,
    });
  }, [isLive, liveScoreDiff, liveTimeRemaining, livePossession, liveQuarter, sport, pregame]);

  return {
    pregame,
    quarters,
    liveWP,
    isLoading,
    homeRatings,
    awayRatings,
  };
}
