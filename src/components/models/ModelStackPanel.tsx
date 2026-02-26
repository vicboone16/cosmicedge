import { useState } from "react";
import { cn } from "@/lib/utils";
import type { NebulaOverlay } from "@/hooks/use-nebula-overlay";

interface Props {
  overlay: NebulaOverlay;
}

type ActivePanel = "nebula" | "pace" | "transit" | null;

const TIER_COLORS: Record<string, string> = {
  S: "text-cosmic-green border-cosmic-green",
  A: "text-primary border-primary",
  B: "text-yellow-500 border-yellow-500",
  C: "text-muted-foreground border-muted-foreground",
  "No Bet": "text-cosmic-red border-cosmic-red",
};

const TIER_LABELS: Record<string, string> = {
  S: "Celestial Lock",
  A: "Star Signal",
  B: "Playable",
  C: "Lean",
  "No Bet": "No Bet",
};

function formatPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function ModelStackPanel({ overlay }: Props) {
  const [activePanel, setActivePanel] = useState<ActivePanel>("nebula");

  const tier = overlay.confidence_tier || "C";
  const tierColor = TIER_COLORS[tier] || TIER_COLORS["C"];
  const tierLabel = TIER_LABELS[tier] || tier;
  const edgeV2 = overlay.edge_score_v20;

  const chips: { key: ActivePanel; label: string; sublabel: string }[] = [
    { key: "nebula", label: "Distribution", sublabel: "NebulaProp" },
    { key: "pace", label: "Game Script", sublabel: "PacePulse" },
    { key: "transit", label: "Cosmic Overlay", sublabel: "TransitLift" },
  ];

  return (
    <div className="space-y-2">
      {/* Chip row */}
      <div className="flex gap-1">
        {chips.map(c => (
          <button
            key={c.key}
            onClick={() => setActivePanel(activePanel === c.key ? null : c.key)}
            className={cn(
              "flex-1 px-2 py-1.5 rounded-lg text-center transition-all",
              activePanel === c.key
                ? "bg-primary/15 border border-primary/30 text-primary"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="text-[9px] font-bold uppercase tracking-wider">{c.sublabel}</div>
            <div className="text-[10px] font-medium">{c.label}</div>
          </button>
        ))}
      </div>

      {/* Expanded panel */}
      {activePanel === "nebula" && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-2 p-2 rounded-lg bg-secondary/50 border border-border/50">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">μ (Mean)</div>
              <div className="text-sm font-bold tabular-nums">{Number(overlay.mu).toFixed(1)}</div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">σ (Vol)</div>
              <div className="text-sm font-bold tabular-nums">{Number(overlay.sigma).toFixed(1)}</div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">P(Over)</div>
              <div className="text-sm font-bold tabular-nums">{formatPct(overlay.p_model)}</div>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground italic">
            Modeled hit rate is driven by usage + matchup distribution.
          </p>
        </div>
      )}

      {activePanel === "pace" && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-2 p-2 rounded-lg bg-secondary/50 border border-border/50">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">μ Adj</div>
              <div className="text-sm font-bold tabular-nums">
                {overlay.pace_mu_adjust != null ? (overlay.pace_mu_adjust >= 0 ? "+" : "") + Number(overlay.pace_mu_adjust).toFixed(2) : "—"}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">Blowout</div>
              <div className="text-sm font-bold tabular-nums">
                {overlay.edge_raw != null ? "—" : "—"}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">σ Adj</div>
              <div className="text-sm font-bold tabular-nums">
                {overlay.pace_sigma_adjust != null ? (overlay.pace_sigma_adjust >= 0 ? "+" : "") + Number(overlay.pace_sigma_adjust).toFixed(2) : "—"}
              </div>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground italic">
            Game script risk based on blowout + tempo context.
          </p>
        </div>
      )}

      {activePanel === "transit" && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-2 p-2 rounded-lg bg-secondary/50 border border-border/50">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">Boost</div>
              <div className="text-sm font-bold tabular-nums">
                {overlay.transit_boost_factor != null
                  ? (overlay.transit_boost_factor >= 0 ? "+" : "") + (overlay.transit_boost_factor * 100).toFixed(1) + "%"
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">Vol Shift</div>
              <div className="text-sm font-bold tabular-nums">
                {overlay.volatility_shift != null
                  ? (overlay.volatility_shift >= 0 ? "+" : "") + (overlay.volatility_shift * 100).toFixed(1) + "%"
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">Conf +/-</div>
              <div className="text-sm font-bold tabular-nums">
                {overlay.confidence_adjustment != null
                  ? (overlay.confidence_adjustment >= 0 ? "+" : "") + (overlay.confidence_adjustment * 100).toFixed(1) + "%"
                  : "—"}
              </div>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground italic">
            Cosmic overlay: small tilt applied (never overrides the math).
          </p>
        </div>
      )}

      {/* EdgeScore v2.0 Confidence Ring */}
      {edgeV2 != null && (
        <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 border border-border/50">
          {/* Ring */}
          <div className={cn("relative flex items-center justify-center w-14 h-14 rounded-full border-2", tierColor)}>
            <div className="text-center">
              <div className="text-sm font-black tabular-nums leading-none">{edgeV2.toFixed(1)}</div>
              <div className="text-[8px] font-bold uppercase">{tier}</div>
            </div>
            {/* SVG ring fill */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
              <circle
                cx="28" cy="28" r="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${Math.max(0, Math.min(edgeV2 / 10, 1)) * 150.8} 150.8`}
                className={cn("opacity-30", tierColor.split(" ")[0])}
              />
            </svg>
          </div>

          {/* Stats */}
          <div className="flex-1 space-y-1">
            <div className="text-[9px] font-bold uppercase text-muted-foreground">{tierLabel}</div>
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <div>
                <span className="text-muted-foreground">Model: </span>
                <span className="font-semibold tabular-nums">{formatPct(overlay.p_model)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Book: </span>
                <span className="font-semibold tabular-nums">{formatPct(overlay.p_implied)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Edge: </span>
                <span className={cn(
                  "font-semibold tabular-nums",
                  (overlay.edge_raw ?? 0) > 0 ? "text-cosmic-green" : "text-cosmic-red"
                )}>
                  {overlay.edge_raw != null ? (overlay.edge_raw >= 0 ? "+" : "") + (overlay.edge_raw * 100).toFixed(1) + "%" : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
