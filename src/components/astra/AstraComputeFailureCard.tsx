/**
 * Structured failure card shown when Astra compute is blocked.
 * Replaces fake/generic narrative answers with transparent failure diagnostics.
 */

import { AlertTriangle, XCircle, CheckCircle2, User, Gamepad2, Cpu, Variable, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ComputeFailureCard } from "@/lib/compute-gating";
import type { PipelineStage } from "@/lib/compute-gating";

function StageRow({ stage }: { stage: PipelineStage }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      {stage.status === "ok" ? (
        <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
      ) : stage.status === "failed" ? (
        <XCircle className="h-3 w-3 text-red-400 shrink-0" />
      ) : (
        <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
      )}
      <span className={cn(
        "font-medium",
        stage.status === "ok" ? "text-foreground/70" : stage.status === "failed" ? "text-red-400" : "text-amber-400"
      )}>
        {stage.step}
      </span>
      {stage.detail && <span className="text-muted-foreground/60 ml-auto text-[9px] truncate max-w-[150px]">{stage.detail}</span>}
    </div>
  );
}

interface Props {
  failure: ComputeFailureCard;
  compact?: boolean;
}

export default function AstraComputeFailureCardUI({ failure, compact }: Props) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-red-400" />
        <div>
          <p className="text-sm font-bold text-red-400">Compute Blocked</p>
          <p className="text-[10px] text-red-300/70">{failure.compute_blocked_reason}</p>
        </div>
      </div>

      {/* Resolution Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* Player */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-card/50 border border-border/30">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-[9px] text-muted-foreground uppercase font-bold">Player</p>
            {failure.resolved_player ? (
              <p className="text-[11px] text-foreground font-medium truncate">
                {failure.resolved_player.name} ({failure.resolved_player.team})
              </p>
            ) : (
              <p className="text-[11px] text-red-400 font-medium">Not resolved</p>
            )}
          </div>
        </div>

        {/* Game */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-card/50 border border-border/30">
          <Gamepad2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-[9px] text-muted-foreground uppercase font-bold">Game</p>
            {failure.resolved_game ? (
              <p className="text-[11px] text-foreground font-medium truncate">{failure.resolved_game.label}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">N/A</p>
            )}
          </div>
        </div>

        {/* Model */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-card/50 border border-border/30">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-[9px] text-muted-foreground uppercase font-bold">Active Model</p>
            {failure.active_model ? (
              <p className="text-[11px] text-foreground font-medium truncate">
                v{failure.active_model.version} ({failure.active_model.scope})
              </p>
            ) : (
              <p className="text-[11px] text-amber-400">None activated</p>
            )}
          </div>
        </div>
      </div>

      {/* Missing Variables */}
      {failure.missing_variables.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Variable className="h-3 w-3 text-amber-400" />
            <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">Missing Variables ({failure.missing_variables.length})</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {failure.missing_variables.map((v) => (
              <Badge key={v} variant="outline" className="text-[8px] text-amber-400 border-amber-500/20 bg-amber-500/5">{v}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Invalid Variables */}
      {failure.invalid_variables.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <XCircle className="h-3 w-3 text-red-400" />
            <p className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Invalid Variables ({failure.invalid_variables.length})</p>
          </div>
          <div className="space-y-0.5">
            {failure.invalid_variables.map((v) => (
              <p key={v.key} className="text-[9px] text-red-300">
                <span className="font-mono font-bold">{v.key}</span> = {v.value} — {v.reason}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Grain Mismatches */}
      {failure.grain_mismatches.length > 0 && (
        <div>
          <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wider mb-1">Grain Mismatches</p>
          {failure.grain_mismatches.map((m, i) => (
            <p key={i} className="text-[9px] text-amber-300">• {m}</p>
          ))}
        </div>
      )}

      {/* Pipeline Stages */}
      {!compact && failure.stages.length > 0 && (
        <div className="pt-2 border-t border-border/20 space-y-1">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Pipeline Stages</p>
          {failure.stages.map((s, i) => (
            <StageRow key={i} stage={s} />
          ))}
        </div>
      )}
    </div>
  );
}
