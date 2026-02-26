import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function GameMatchupTab({
  gameId,
  homeAbbr,
  awayAbbr,
  homeTeam,
  awayTeam,
}: {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  homeTeam: string;
  awayTeam: string;
}) {
  const { data: standings } = useQuery({
    queryKey: ["matchup-standings", homeAbbr, awayAbbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("nba_standings")
        .select("*")
        .in("team_abbr", [homeAbbr, awayAbbr])
        .order("season", { ascending: false })
        .limit(2);
      return data || [];
    },
  });

  const homeStanding = standings?.find(s => s.team_abbr === homeAbbr);
  const awayStanding = standings?.find(s => s.team_abbr === awayAbbr);

  const records = [
    { label: "Overall", home: homeStanding ? `${homeStanding.wins ?? 0}-${homeStanding.losses ?? 0}` : "—", away: awayStanding ? `${awayStanding.wins ?? 0}-${awayStanding.losses ?? 0}` : "—" },
    { label: "Home", home: homeStanding ? `${homeStanding.home_wins ?? 0}-${homeStanding.home_losses ?? 0}` : "—", away: awayStanding ? `${awayStanding.home_wins ?? 0}-${awayStanding.home_losses ?? 0}` : "—" },
    { label: "Away", home: homeStanding ? `${homeStanding.road_wins ?? 0}-${homeStanding.road_losses ?? 0}` : "—", away: awayStanding ? `${awayStanding.road_wins ?? 0}-${awayStanding.road_losses ?? 0}` : "—" },
    { label: "Streak", home: homeStanding?.streak || "—", away: awayStanding?.streak || "—" },
    { label: "Last 10", home: homeStanding?.last_10 || "—", away: awayStanding?.last_10 || "—" },
  ];

  // Fetch team_game_stats averages instead of team_season_stats
  const { data: homeGameStats } = useQuery({
    queryKey: ["matchup-game-stats", homeAbbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_game_stats")
        .select("points, off_rating, def_rating, pace, fg_pct, three_pct, opp_points")
        .eq("team_abbr", homeAbbr)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: awayGameStats } = useQuery({
    queryKey: ["matchup-game-stats", awayAbbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_game_stats")
        .select("points, off_rating, def_rating, pace, fg_pct, three_pct, opp_points")
        .eq("team_abbr", awayAbbr)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  // Compute averages from game logs
  const computeAvg = (stats: any[] | undefined) => {
    if (!stats?.length) return null;
    const avg = (key: string) => {
      const vals = stats.map(r => r[key]).filter((v: any) => v != null);
      return vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
    };
    return {
      games: stats.length,
      ppg: avg("points"),
      opp_ppg: avg("opp_points"),
      off_rating: avg("off_rating"),
      def_rating: avg("def_rating"),
      pace: avg("pace"),
      fg_pct: avg("fg_pct"),
      three_pct: avg("three_pct"),
    };
  };

  const homeAvg = computeAvg(homeGameStats);
  const awayAvg = computeAvg(awayGameStats);

  const statComparisons = (homeAvg || awayAvg) ? [
    { label: "PPG", home: homeAvg?.ppg?.toFixed(1) ?? null, away: awayAvg?.ppg?.toFixed(1) ?? null },
    { label: "Opp PPG", home: homeAvg?.opp_ppg?.toFixed(1) ?? null, away: awayAvg?.opp_ppg?.toFixed(1) ?? null, lower: true },
    { label: "Off Rtg", home: homeAvg?.off_rating?.toFixed(1) ?? null, away: awayAvg?.off_rating?.toFixed(1) ?? null },
    { label: "Def Rtg", home: homeAvg?.def_rating?.toFixed(1) ?? null, away: awayAvg?.def_rating?.toFixed(1) ?? null, lower: true },
    { label: "Pace", home: homeAvg?.pace?.toFixed(1) ?? null, away: awayAvg?.pace?.toFixed(1) ?? null },
    { label: "FG%", home: homeAvg?.fg_pct?.toFixed(1) ?? null, away: awayAvg?.fg_pct?.toFixed(1) ?? null },
    { label: "3P%", home: homeAvg?.three_pct?.toFixed(1) ?? null, away: awayAvg?.three_pct?.toFixed(1) ?? null },
  ].filter(s => s.home !== null || s.away !== null) : [];

  const gameCountLabel = homeAvg && awayAvg
    ? `${homeAvg.games}G vs ${awayAvg.games}G season avg`
    : homeAvg ? `${homeAvg.games}G season avg` : awayAvg ? `${awayAvg.games}G season avg` : "";

  return (
    <div className="space-y-4">
      {/* Team Records */}
      <div className="cosmic-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-bold text-foreground">{awayAbbr}</span>
          <span className="text-xs font-semibold text-muted-foreground">Team Records</span>
          <span className="text-xs font-bold text-foreground">{homeAbbr}</span>
        </div>
        {records.map(r => (
          <div key={r.label} className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 last:border-b-0">
            <span className="text-xs font-semibold text-foreground tabular-nums">{r.away}</span>
            <span className="text-[10px] text-muted-foreground">{r.label}</span>
            <span className="text-xs font-semibold text-foreground tabular-nums">{r.home}</span>
          </div>
        ))}
      </div>

      {/* Stat Comparison — from team_game_stats averages */}
      {statComparisons.length > 0 && (
        <div className="cosmic-card rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-xs font-bold text-foreground">{awayAbbr}</span>
            <span className="text-xs font-semibold text-muted-foreground">Team Rankings</span>
            <span className="text-xs font-bold text-foreground">{homeAbbr}</span>
          </div>
          {statComparisons.map(s => {
            const hVal = s.home != null ? parseFloat(s.home) : null;
            const aVal = s.away != null ? parseFloat(s.away) : null;
            const homeWins = hVal != null && aVal != null
              ? (s.lower ? hVal < aVal : hVal > aVal)
              : false;
            const awayWins = hVal != null && aVal != null && !homeWins && hVal !== aVal;

            return (
              <div key={s.label} className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 last:border-b-0">
                <span className={cn("text-xs tabular-nums font-semibold", awayWins && "text-cosmic-green")}>
                  {s.away ?? "—"}
                </span>
                <div className="flex-1 mx-3">
                  <div className="flex items-center gap-1">
                    <div className={cn("h-1 rounded-full flex-1", awayWins ? "bg-cosmic-green" : "bg-cosmic-red/30")} />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{s.label}</span>
                    <div className={cn("h-1 rounded-full flex-1", homeWins ? "bg-cosmic-green" : "bg-cosmic-red/30")} />
                  </div>
                </div>
                <span className={cn("text-xs tabular-nums font-semibold", homeWins && "text-cosmic-green")}>
                  {s.home ?? "—"}
                </span>
              </div>
            );
          })}
          {gameCountLabel && (
            <div className="px-4 py-2 text-center">
              <span className="text-[9px] text-muted-foreground">{gameCountLabel}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}