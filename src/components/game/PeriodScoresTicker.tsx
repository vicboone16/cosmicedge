import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface QuarterScore {
  quarter: number;
  home_score: number | null;
  away_score: number | null;
}

export function PeriodScoresTicker({ gameId, league, isLive }: { gameId: string; league: string; isLive: boolean }) {
  // 1. game_quarters (primary for final games)
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

  // 2. For live NBA: derive from pbp_quarter_team_stats
  const { data: pbpQuarterScores } = useQuery({
    queryKey: ["pbp-quarter-scores-ticker", gameId],
    queryFn: async () => {
      // Get game info for team abbrs
      const { data: gameInfo } = await supabase
        .from("games")
        .select("home_abbr, away_abbr, start_time")
        .eq("id", gameId)
        .maybeSingle();

      if (!gameInfo) return [];

      const dateStr = gameInfo.start_time?.slice(0, 10);
      const { data: cosmic } = await supabase
        .from("cosmic_games")
        .select("game_key")
        .eq("game_date", dateStr)
        .eq("home_team_abbr", gameInfo.home_abbr)
        .eq("away_team_abbr", gameInfo.away_abbr)
        .maybeSingle();

      if (!cosmic?.game_key) return [];

      const { data: stats } = await supabase
        .from("pbp_quarter_team_stats")
        .select("period, team_abbr, pts")
        .eq("game_key", cosmic.game_key)
        .order("period", { ascending: true });

      if (!stats || stats.length === 0) return [];

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
    enabled: isLive && (league === "NBA" || league === "NCAAB"),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  // 3. Fallback: derive from game_state_snapshots (always runs for live games)
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

      const quarterMap: Record<number, { home_score: number; away_score: number }> = {};
      let prevHome = 0;
      let prevAway = 0;

      const qNums: { q: number; home: number; away: number }[] = [];
      for (const snap of snapshots) {
        const qMatch = snap.quarter?.match(/Q?(\d+)/i);
        if (!qMatch) continue;
        const qNum = parseInt(qMatch[1]);
        if (qNum < 1 || qNum > 20) continue; // allow OT periods (5+)
        qNums.push({ q: qNum, home: snap.home_score ?? 0, away: snap.away_score ?? 0 });
      }

      // Get last snapshot per quarter (cumulative total at end)
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
    enabled: isLive,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  // Choose the best available data source (prefer most specific)
  const quarters: QuarterScore[] =
    (gameQuarters && gameQuarters.length > 0) ? gameQuarters :
    (pbpQuarterScores && pbpQuarterScores.length > 0) ? pbpQuarterScores :
    (snapshotScores && snapshotScores.length > 0) ? snapshotScores :
    [];

  if (!quarters.length) return null;

  const formatPeriodLabel = (p: number) => {
    if (league === "NHL") return `P${p}`;
    if (league === "MLB") return `${p}`;
    if (league === "NCAAB") return p <= 2 ? `H${p}` : `OT${p - 2}`;
    // NBA/NFL: 1-4 = Q1-Q4, >4 = OT1+
    return p <= 4 ? `Q${p}` : `OT${p - 4}`;
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
      {quarters.map((q) => (
        <div key={q.quarter} className="flex flex-col items-center min-w-[28px]">
          <span className="text-[8px] text-muted-foreground uppercase">
            {formatPeriodLabel(q.quarter)}
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
