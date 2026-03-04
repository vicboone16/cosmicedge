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

  // ── Live score from game_state_snapshots (authoritative) ──
  const { data: liveSnapshot } = useQuery({
    queryKey: ["pbp-live-score", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("game_state_snapshots")
        .select("home_score, away_score, quarter, clock")
        .eq("game_id", gameId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 10_000,
  });

  // ── Game key lookup for pbp_events ──
  const gameKeyQuery = useQuery({
    queryKey: ["game-key-lookup", gameId],
    queryFn: async () => {
      const { data: game } = await supabase
        .from("games")
        .select("start_time, home_abbr, away_abbr")
        .eq("id", gameId)
        .maybeSingle();
      if (!game) return null;
      const dateStr = game.start_time?.split(/[T ]/)[0];
      const { data: cosmic } = await supabase
        .from("cosmic_games")
        .select("game_key")
        .eq("game_date", dateStr)
        .eq("home_team_abbr", game.home_abbr)
        .eq("away_team_abbr", game.away_abbr)
        .maybeSingle();
      return cosmic?.game_key || null;
    },
    enabled: isNBA,
  });

  // ── Live pbp_events (cosmic pipeline) ──
  const { data: livePbpEvents, isLoading: livePbpLoading } = useQuery({
    queryKey: ["live-pbp-events", gameKeyQuery.data],
    queryFn: async () => {
      const { data } = await supabase
        .from("pbp_events")
        .select("*")
        .eq("game_key", gameKeyQuery.data!)
        .order("period", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1000);
      return data || [];
    },
    enabled: isNBA && !!gameKeyQuery.data,
    refetchInterval: 15000,
  });

  // ── BDL provider pbp events ──
  const { data: bdlPbpEvents, isLoading: bdlPbpLoading } = useQuery({
    queryKey: ["bdl-pbp-events", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nba_pbp_events")
        .select("*")
        .eq("game_key", gameId)
        .eq("provider", "balldontlie")
        .order("period", { ascending: true })
        .order("event_ts_game", { ascending: true })
        .limit(1000);
      return (data || []) as any[];
    },
    enabled: isNBA,
    refetchInterval: 15000,
  });

  // ── Historical nba_play_by_play_events ──
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
        .select("external_id, home_abbr, away_abbr, start_time")
        .eq("id", gameId)
        .maybeSingle();
      if (!gameData) return [];

      if (gameData.external_id) {
        const extId = gameData.external_id;
        const extIds = [...new Set([extId, "00" + extId, "002" + extId])];
        for (const eid of extIds) {
          const { data: eventsById } = await supabase
            .from("nba_play_by_play_events")
            .select("*")
            .eq("game_id", eid)
            .order("play_id", { ascending: true })
            .limit(1000);
          if (eventsById && eventsById.length > 0) return eventsById;
        }
      }

      if (gameData.start_time && gameData.home_abbr && gameData.away_abbr) {
        const gameDate = gameData.start_time.split(/[T ]/)[0];
        const d = new Date(gameData.start_time);
        const prevDay = new Date(d.getTime() - 86400000).toISOString().split("T")[0];
        const nextDay = new Date(d.getTime() + 86400000).toISOString().split("T")[0];
        for (const dateCandidate of [gameDate, prevDay, nextDay]) {
          const { data: eventsByTeam } = await supabase
            .from("nba_play_by_play_events")
            .select("*")
            .eq("home_team", gameData.home_abbr)
            .eq("away_team", gameData.away_abbr)
            .eq("date", dateCandidate)
            .order("play_id", { ascending: true })
            .limit(1000);
          if (eventsByTeam && eventsByTeam.length > 0) return eventsByTeam;
        }
      }
      return [];
    },
    enabled: isNBA,
  });

  // ── Generic PBP (non-NBA) ──
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

  const isLoading = isNBA ? (nbaLoading && livePbpLoading && bdlPbpLoading) : genericLoading;

  // ── Normalize events (NO score extraction from events) ──
  const normalizedBdlEvents = (bdlPbpEvents || []).map((ev: any) => ({
    ...ev,
    play_id: ev.provider_event_id,
    team: ev.team_abbr,
    remaining_time: ev.event_ts_game,
    player: ev.player_name,
  }));

  const normalizedLivePbp = (livePbpEvents || []).map((ev: any) => ({
    ...ev,
    play_id: ev.provider_event_id,
    team: ev.team_abbr,
    remaining_time: ev.clock,
    player: ev.player_name,
  }));

  const events = isNBA
    ? (normalizedBdlEvents.length > 0 ? normalizedBdlEvents
      : normalizedLivePbp.length > 0 ? normalizedLivePbp
      : nbaEvents)
    : genericEvents;

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

  // Group events by period
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
      {/* Live score banner from game_state_snapshots */}
      {liveSnapshot && (liveSnapshot.home_score != null || liveSnapshot.away_score != null) && (
        <div className="flex items-center justify-center gap-4 py-2 px-3 rounded-lg bg-primary/10 border border-primary/20">
          <span className="text-xs font-bold text-muted-foreground">{awayAbbr}</span>
          <span className="text-base font-bold tabular-nums text-foreground">{liveSnapshot.away_score ?? "—"}</span>
          <span className="text-xs text-muted-foreground">—</span>
          <span className="text-base font-bold tabular-nums text-foreground">{liveSnapshot.home_score ?? "—"}</span>
          <span className="text-xs font-bold text-muted-foreground">{homeAbbr}</span>
          {liveSnapshot.quarter && (
            <span className="text-[10px] text-primary ml-2">{liveSnapshot.quarter} {liveSnapshot.clock || ""}</span>
          )}
        </div>
      )}

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
            <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 bg-primary/10 border-y border-border/50">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                {league === "NHL" ? (period <= 3 ? `${period}${period === 1 ? "st" : period === 2 ? "nd" : "rd"} Period` : "Overtime")
                  : league === "MLB" ? `Inning ${period}`
                  : period <= 4 ? `${period === 1 ? "1st" : period === 2 ? "2nd" : period === 3 ? "3rd" : "4th"} Quarter` : `Overtime ${period - 4}`}
              </span>
              <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
                <span>{awayAbbr}</span>
                <span>{homeAbbr}</span>
              </div>
            </div>

            {periodEvents.map((ev: any, i: number) => {
              const isHome = isNBA ? ev.team === homeAbbr : ev.team_abbr === homeAbbr;
              const isAway = isNBA ? ev.team === awayAbbr : ev.team_abbr === awayAbbr;
              const clock = isNBA ? ev.remaining_time : ev.clock;
              const desc = ev.description;
              const teamAbbr = isNBA ? ev.team : ev.team_abbr;

              // Show per-event scores if present (0 is a valid score)
              const evAway = ev.away_score != null ? ev.away_score : null;
              const evHome = ev.home_score != null ? ev.home_score : null;
              const hasEventScore = evAway != null || evHome != null;

              return (
                <div
                  key={isNBA ? `${ev.game_id}-${ev.play_id}` : ev.id ?? i}
                  className="flex items-start gap-2 px-3 py-2.5 border-b border-border/20 transition-colors"
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
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="tabular-nums text-muted-foreground mr-1.5">{clock || ""}</span>
                      {desc || ev.event_type || "—"}
                    </p>
                    {isNBA && ev.player && !desc?.includes(ev.player) && (
                      <span className="text-[9px] text-primary/70">{ev.player}</span>
                    )}
                  </div>

                  {/* Per-event running score — show "—" if missing */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] tabular-nums font-medium text-muted-foreground w-5 text-right">
                      {evAway != null ? evAway : ""}
                    </span>
                    <span className="text-[10px] tabular-nums font-medium text-muted-foreground w-5 text-right">
                      {evHome != null ? evHome : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
