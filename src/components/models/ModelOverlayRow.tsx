import { cn } from "@/lib/utils";
import type { NebulaOverlay, SelectedModel } from "@/hooks/use-nebula-overlay";

interface Props {
  overlay: NebulaOverlay;
  selectedModel: SelectedModel;
}

function EdgeScorePill({ score }: { score: number }) {
  const color = score >= 70 ? "text-cosmic-green bg-cosmic-green/10" :
    score >= 40 ? "text-yellow-500 bg-yellow-500/10" : "text-cosmic-red bg-cosmic-red/10";
  return (
    <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums", color)}>
      {score.toFixed(0)}
    </span>
  );
}

function ConfidenceChip({ confidence }: { confidence: number }) {
  return (
    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground tabular-nums">
      {(confidence * 100).toFixed(0)}% conf
    </span>
  );
}

function RiskChip({ risk }: { risk: number }) {
  const label = risk <= 0.3 ? "Low" : risk <= 0.6 ? "Med" : "High";
  const color = risk <= 0.3 ? "text-cosmic-green" : risk <= 0.6 ? "text-yellow-500" : "text-cosmic-red";
  return (
    <span className={cn("text-[10px] font-semibold", color)}>
      {label} risk
    </span>
  );
}

function MicrobarsMiniChart({ bars }: { bars: any[] }) {
  if (!bars || bars.length === 0) return null;
  const max = Math.max(...bars.map(b => typeof b === "number" ? b : b?.value || 0), 1);
  return (
    <div className="flex items-end gap-px h-3">
      {bars.slice(0, 10).map((b, i) => {
        const val = typeof b === "number" ? b : b?.value || 0;
        const hit = typeof b === "object" ? b?.hit : val > 0;
        const h = Math.max((val / max) * 100, 10);
        return (
          <div
            key={i}
            className={cn("w-1 rounded-t-sm", hit ? "bg-cosmic-green" : "bg-cosmic-red/50")}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

function StreakBadge({ streak }: { streak: number | null }) {
  if (streak == null || streak === 0) return null;
  return (
    <span className={cn(
      "text-[10px] font-bold",
      streak > 0 ? "text-cosmic-green" : "text-cosmic-red"
    )}>
      {streak > 0 ? `🔥${streak}` : `❄️${Math.abs(streak)}`}
    </span>
  );
}

export function ModelOverlayRow({ overlay, selectedModel }: Props) {
  const showTransitLift = selectedModel === "nebula_v1_transitlift";
  const hasAstro = overlay.astro && Object.keys(overlay.astro).length > 0;

  return (
    <div className="space-y-1.5 pt-1.5 border-t border-border/50">
      <div className="flex items-center gap-1.5 flex-wrap">
        <EdgeScorePill score={Number(overlay.edge_score)} />
        <ConfidenceChip confidence={Number(overlay.confidence)} />
        <RiskChip risk={Number(overlay.risk)} />
        <MicrobarsMiniChart bars={overlay.microbars || []} />
        <StreakBadge streak={overlay.streak} />
        {showTransitLift && (
          hasAstro ? (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-cosmic-indigo/10 text-cosmic-indigo">
              ✦ TransitLift
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground opacity-50">
              TransitLift requires natal + venue time
            </span>
          )
        )}
      </div>
      {overlay.one_liner && (
        <p className="text-[10px] text-muted-foreground italic">{overlay.one_liner}</p>
      )}
    </div>
  );
}
