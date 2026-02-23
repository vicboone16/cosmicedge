import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NebulaOverlay } from "@/hooks/use-nebula-overlay";

interface Props {
  overlay: NebulaOverlay;
  isAdmin: boolean;
}

export function ModelDetailsDrawer({ overlay, isAdmin }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] text-primary hover:underline"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {open ? "Hide details" : "Model details"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Driver chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {overlay.hit_l10 != null && (
              <span className="px-1.5 py-0.5 rounded bg-secondary text-[10px] font-medium tabular-nums">
                L10 Hit: {(Number(overlay.hit_l10) * 100).toFixed(0)}%
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded bg-secondary text-[10px] font-medium tabular-nums">
              μ={Number(overlay.mu).toFixed(1)}
            </span>
            {overlay.line != null && (
              <span className="px-1.5 py-0.5 rounded bg-secondary text-[10px] font-medium tabular-nums">
                Line: {Number(overlay.line).toFixed(1)}
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded bg-secondary text-[10px] font-medium tabular-nums">
              σ={Number(overlay.sigma).toFixed(2)}
            </span>
          </div>

          {/* Admin-only transparency */}
          {isAdmin && (
            <div className="cosmic-card rounded-lg p-3 space-y-1 border border-primary/20">
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Model Transparency (Admin)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                <span className="text-muted-foreground">edge_score</span>
                <span className="font-medium tabular-nums">{Number(overlay.edge_score).toFixed(2)}</span>
                <span className="text-muted-foreground">confidence</span>
                <span className="font-medium tabular-nums">{Number(overlay.confidence).toFixed(4)}</span>
                <span className="text-muted-foreground">risk</span>
                <span className="font-medium tabular-nums">{Number(overlay.risk).toFixed(4)}</span>
                <span className="text-muted-foreground">mu</span>
                <span className="font-medium tabular-nums">{Number(overlay.mu).toFixed(3)}</span>
                <span className="text-muted-foreground">sigma</span>
                <span className="font-medium tabular-nums">{Number(overlay.sigma).toFixed(4)}</span>
                <span className="text-muted-foreground">hit_l10</span>
                <span className="font-medium tabular-nums">{overlay.hit_l10 != null ? Number(overlay.hit_l10).toFixed(3) : "—"}</span>
                <span className="text-muted-foreground">hit_l20</span>
                <span className="font-medium tabular-nums">{overlay.hit_l20 != null ? Number(overlay.hit_l20).toFixed(3) : "—"}</span>
                <span className="text-muted-foreground">streak</span>
                <span className="font-medium tabular-nums">{overlay.streak ?? "—"}</span>
                <span className="text-muted-foreground">book</span>
                <span className="font-medium">{overlay.book}</span>
                <span className="text-muted-foreground">pred_ts</span>
                <span className="font-medium">{new Date(overlay.pred_ts).toLocaleString()}</span>
                <span className="text-muted-foreground">odds</span>
                <span className="font-medium tabular-nums">{overlay.odds ?? "—"}</span>
              </div>
              {overlay.astro && Object.keys(overlay.astro).length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-bold text-muted-foreground mb-1">Astro JSON</p>
                  <pre className="text-[9px] bg-secondary rounded p-2 overflow-x-auto max-h-32">
                    {JSON.stringify(overlay.astro, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
