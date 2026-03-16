import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Bug } from "lucide-react";
import type { NormalizedPbpEvent } from "@/lib/pbp-event-parser";

interface WatchDebugPanelProps {
  lastEvent: NormalizedPbpEvent | null;
  recentEvents: NormalizedPbpEvent[];
  eventCount: number;
  feedSource: string;
}

export function WatchDebugPanel({ lastEvent, recentEvents, eventCount, feedSource }: WatchDebugPanelProps) {
  const [expanded, setExpanded] = useState(false);

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

      {expanded && lastEvent && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/20">
          {/* Current event details */}
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

          {/* Raw description */}
          <div className="text-[9px] text-muted-foreground/60 mt-1">
            <span className="font-semibold">Raw: </span>
            <span className="italic">{lastEvent.rawDescription}</span>
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
