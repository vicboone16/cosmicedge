/**
 * Hook: useOracle — Fetches team ratings and computes Oracle predictions for a game.
 * Also fetches persisted model_game_predictions for server-side results.
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
  type PeriodAverages,
} from "@/lib/oracle-engine";

export interface StoredPrediction {
  id: string;
  game_id: string;
  sport: string;
  model_name: string;
  model_version: string;
  run_ts: string;
  mu_home: number | null;
  mu_away: number | null;
  mu_total: number | null;
  mu_spread_home: number | null;
  p_home_win: number | null;
  p_away_win: number | null;
  fair_ml_home: number | null;
  fair_ml_away: number | null;
  expected_possessions: number | null;
  blowout_risk: number | null;
  book_implied_home: number | null;
  edge_home: number | null;
  edge_away: number | null;
  p_home_win_ci_low: number | null;
  p_home_win_ci_high: number | null;
  qtr_wp_home: number[] | null;
  qtr_fair_ml: { home: number; away: number }[] | null;
  features_json: Record<string, any> | null;
  notes_json: Record<string, any> | null;
}

interface OracleResult {
  pregame: PregameOutput | null;
  quarters: QuarterPrediction[];
  liveWP: LiveWPOutput | null;
  isLoading: boolean;
  homeRatings: TeamRatings | null;
  awayRatings: TeamRatings | null;
  // Persisted server-side predictions
  storedPredictions: StoredPrediction[];
  storedLoading: boolean;
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
    staleTime: 300_000,
    enabled: !!gameId && !!homeAbbr && !!awayAbbr,
  });

  // Fetch period averages from team_period_averages
  const { data: periodAvgsData } = useQuery({
    queryKey: ["team-period-averages", homeAbbr, awayAbbr, season, league],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_period_averages")
        .select("team_abbr, period, avg_points, avg_points_allowed")
        .eq("league", league)
        .eq("season", season)
        .in("team_abbr", [homeAbbr, awayAbbr]);
      return data || [];
    },
    staleTime: 300_000,
    enabled: !!gameId && !!homeAbbr && !!awayAbbr,
  });

  // Fetch persisted predictions from model_game_predictions
  const { data: storedPredictions = [], isLoading: storedLoading } = useQuery({
    queryKey: ["model-game-predictions", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("model_game_predictions")
        .select("*")
        .eq("game_id", gameId!)
        .eq("model_name", "oracle_ml")
        .order("run_ts", { ascending: false })
        .limit(10);
      return (data || []) as unknown as StoredPrediction[];
    },
    staleTime: 60_000,
    enabled: !!gameId,
  });

  // Sanity-check ratings: if ORTG/DRTG > 150 or pace < 50, the data is corrupt — use defaults
  const sanitizeRatings = (row: any): TeamRatings => {
    const offRtg = Number(row.off_rating) || 110;
    const defRtg = Number(row.def_rating) || 110;
    const pace = Number(row.avg_pace) || 100;
    const netRtg = Number(row.net_rating) || 0;
    const gamesPlayed = row.games_played || 0;

    const isCorrupt = offRtg > 150 || defRtg > 150 || pace < 50 || pace > 120;
    if (isCorrupt) {
      console.warn(`[Oracle] Corrupt ratings for ${row.team_abbr}: ORTG=${offRtg}, DRTG=${defRtg}, Pace=${pace}. Using defaults.`);
      return DEFAULT_RATINGS;
    }
    return { offRtg, defRtg, netRtg, pace, gamesPlayed };
  };

  const homeRatings = useMemo(() => {
    const row = paceData?.find(r => r.team_abbr === homeAbbr);
    if (!row) return null;
    return sanitizeRatings(row);
  }, [paceData, homeAbbr]);

  const awayRatings = useMemo(() => {
    const row = paceData?.find(r => r.team_abbr === awayAbbr);
    if (!row) return null;
    return sanitizeRatings(row);
  }, [paceData, awayAbbr]);

  const pregame = useMemo(() => {
    if (!homeRatings || !awayRatings) return null;
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

  const homePeriodAvgs: PeriodAverages[] = useMemo(() => {
    return (periodAvgsData || [])
      .filter((r: any) => r.team_abbr === homeAbbr)
      .map((r: any) => ({ period: r.period, avgPoints: Number(r.avg_points) || 0, avgPointsAllowed: Number(r.avg_points_allowed) || 0 }));
  }, [periodAvgsData, homeAbbr]);

  const awayPeriodAvgs: PeriodAverages[] = useMemo(() => {
    return (periodAvgsData || [])
      .filter((r: any) => r.team_abbr === awayAbbr)
      .map((r: any) => ({ period: r.period, avgPoints: Number(r.avg_points) || 0, avgPointsAllowed: Number(r.avg_points_allowed) || 0 }));
  }, [periodAvgsData, awayAbbr]);

  const quarters = useMemo(() => {
    if (!pregame) return [];
    return computeQuarterPredictions(pregame, sport, undefined, homePeriodAvgs, awayPeriodAvgs);
  }, [pregame, sport, homePeriodAvgs, awayPeriodAvgs]);

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
    storedPredictions,
    storedLoading,
  };
}
