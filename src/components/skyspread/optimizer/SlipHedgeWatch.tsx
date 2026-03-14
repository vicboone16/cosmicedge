import { Shield, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { SlipScore } from "@/lib/slip-optimizer-engine";

interface Props {
  score: SlipScore;
  picks: any[];
}

export function SlipHedgeWatch({ score, picks }: Props) {
  const livePicks = picks.filter(p => p.live_value != null && !p.result);
  const completedPicks = picks.filter(p => p.result);
  const remainingLegs = picks.length - completedPicks.length;
  
  // Determine hedge watch triggers
  const triggers: { reason: string; legName: string; severity: "warning" | "alert" }[] = [];
  
  // Trigger: down to 1-2 remaining legs
  if (remainingLegs <= 2 && remainingLegs > 0 && completedPicks.length > 0) {
    triggers.push({
      reason: `Slip is down to ${remainingLegs} remaining leg${remainingLegs > 1 ? "s" : ""}`,
      legName: "Full slip",
      severity: "warning",
    });
  }

  // Trigger: at-risk legs
  const atRiskLegs = score.legs.filter(l => l.score < 45 || l.flags.includes("high_volatility") || l.flags.includes("thin_edge"));
  atRiskLegs.forEach(leg => {
    triggers.push({
      reason: leg.score < 45 ? "Low quality score — most likely to fail" : 
              leg.flags.includes("high_volatility") ? "High volatility — outcome less predictable" :
              "Thin edge — market is tight",
      legName: leg.player_name_raw,
      severity: leg.score < 35 ? "alert" : "warning",
    });
  });

  if (triggers.length === 0 && livePicks.length === 0) return null;

  const isActive = triggers.length > 0;

  return (
    <div className={cn("p-2.5 rounded-xl border space-y-1.5",
      isActive ? "bg-cosmic-gold/5 border-cosmic-gold/20" : "bg-secondary/20 border-border"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Shield className={cn("h-3.5 w-3.5", isActive ? "text-cosmic-gold" : "text-muted-foreground")} />
          <p className={cn("text-[10px] font-semibold", isActive ? "text-cosmic-gold" : "text-muted-foreground")}>
            Hedge Watch
          </p>
        </div>
        <Badge variant="outline" className={cn("text-[7px]",
          isActive ? "border-cosmic-gold/30 text-cosmic-gold" : "border-border text-muted-foreground"
        )}>
          {isActive ? "Active" : "Monitoring"}
        </Badge>
      </div>

      {triggers.map((t, i) => (
        <div key={i} className="flex items-start gap-1.5 text-[9px]">
          {t.severity === "alert" 
            ? <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-cosmic-red mt-0.5" />
            : <Info className="h-2.5 w-2.5 shrink-0 text-cosmic-gold mt-0.5" />
          }
          <span className="text-muted-foreground">
            <span className={cn("font-semibold", t.severity === "alert" ? "text-cosmic-red" : "text-cosmic-gold")}>
              {t.legName}
            </span>
            {" — "}{t.reason}
          </span>
        </div>
      ))}

      {!isActive && (
        <p className="text-[8px] text-muted-foreground italic">
          No hedge triggers detected. Monitoring live risk factors.
        </p>
      )}

      <p className="text-[7px] text-muted-foreground italic pt-0.5 border-t border-border/30">
        Advisory only — no hedge execution assumed.
      </p>
    </div>
  );
}
