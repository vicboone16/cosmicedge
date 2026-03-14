import { Activity, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface LiveLeg {
  id: string;
  player_name_raw: string;
  stat_type: string;
  line: number;
  direction: string;
  live_value?: number | null;
  progress?: number | null;
  result?: string | null;
  match_status?: string;
}

function getLegTrackingState(leg: LiveLeg) {
  if (leg.result === "win") return { label: "Hit ✓", color: "text-cosmic-green", bg: "bg-cosmic-green" };
  if (leg.result === "loss") return { label: "Miss", color: "text-cosmic-red", bg: "bg-cosmic-red" };
  if (leg.live_value == null) return { label: "Pregame", color: "text-muted-foreground", bg: "bg-muted-foreground" };
  
  const pct = leg.line > 0 ? (Number(leg.live_value) / Number(leg.line)) * 100 : 0;
  if (pct >= 100) return { label: "Hit ✓", color: "text-cosmic-green", bg: "bg-cosmic-green" };
  if (pct >= 70) return { label: "On Track", color: "text-cosmic-green", bg: "bg-cosmic-green" };
  if (pct >= 45) return { label: "Pacing", color: "text-cosmic-gold", bg: "bg-cosmic-gold" };
  return { label: "Behind", color: "text-cosmic-red", bg: "bg-cosmic-red" };
}

export function SlipLiveTracker({ picks }: { picks: LiveLeg[] }) {
  const hasLive = picks.some(p => p.live_value != null || p.result);
  if (!hasLive && picks.every(p => !p.result)) {
    return (
      <div className="p-3 rounded-xl bg-secondary/20 border border-border text-center">
        <Activity className="h-5 w-5 text-muted-foreground/40 mx-auto mb-1" />
        <p className="text-[10px] text-muted-foreground">Live tracking will appear once games begin</p>
      </div>
    );
  }

  const hitCount = picks.filter(p => p.result === "win" || (p.live_value != null && p.line > 0 && Number(p.live_value) >= p.line)).length;
  const totalLegs = picks.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Activity className="h-3 w-3" /> Live Tracker
        </p>
        <Badge variant="outline" className="text-[8px]">{hitCount}/{totalLegs} hitting</Badge>
      </div>

      <div className="space-y-1.5">
        {picks.map(leg => {
          const state = getLegTrackingState(leg);
          const pct = leg.line > 0 && leg.live_value != null
            ? Math.min((Number(leg.live_value) / Number(leg.line)) * 100, 120)
            : 0;

          return (
            <div key={leg.id} className="p-2 rounded-lg bg-secondary/20 border border-border/50">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-semibold text-foreground truncate">{leg.player_name_raw}</span>
                  <span className="text-[8px] text-muted-foreground capitalize">{leg.stat_type}</span>
                </div>
                <span className={cn("text-[9px] font-bold", state.color)}>{state.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-secondary/50 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700", state.bg)}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="flex items-baseline gap-0.5 shrink-0">
                  <span className="text-[10px] font-bold tabular-nums text-foreground">
                    {leg.live_value != null ? Number(leg.live_value) : "–"}
                  </span>
                  <span className="text-[8px] text-muted-foreground">/ {leg.line}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
