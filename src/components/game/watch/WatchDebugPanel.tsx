import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Bug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { NormalizedPbpEvent } from "@/lib/pbp-event-parser";

interface WatchDebugPanelProps {
  lastEvent: NormalizedPbpEvent | null;
  recentEvents: NormalizedPbpEvent[];
  eventCount: number;
  feedSource: string;
  gameId: string;
}

export function WatchDebugPanel({ lastEvent, recentEvents, eventCount, feedSource, gameId }: WatchDebugPanelProps) {
  const [expanded, setExpanded] = useState(false);

  // Use live_game_visual_state directly — it has momentum, pace, droughts, possession
  const { data: liveState } = useQuery({
    queryKey: ["watch-live-visual-state", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("live_game_visual_state")
        .select("*")
        .eq("game_id", gameId)
        .maybeSingle();
      return data;
    },
    enabled: expanded,
    staleTime: 10_000,
    refetchInterval: expanded ? 10_000 : false,
  });

  return (
    <div className="rounded-lg border border-border/30 bg-card/40 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Bug className="w-3 h-3" />
          <span className="font-semibold uppercase tracking-wider">Debug Panel</span>
          <span className="text-muted-foreground/60">({eventCount} events · {feedSource})</span>
        </div>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/20">
          {/* Current event details */}
          {lastEvent && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] mt-2">
              <DebugRow label="Source ID" value={lastEvent.sourceEventId} />
              <DebugRow label="Event Type" value={lastEvent.eventType} />
              <DebugRow label="Subtype" value={lastEvent.eventSubtype || "—"} />
              <DebugRow label="Zone" value={lastEvent.zoneKey} />
              <DebugRow label="Animation" value={lastEvent.animationKey || "none"} />
              <DebugRow label="Confidence" value={`${(lastEvent.parserConfidence * 100).toFixed(0)}%`} />
              <DebugRow label="Points" value={String(lastEvent.pointsScored)} />
              <DebugRow label="Possession" value={lastEvent.possessionResult || "—"} />
            </div>
          )}

          {/* Raw description */}
          {lastEvent && (
            <div className="text-[9px] text-muted-foreground/60 mt-1">
              <span className="font-semibold">Raw: </span>
              <span className="italic">{lastEvent.rawDescription}</span>
            </div>
          )}

          {/* ── Live Visual State (from live_game_visual_state) ── */}
          {liveState && (
            <div className="border-t border-border/20 pt-2 space-y-2">
              <span className="text-[8px] font-bold uppercase tracking-wider text-primary/60">
                Live Visual State
              </span>

              {/* Possession */}
              <div className="text-[9px]">
                <span className="font-semibold text-muted-foreground/60">Possession: </span>
                <span className="text-foreground/80 font-mono">
                  {liveState.possession_team_id || "unknown"}
                  {liveState.possession_confidence != null && (
                    <span className="text-muted-foreground/40 ml-1">
                      ({(Number(liveState.possession_confidence) * 100).toFixed(0)}% conf)
                    </span>
                  )}
                </span>
              </div>

              {/* Scores & Clock */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
                <DebugRow label="Period" value={String(liveState.period_number ?? "—")} />
                <DebugRow label="Clock" value={liveState.clock_display || "—"} />
                <DebugRow label="Home Score" value={String(liveState.home_score ?? "—")} />
                <DebugRow label="Away Score" value={String(liveState.away_score ?? "—")} />
              </div>

              {/* Momentum */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
                <DebugRow label="Momentum Team" value={liveState.momentum_team_id || "—"} />
                <DebugRow label="Momentum Score" value={String(liveState.momentum_score ?? "—")} />
                <DebugRow label="Run Home" value={String(liveState.recent_run_home ?? 0)} />
                <DebugRow label="Run Away" value={String(liveState.recent_run_away ?? 0)} />
              </div>

              {/* Droughts & Pace */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
                <DebugRow label="Drought Home" value={`${liveState.recent_scoring_drought_home_sec ?? 0}s`} />
                <DebugRow label="Drought Away" value={`${liveState.recent_scoring_drought_away_sec ?? 0}s`} />
                <DebugRow label="Pace Est" value={String(liveState.pace_estimate ?? "—")} />
                <DebugRow label="FG Drought H" value={`${liveState.fg_drought_home_sec ?? 0}s`} />
                <DebugRow label="FG Drought A" value={`${liveState.fg_drought_away_sec ?? 0}s`} />
              </div>

              {/* Bonus & Fouls */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
                <DebugRow label="Bonus Home" value={liveState.in_bonus_home ? "YES" : "no"} />
                <DebugRow label="Bonus Away" value={liveState.in_bonus_away ? "YES" : "no"} />
                <DebugRow label="Fouls Home" value={String(liveState.home_fouls_period ?? 0)} />
                <DebugRow label="Fouls Away" value={String(liveState.away_fouls_period ?? 0)} />
              </div>

              {/* Pressure */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
                <DebugRow label="OREB Press" value={liveState.oreb_pressure_team_id || "—"} />
                <DebugRow label="2nd Chance" value={liveState.second_chance_pressure_team_id || "—"} />
                <DebugRow label="Empty Poss H" value={String(liveState.empty_possessions_home ?? 0)} />
                <DebugRow label="Empty Poss A" value={String(liveState.empty_possessions_away ?? 0)} />
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
                <DebugRow label="Provider" value={liveState.source_provider || "—"} />
                <DebugRow label="Parser Ver" value={liveState.parser_version || "—"} />
                <DebugRow label="Latency" value={`${liveState.sync_latency_ms ?? "—"}ms`} />
                <DebugRow label="Status" value={liveState.status || "—"} />
              </div>
            </div>
          )}

          {!liveState && expanded && (
            <div className="border-t border-border/20 pt-2">
              <span className="text-[9px] text-muted-foreground/40 italic">
                No live visual state found for this game
              </span>
            </div>
          )}

          {/* Recent events mini-log */}
          {recentEvents.length > 1 && (
            <div className="mt-2 space-y-0.5">
              <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/50">
                Recent ({Math.min(recentEvents.length, 5)})
              </span>
              {recentEvents.slice(-5).reverse().map((ev, i) => (
                <div key={i} className="text-[8px] text-muted-foreground/50 flex items-center gap-2">
                  <span className="tabular-nums w-8">{ev.clockDisplay}</span>
                  <span className={cn(
                    "px-1 rounded",
                    ev.isScoringPlay ? "text-cosmic-green" : ""
                  )}>
                    {ev.eventType}
                  </span>
                  <span className="truncate flex-1">{ev.rawDescription?.slice(0, 40)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground/50 font-semibold">{label}:</span>
      <span className="text-foreground/70 font-mono truncate">{value}</span>
    </div>
  );
}
