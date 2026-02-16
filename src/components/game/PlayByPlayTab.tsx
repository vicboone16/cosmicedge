import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PlayByPlayTabProps {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  league: string;
}

export function PlayByPlayTab({ gameId, homeAbbr, awayAbbr, league }: PlayByPlayTabProps) {
  const [periodFilter, setPeriodFilter] = useState<number | null>(null);

  // For NBA, use nba_play_by_play_events; for others, use play_by_play
  const isNBA = league === "NBA";

  const { data: nbaEvents, isLoading: nbaLoading } = useQuery({
    queryKey: ["nba-pbp", gameId],
    queryFn: async () => {
      // Try matching by game_id as string (the external id format)
      const { data } = await supabase
        .from("nba_play_by_play_events")
        .select("*")
        .eq("game_id", gameId)
        .order("play_id", { ascending: true })
        .limit(1000);
      
      if (data && data.length > 0) return data;

      // Also try matching via games.external_id
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

  // Get unique periods
  const periods = [...new Set(
    isNBA
      ? (events as any[]).map(e => e.period).filter(Boolean)
      : (events as any[]).map(e => e.quarter).filter(Boolean)
  )].sort((a, b) => a - b);

  // Filter events
  const filtered = periodFilter != null
    ? (events as any[]).filter(e => (isNBA ? e.period : e.quarter) === periodFilter)
    : (events as any[]);

  const periodLabel = league === "NHL" ? "Period" : league === "NFL" ? "Quarter" : "Q";

  return (
    <div className="space-y-3">
      {/* Period filter pills */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setPeriodFilter(null)}
          className={cn(
            "text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap",
            periodFilter === null
              ? "bg-secondary border-border text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
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
                ? "bg-secondary border-border text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {p > 4 ? `OT${p - 4}` : `${periodLabel}${p}`}
          </button>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">{filtered.length} events</p>

      {/* Events list */}
      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {filtered.map((ev: any, i: number) => {
          const isHome = isNBA
            ? ev.team === homeAbbr
            : ev.team_abbr === homeAbbr;
          const isAway = isNBA
            ? ev.team === awayAbbr
            : ev.team_abbr === awayAbbr;
          const eventType = isNBA ? ev.event_type : ev.event_type;
          const clock = isNBA ? ev.remaining_time : ev.clock;
          const desc = isNBA ? ev.description : ev.description;
          const period = isNBA ? ev.period : ev.quarter;
          const awayScore = isNBA ? ev.away_score : ev.away_score;
          const homeScore = isNBA ? ev.home_score : ev.home_score;

          const isScoring = isNBA
            ? (ev.points && ev.points > 0)
            : eventType?.toLowerCase().includes("shot") || eventType?.toLowerCase().includes("score");

          return (
            <div
              key={isNBA ? `${ev.game_id}-${ev.play_id}` : ev.id ?? i}
              className={cn(
                "flex items-start gap-2 py-1.5 px-2 rounded-lg text-[10px] transition-colors",
                isScoring && "bg-primary/5",
                isHome && "border-l-2 border-l-primary/40",
                isAway && "border-l-2 border-l-muted-foreground/40",
                !isHome && !isAway && "border-l-2 border-l-transparent"
              )}
            >
              {/* Clock */}
              <span className="text-muted-foreground tabular-nums w-10 shrink-0 text-right">
                {clock || "—"}
              </span>

              {/* Team badge */}
              <span className="w-8 shrink-0">
                {(isHome || isAway) && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[7px] px-1 py-0",
                      isHome ? "border-primary/40 text-primary" : "border-muted-foreground/40 text-muted-foreground"
                    )}
                  >
                    {isNBA ? ev.team : ev.team_abbr}
                  </Badge>
                )}
              </span>

              {/* Description */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "leading-relaxed",
                  isScoring ? "font-semibold text-foreground" : "text-muted-foreground"
                )}>
                  {desc || eventType || "—"}
                </p>
                {isNBA && ev.player && (
                  <span className="text-[9px] text-primary/70">{ev.player}</span>
                )}
              </div>

              {/* Score */}
              {(awayScore != null || homeScore != null) && (
                <span className="text-[9px] tabular-nums text-muted-foreground shrink-0">
                  {awayScore ?? "?"}-{homeScore ?? "?"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
