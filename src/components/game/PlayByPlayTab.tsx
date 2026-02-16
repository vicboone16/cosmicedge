import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface PlayByPlayTabProps {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  league: string;
}

export function PlayByPlayTab({ gameId, homeAbbr, awayAbbr, league }: PlayByPlayTabProps) {
  const [periodFilter, setPeriodFilter] = useState<number | null>(null);

  const isNBA = league === "NBA";

  const { data: nbaEvents, isLoading: nbaLoading } = useQuery({
    queryKey: ["nba-pbp", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nba_play_by_play_events")
        .select("*")
        .eq("game_id", gameId)
        .order("play_id", { ascending: true })
        .limit(1000);

      if (data && data.length > 0) return data;

      const { data: gameData } = await supabase
        .from("games")
        .select("external_id")
        .eq("id", gameId)
        .maybeSingle();

      if (gameData?.external_id) {
        const { data: eventsById } = await supabase
          .from("nba_play_by_play_events")
          .select("*")
          .eq("game_id", gameData.external_id)
          .order("play_id", { ascending: true })
          .limit(1000);
        return eventsById || [];
      }
      return [];
    },
    enabled: isNBA,
  });

  const { data: genericEvents, isLoading: genericLoading } = useQuery({
    queryKey: ["generic-pbp", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("play_by_play")
        .select("*")
        .eq("game_id", gameId)
        .order("sequence", { ascending: true })
        .limit(1000);
      return data || [];
    },
    enabled: !isNBA,
  });

  const isLoading = isNBA ? nbaLoading : genericLoading;
  const events = isNBA ? nbaEvents : genericEvents;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-8">Loading play-by-play…</p>;
  }

  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">No play-by-play data available for this game.</p>
      </div>
    );
  }

  const periods = [...new Set(
    isNBA
      ? (events as any[]).map(e => e.period).filter(Boolean)
      : (events as any[]).map(e => e.quarter).filter(Boolean)
  )].sort((a, b) => a - b);

  const filtered = periodFilter != null
    ? (events as any[]).filter(e => (isNBA ? e.period : e.quarter) === periodFilter)
    : (events as any[]);

  const periodLabel = (p: number) => {
    if (league === "NHL") return p <= 3 ? `Period ${p}` : "OT";
    if (league === "NFL") return `Q${p}`;
    return p <= 4 ? `Q${p}` : `OT${p - 4}`;
  };

  // Group events by period for section headers
  const groupedByPeriod: { period: number; events: any[] }[] = [];
  let currentPeriod: number | null = null;
  for (const ev of filtered) {
    const p = isNBA ? ev.period : ev.quarter;
    if (p !== currentPeriod) {
      currentPeriod = p;
      groupedByPeriod.push({ period: p, events: [] });
    }
    groupedByPeriod[groupedByPeriod.length - 1].events.push(ev);
  }

  return (
    <div className="space-y-3">
      {/* Period filter pills */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setPeriodFilter(null)}
          className={cn(
            "text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap",
            periodFilter === null
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          All
        </button>
        {periods.map(p => (
          <button
            key={p}
            onClick={() => setPeriodFilter(p)}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap",
              periodFilter === p
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {periodLabel(p)}
          </button>
        ))}
      </div>

      {/* Events grouped by period */}
      <div className="max-h-[65vh] overflow-y-auto space-y-0">
        {groupedByPeriod.map(({ period, events: periodEvents }) => (
          <div key={period}>
            {/* Period header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 bg-primary/10 border-y border-border/50">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                {league === "NHL" ? (period <= 3 ? `${period}${period === 1 ? "st" : period === 2 ? "nd" : "rd"} Period` : "Overtime")
                  : league === "MLB" ? `Inning ${period}`
                  : period <= 4 ? `${period === 1 ? "1st" : period === 2 ? "2nd" : period === 3 ? "3rd" : "4th"} Quarter` : `Overtime ${period - 4}`}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-bold text-muted-foreground">{awayAbbr}</span>
                <span className="text-[9px] font-bold text-muted-foreground">{homeAbbr}</span>
              </div>
            </div>

            {/* Events */}
            {periodEvents.map((ev: any, i: number) => {
              const isHome = isNBA ? ev.team === homeAbbr : ev.team_abbr === homeAbbr;
              const isAway = isNBA ? ev.team === awayAbbr : ev.team_abbr === awayAbbr;
              const clock = isNBA ? ev.remaining_time : ev.clock;
              const desc = isNBA ? ev.description : ev.description;
              const awayScore = isNBA ? ev.away_score : ev.away_score;
              const homeScore = isNBA ? ev.home_score : ev.home_score;
              const isScoring = isNBA
                ? (ev.points && ev.points > 0)
                : ev.event_type?.toLowerCase().includes("shot") || ev.event_type?.toLowerCase().includes("score");

              const teamAbbr = isNBA ? ev.team : ev.team_abbr;

              return (
                <div
                  key={isNBA ? `${ev.game_id}-${ev.play_id}` : ev.id ?? i}
                  className={cn(
                    "flex items-start gap-2 px-3 py-2.5 border-b border-border/20 transition-colors",
                    isScoring && "bg-primary/5"
                  )}
                >
                  {/* Team indicator */}
                  <div className="w-8 shrink-0 flex items-center justify-center pt-0.5">
                    {(isHome || isAway) && (
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded",
                        isHome ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {teamAbbr}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-xs leading-relaxed",
                      isScoring ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}>
                      <span className="tabular-nums text-muted-foreground mr-1.5">{clock || ""}</span>
                      {desc || ev.event_type || "—"}
                    </p>
                    {isNBA && ev.player && !desc?.includes(ev.player) && (
                      <span className="text-[9px] text-primary/70">{ev.player}</span>
                    )}
                  </div>

                  {/* Running score - only show on scoring plays */}
                  {isScoring && awayScore != null && homeScore != null && (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("text-xs tabular-nums font-bold", isAway ? "text-foreground" : "text-muted-foreground")}>
                        {awayScore}
                      </span>
                      <span className={cn("text-xs tabular-nums font-bold", isHome ? "text-foreground" : "text-muted-foreground")}>
                        {homeScore}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
