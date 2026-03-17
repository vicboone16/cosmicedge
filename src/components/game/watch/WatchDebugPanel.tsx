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

  // DB-derived momentum from views
  const { data: dbMomentum } = useQuery({
    queryKey: ["watch-db-momentum", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v_nba_pbp_momentum" as any)
        .select("*")
        .eq("game_key", gameId);
      return (data as any[]) || [];
    },
    enabled: expanded,
    staleTime: 15_000,
  });

  const { data: dbPace } = useQuery({
    queryKey: ["watch-db-pace", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v_nba_pbp_pace_proxy" as any)
        .select("*")
        .eq("game_key", gameId)
        .maybeSingle();
      return data as any;
    },
    enabled: expanded,
    staleTime: 15_000,
  });

  const { data: dbPossession } = useQuery({
    queryKey: ["watch-db-possession", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v_nba_pbp_latest_possession" as any)
        .select("*")
        .eq("game_key", gameId)
        .maybeSingle();
      return data as any;
    },
    enabled: expanded,
    staleTime: 10_000,
  });

  const { data: dbDroughts } = useQuery({
    queryKey: ["watch-db-droughts", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v_nba_pbp_scoring_droughts" as any)
        .select("*")
        .eq("game_key", gameId);
      return (data as any[]) || [];
    },
    enabled: expanded,
    staleTime: 15_000,
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

          {/* ── DB-Derived Metrics ── */}
          <div className="border-t border-border/20 pt-2 space-y-2">
            <span className="text-[8px] font-bold uppercase tracking-wider text-primary/60">
              DB-Derived Views
            </span>

            {/* Possession */}
            {dbPossession && (
              <div className="text-[9px]">
                <span className="font-semibold text-muted-foreground/60">Possession: </span>
                <span className="text-foreground/80 font-mono">
                  {dbPossession.possession_team} · Q{dbPossession.period} {dbPossession.clock}
                </span>
                {dbPossession.possession_context && (
                  <span className="text-muted-foreground/40 ml-1 italic">
                    ({dbPossession.possession_context?.slice(0, 50)})
                  </span>
                )}
              </div>
            )}

            {/* Pace */}
            {dbPace && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
                <DebugRow label="Total Plays" value={String(dbPace.total_plays)} />
                <DebugRow label="Est Possessions" value={String(dbPace.est_possessions)} />
                <DebugRow label="Shot Plays" value={String(dbPace.shot_plays)} />
                <DebugRow label="Turnovers" value={String(dbPace.turnover_plays)} />
                <DebugRow label="Latest Period" value={String(dbPace.latest_period)} />
              </div>
            )}

            {/* Momentum per team */}
            {dbMomentum && dbMomentum.length > 0 && (
              <div className="space-y-1">
                <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/50">
                  Team Momentum
                </span>
                {dbMomentum.map((m: any) => (
                  <div key={m.team_abbr} className="flex items-center gap-2 text-[9px]">
                    <span className="font-mono font-bold w-8">{m.team_abbr}</span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[8px] font-bold",
                      m.momentum_state === "explosive" && "bg-primary/20 text-primary",
                      m.momentum_state === "surge" && "bg-cosmic-gold/20 text-cosmic-gold",
                      m.momentum_state === "heating_up" && "bg-accent/20 text-accent-foreground",
                      m.momentum_state === "cold" && "bg-destructive/20 text-destructive",
                      m.momentum_state === "neutral" && "bg-muted text-muted-foreground",
                    )}>
                      {m.momentum_state}
                    </span>
                    <span className="text-muted-foreground/60">
                      run:{m.recent_run_points} · drought:{m.drought_seconds}s
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Droughts */}
            {dbDroughts && dbDroughts.length > 0 && (
              <div className="space-y-0.5">
                <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/50">
                  Scoring Droughts
                </span>
                {dbDroughts.map((d: any) => (
                  <div key={d.team_abbr} className="text-[9px] text-muted-foreground/60">
                    <span className="font-mono font-bold">{d.team_abbr}</span>
                    {" "}{d.drought_seconds}s since last score
                  </div>
                ))}
              </div>
            )}
          </div>

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
