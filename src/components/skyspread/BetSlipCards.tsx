import { useState } from "react";
import { Trash2, ChevronDown, ChevronUp, Zap, AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useBetSlips } from "@/hooks/use-bet-slips";
import { Badge } from "@/components/ui/badge";

const MATCH_BADGES: Record<string, { label: string; className: string }> = {
  exact_match: { label: "Matched", className: "bg-cosmic-green/15 text-cosmic-green" },
  fuzzy_match: { label: "Fuzzy Match", className: "bg-cosmic-gold/15 text-cosmic-gold" },
  synthetic_created: { label: "Imported Prop", className: "bg-cosmic-cyan/15 text-cosmic-cyan" },
  manual_confirmed: { label: "Confirmed", className: "bg-cosmic-green/15 text-cosmic-green" },
  unresolved: { label: "Unresolved", className: "bg-cosmic-red/15 text-cosmic-red" },
};

const RESULT_COLORS: Record<string, string> = {
  win: "text-cosmic-green",
  loss: "text-cosmic-red",
  push: "text-cosmic-gold",
};

function PickRow({ pick }: { pick: any }) {
  const progress = pick.line > 0 && pick.live_value != null
    ? Math.min((Number(pick.live_value) / Number(pick.line)) * 100, 150)
    : 0;
  const hasLive = pick.live_value != null;
  const matchBadge = MATCH_BADGES[pick.match_status] || MATCH_BADGES.unresolved;

  return (
    <div className="py-2 border-b border-border/30 last:border-b-0">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{pick.player_name_raw}</p>
          <p className="text-[10px] text-muted-foreground capitalize">
            {pick.stat_type} · {pick.direction} {Number(pick.line)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-semibold", matchBadge.className)}>
            {matchBadge.label}
          </span>
          {pick.result && (
            <span className={cn("text-[10px] font-bold uppercase", RESULT_COLORS[pick.result] || "text-muted-foreground")}>
              {pick.result}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar for live tracking */}
      {hasLive && (
        <div className="mt-1.5 space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold tabular-nums text-foreground">{Number(pick.live_value)}</span>
            <span className="text-[10px] text-muted-foreground">/ {Number(pick.line)}</span>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden relative">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progress >= 100 ? "bg-cosmic-green" : progress >= 70 ? "bg-cosmic-gold" : "bg-primary"
              )}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
            <div className="absolute top-0 h-full w-0.5 bg-foreground/50" style={{ left: "100%" }} />
          </div>
        </div>
      )}
    </div>
  );
}

function SlipCard({ slip, picks }: { slip: any; picks: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const { deleteSlip } = useBetSlips();

  const pickCount = picks?.length || 0;
  const hitCount = picks?.filter((p: any) => p.result === "win").length || 0;
  const lossCount = picks?.filter((p: any) => p.result === "loss").length || 0;

  const statusIcon = slip.status === "settled"
    ? slip.result === "win" ? CheckCircle : slip.result === "loss" ? XCircle : Clock
    : Clock;
  const StatusIcon = statusIcon;

  return (
    <div className="cosmic-card rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon className={cn(
            "h-4 w-4 shrink-0",
            slip.status === "settled" && slip.result === "win" ? "text-cosmic-green" :
            slip.status === "settled" && slip.result === "loss" ? "text-cosmic-red" :
            "text-muted-foreground"
          )} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground capitalize">{slip.book}</span>
              <span className="text-[10px] text-muted-foreground capitalize">· {slip.entry_type}</span>
              <span className="text-[10px] text-muted-foreground">· {pickCount} picks</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {format(new Date(slip.created_at), "MMM d, h:mm a")}
              {slip.stake > 0 && ` · $${Number(slip.stake).toFixed(2)}`}
              {slip.payout > 0 && ` → $${Number(slip.payout).toFixed(2)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hitCount > 0 && <span className="text-[10px] text-cosmic-green font-semibold">{hitCount}W</span>}
          {lossCount > 0 && <span className="text-[10px] text-cosmic-red font-semibold">{lossCount}L</span>}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded picks */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/30">
          <div className="pt-2">
            {picks?.map((pick: any) => (
              <PickRow key={pick.id} pick={pick} />
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[9px] capitalize">{slip.source}</Badge>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); deleteSlip.mutate(slip.id); }}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BetSlipCards() {
  const { slips, picksMap, isLoading } = useBetSlips();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!slips?.length) {
    return (
      <div className="text-center py-12">
        <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No imported slips yet</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          Import a bet slip from PrizePicks or another book
        </p>
      </div>
    );
  }

  const activeSlips = slips.filter(s => s.status === "active");
  const settledSlips = slips.filter(s => s.status === "settled");

  return (
    <div className="space-y-4">
      {activeSlips.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
            <Zap className="h-3 w-3" /> Active ({activeSlips.length})
          </p>
          {activeSlips.map(slip => (
            <SlipCard key={slip.id} slip={slip} picks={picksMap?.[slip.id] || []} />
          ))}
        </div>
      )}

      {settledSlips.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Settled ({settledSlips.length})
          </p>
          {settledSlips.map(slip => (
            <SlipCard key={slip.id} slip={slip} picks={picksMap?.[slip.id] || []} />
          ))}
        </div>
      )}
    </div>
  );
}
