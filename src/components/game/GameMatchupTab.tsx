import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface TeamRecord {
  wins: number;
  losses: number;
  ties?: number | null;
  home_record?: string | null;
  away_record?: string | null;
}

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
        .from("standings")
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
    { label: "Overall", home: homeStanding ? `${homeStanding.wins}-${homeStanding.losses}${homeStanding.ties ? `-${homeStanding.ties}` : ""}` : "—", away: awayStanding ? `${awayStanding.wins}-${awayStanding.losses}${awayStanding.ties ? `-${awayStanding.ties}` : ""}` : "—" },
    { label: "Home", home: homeStanding?.home_record || "—", away: awayStanding?.home_record || "—" },
    { label: "Away", home: homeStanding?.away_record || "—", away: awayStanding?.away_record || "—" },
    { label: "Streak", home: homeStanding?.streak || "—", away: awayStanding?.streak || "—" },
    { label: "Last 10", home: homeStanding?.last_10 || "—", away: awayStanding?.last_10 || "—" },
  ];

  // Fetch team season stats for comparison
  const { data: teamStats } = useQuery({
    queryKey: ["matchup-team-stats", homeAbbr, awayAbbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_season_stats")
        .select("*")
        .in("team_abbr", [homeAbbr, awayAbbr])
        .order("season", { ascending: false })
        .limit(2);
      return data || [];
    },
  });

  const homeStat = teamStats?.find(s => s.team_abbr === homeAbbr);
  const awayStat = teamStats?.find(s => s.team_abbr === awayAbbr);

  const statComparisons = homeStat && awayStat ? [
    { label: "PPG", home: homeStat.points_per_game, away: awayStat.points_per_game },
    { label: "Opp PPG", home: homeStat.opp_points_per_game, away: awayStat.opp_points_per_game, lower: true },
    { label: "Off Rtg", home: homeStat.off_rating, away: awayStat.off_rating },
    { label: "Def Rtg", home: homeStat.def_rating, away: awayStat.def_rating, lower: true },
    { label: "Pace", home: homeStat.pace, away: awayStat.pace },
    { label: "FG%", home: homeStat.fg_pct ? (homeStat.fg_pct * 100).toFixed(1) : null, away: awayStat.fg_pct ? (awayStat.fg_pct * 100).toFixed(1) : null },
    { label: "3P%", home: homeStat.three_pct ? (homeStat.three_pct * 100).toFixed(1) : null, away: awayStat.three_pct ? (awayStat.three_pct * 100).toFixed(1) : null },
  ] : [];

  return (
    <div className="space-y-4">
      {/* Team Records */}
      <div className="cosmic-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-bold text-foreground">{homeAbbr}</span>
          <span className="text-xs font-semibold text-muted-foreground">Team Records</span>
          <span className="text-xs font-bold text-foreground">{awayAbbr}</span>
        </div>
        {records.map(r => (
          <div key={r.label} className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 last:border-b-0">
            <span className="text-xs font-semibold text-foreground tabular-nums">{r.home}</span>
            <span className="text-[10px] text-muted-foreground">{r.label}</span>
            <span className="text-xs font-semibold text-foreground tabular-nums">{r.away}</span>
          </div>
        ))}
      </div>

      {/* Stat Comparison */}
      {statComparisons.length > 0 && (
        <div className="cosmic-card rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-xs font-bold text-foreground">Team Rankings</h4>
          </div>
          {statComparisons.map(s => {
            const hVal = typeof s.home === "string" ? parseFloat(s.home) : s.home;
            const aVal = typeof s.away === "string" ? parseFloat(s.away) : s.away;
            const homeWins = s.lower
              ? (hVal ?? 999) < (aVal ?? 999)
              : (hVal ?? 0) > (aVal ?? 0);
            const awayWins = !homeWins && hVal !== aVal;

            return (
              <div key={s.label} className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 last:border-b-0">
                <span className={cn("text-xs tabular-nums font-semibold", homeWins && "text-cosmic-green")}>
                  {s.home ?? "—"}
                </span>
                <div className="flex-1 mx-3">
                  <div className="flex items-center gap-1">
                    <div className={cn("h-1 rounded-full flex-1", homeWins ? "bg-cosmic-green" : "bg-cosmic-red/30")} />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{s.label}</span>
                    <div className={cn("h-1 rounded-full flex-1", awayWins ? "bg-cosmic-green" : "bg-cosmic-red/30")} />
                  </div>
                </div>
                <span className={cn("text-xs tabular-nums font-semibold", awayWins && "text-cosmic-green")}>
                  {s.away ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
