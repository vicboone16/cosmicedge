import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface QuarterScore {
  quarter: number;
  home_score: number | null;
  away_score: number | null;
}

export function PeriodScoresTicker({ gameId, league, isLive }: { gameId: string; league: string; isLive: boolean }) {
  // 1. Primary: game_quarters table (populated by fetch-live-scores for final games)
  const { data: gameQuarters } = useQuery({
    queryKey: ["game-quarters", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("game_quarters")
        .select("quarter, home_score, away_score")
        .eq("game_id", gameId)
        .order("quarter", { ascending: true });
      return data || [];
    },
    staleTime: isLive ? 15_000 : 5 * 60_000,
    refetchInterval: isLive ? 15_000 : false,
  });

  // 2. For live NBA games: derive from pbp_quarter_team_stats via cosmic_games lookup
  const { data: gameInfo } = useQuery({
    queryKey: ["game-info-ticker", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("games")
        .select("home_abbr, away_abbr, start_time")
        .eq("id", gameId)
        .maybeSingle();
      return data;
    },
    enabled: isLive && league === "NBA" && (!gameQuarters || gameQuarters.length === 0),
  });

  const { data: pbpQuarterScores } = useQuery({
    queryKey: ["pbp-quarter-scores", gameId, gameInfo?.home_abbr],
    queryFn: async () => {
      if (!gameInfo) return [];
      const dateStr = gameInfo.start_time?.slice(0, 10);
      // Look up cosmic game_key
      const { data: cosmic } = await supabase
        .from("cosmic_games")
        .select("game_key")
        .eq("game_date", dateStr)
        .eq("home_team_abbr", gameInfo.home_abbr)
        .eq("away_team_abbr", gameInfo.away_abbr)
        .maybeSingle();

      if (!cosmic?.game_key) return [];

      // Fetch pbp_quarter_team_stats for this game_key
      const { data: stats } = await supabase
        .from("pbp_quarter_team_stats")
        .select("period, team_abbr, pts")
        .eq("game_key", cosmic.game_key)
        .order("period", { ascending: true });

      if (!stats || stats.length === 0) return [];

      // Group by period: home vs away
      const periods: Record<number, { home_score: number; away_score: number }> = {};
      for (const s of stats) {
        if (!periods[s.period]) periods[s.period] = { home_score: 0, away_score: 0 };
        if (s.team_abbr === gameInfo.home_abbr) {
          periods[s.period].home_score = s.pts;
        } else {
          periods[s.period].away_score = s.pts;
        }
      }

      return Object.entries(periods)
        .map(([p, scores]) => ({ quarter: Number(p), ...scores }))
        .sort((a, b) => a.quarter - b.quarter);
    },
    enabled: isLive && league === "NBA" && !!gameInfo && (!gameQuarters || gameQuarters.length === 0),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  // 3. Fallback: derive from game_state_snapshots (latest snapshot per quarter)
  const { data: snapshotScores } = useQuery({
    queryKey: ["snapshot-quarter-scores", gameId],
    queryFn: async () => {
      const { data: snapshots } = await supabase
        .from("game_state_snapshots")
        .select("quarter, home_score, away_score, captured_at")
        .eq("game_id", gameId)
        .not("quarter", "is", null)
        .order("captured_at", { ascending: true });

      if (!snapshots || snapshots.length === 0) return [];

      // Parse quarter indicators (Q1, Q2, P1, etc.) and derive per-period scores
      // We track cumulative scores at each quarter transition
      const quarterMap: Record<number, { home_score: number; away_score: number }> = {};
      let prevHome = 0;
      let prevAway = 0;

      // Get unique quarters in order
      const qNums: { q: number; home: number; away: number }[] = [];
      for (const snap of snapshots) {
        const qMatch = snap.quarter?.match(/(\d+)/);
        if (!qMatch) continue;
        const qNum = parseInt(qMatch[1]);
        qNums.push({ q: qNum, home: snap.home_score ?? 0, away: snap.away_score ?? 0 });
      }

      // Get the last snapshot for each quarter (cumulative total at end of that quarter)
      const lastByQ: Record<number, { home: number; away: number }> = {};
      for (const item of qNums) {
        lastByQ[item.q] = { home: item.home, away: item.away };
      }

      // Convert cumulative to per-period
      const sortedQs = Object.keys(lastByQ).map(Number).sort((a, b) => a - b);
      for (const q of sortedQs) {
        const cumHome = lastByQ[q].home;
        const cumAway = lastByQ[q].away;
        quarterMap[q] = {
          home_score: cumHome - prevHome,
          away_score: cumAway - prevAway,
        };
        prevHome = cumHome;
        prevAway = cumAway;
      }

      return Object.entries(quarterMap)
        .map(([p, scores]) => ({ quarter: Number(p), ...scores }))
        .sort((a, b) => a.quarter - b.quarter);
    },
    enabled: isLive && (!gameQuarters || gameQuarters.length === 0) && (!pbpQuarterScores || pbpQuarterScores.length === 0),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  // Choose the best available data source
  const quarters: QuarterScore[] =
    (gameQuarters && gameQuarters.length > 0) ? gameQuarters :
    (pbpQuarterScores && pbpQuarterScores.length > 0) ? pbpQuarterScores :
    (snapshotScores && snapshotScores.length > 0) ? snapshotScores :
    [];

  if (!quarters.length) return null;

  const periodLabel = league === "NHL" ? "P" : league === "MLB" ? "" : "Q";

  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
      {quarters.map((q) => (
        <div key={q.quarter} className="flex flex-col items-center min-w-[28px]">
          <span className="text-[8px] text-muted-foreground uppercase">
            {periodLabel}{q.quarter}
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
            {q.away_score ?? "-"}
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-foreground">
            {q.home_score ?? "-"}
          </span>
        </div>
      ))}
    </div>
  );
}
