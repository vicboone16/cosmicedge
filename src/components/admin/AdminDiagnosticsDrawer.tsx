/**
 * Super-admin diagnostics drawer.
 * Shows runtime state, model activation, variable grain, readiness flags,
 * roster hydration, lineup readiness, prop generation status, and publish safety.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAllActivations, type ModelActivationState } from "@/hooks/use-model-activation";
import { useLiveReadiness, type LiveReadinessFlags } from "@/hooks/use-live-readiness";
import { useRosterHydration, type RosterHydrationStatus } from "@/hooks/use-roster-hydration";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Bug, ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertTriangle,
  Cpu, Database, Radio, Shield, Loader2, Users, Activity, Layers,
  GitBranch, Server
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", ok ? "bg-green-400" : "bg-red-400")} />;
}

function DiagSection({ title, icon: Icon, children, defaultOpen = false }: {
  title: string; icon: typeof Bug; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/30 transition-colors">
        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-[11px] font-bold text-foreground flex-1">{title}</span>
        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function KV({ k, v, status }: { k: string; v: string | null | undefined; status?: "ok" | "warn" | "fail" }) {
  return (
    <div className="flex items-start gap-2 text-[10px]">
      {status && <StatusDot ok={status === "ok"} />}
      <span className="text-muted-foreground font-semibold shrink-0">{k}:</span>
      <span className="text-foreground/80 font-mono break-all">{v ?? "—"}</span>
    </div>
  );
}

const READINESS_LABELS: [keyof Omit<LiveReadinessFlags, "failure_stage" | "failure_detail" | "checked_at" | "source">, string][] = [
  ["game_status_synced", "Game Status Synced"],
  ["provider_game_mapped", "Provider Mapped"],
  ["roster_ready", "Roster Ready"],
  ["lineups_ready", "Lineups Ready"],
  ["live_boxscore_ready", "Live Boxscore"],
  ["player_live_stats_ready", "Player Live Stats"],
  ["odds_ready", "Odds Ready"],
  ["market_definitions_ready", "Market Defs"],
  ["active_model_ready", "Active Model"],
  ["scorecard_ready", "Scorecard Ready"],
  ["live_prop_rows_generated", "Props Generated"],
];

interface Props {
  context?: "astra" | "game" | "machina" | "live_props";
  gameId?: string;
  playerId?: string;
}

export default function AdminDiagnosticsDrawer({ context = "machina", gameId, playerId }: Props) {
  const { data: activations, isLoading: actLoading } = useAllActivations();
  const { data: readiness } = useLiveReadiness(gameId);
  const { data: rosterStatus } = useRosterHydration(gameId);

  // Fetch recent audit log
  const { data: auditLog } = useQuery({
    queryKey: ["activation-audit-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("model_activation_audit_log" as any)
        .select("*")
        .order("triggered_at", { ascending: false })
        .limit(10);
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  // Fetch prop generation stats for game
  const { data: propStats } = useQuery({
    queryKey: ["diag-prop-stats", gameId],
    queryFn: async () => {
      if (!gameId) return null;
      const { count } = await supabase
        .from("nba_player_props_live" as any)
        .select("id", { count: "exact" })
        .eq("game_id", gameId)
        .limit(0);
      const { count: nebulaCount } = await supabase
        .from("nebula_prop_predictions" as any)
        .select("id", { count: "exact" })
        .eq("game_id", gameId)
        .limit(0);
      return { rawProps: count ?? 0, nebulaProps: nebulaCount ?? 0 };
    },
    enabled: !!gameId,
    staleTime: 15_000,
  });

  // Publish safety: schema parity check
  const { data: parityIssues } = useQuery({
    queryKey: ["schema-parity-check"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("check_schema_parity" as any);
      if (error) return [];
      return (data ?? []) as { object_type: string; object_name: string; issue: string }[];
    },
    staleTime: 120_000,
  });

  const globalActivation = activations?.find(
    (a: ModelActivationState) => a.scope_type === "global" && a.scope_key === "default"
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors">
          <Bug className="h-3 w-3" />
          Diagnostics
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Bug className="h-4 w-4 text-amber-400" />
            Super-Admin Diagnostics
            <Badge variant="outline" className="text-[8px] bg-amber-500/10 text-amber-400 border-amber-500/20">
              {context}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {/* Model Activation State */}
          <DiagSection title="Model Activation" icon={Cpu} defaultOpen>
            {actLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : globalActivation ? (
              <div className="space-y-1.5">
                <KV k="Active Model ID" v={globalActivation.active_model_id} status="ok" />
                <KV k="Version" v={globalActivation.active_model_version} />
                <KV k="Scope" v={`${globalActivation.scope_type}/${globalActivation.scope_key}`} />
                <KV k="Runtime Status" v={globalActivation.runtime_status} status={globalActivation.runtime_status === "confirmed" ? "ok" : "fail"} />
                <KV k="Activated At" v={globalActivation.activated_at ? new Date(globalActivation.activated_at).toLocaleString() : null} />
                <KV k="Runtime Confirmed" v={globalActivation.runtime_confirmed_at ? new Date(globalActivation.runtime_confirmed_at).toLocaleString() : "NOT CONFIRMED"} status={globalActivation.runtime_confirmed_at ? "ok" : "fail"} />
                <KV k="Cache Token" v={globalActivation.cache_bust_token ? globalActivation.cache_bust_token.slice(0, 12) + "…" : null} />
                {globalActivation.runtime_status !== "confirmed" && (
                  <div className="mt-1 p-1.5 rounded bg-red-500/10 border border-red-500/20">
                    <p className="text-[9px] font-bold text-red-400">⚠ Model NOT runtime-confirmed. UI should NOT show "Active".</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[10px] text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                No model activation state found
              </div>
            )}
          </DiagSection>

          {/* Live Prop Readiness (game context) */}
          {gameId && (
            <DiagSection title="Live Prop Readiness" icon={Radio}>
              {readiness ? (
                <div className="space-y-1">
                  {/* Source indicator */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <Server className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[9px] text-muted-foreground">
                      Source: <span className={cn("font-bold", readiness.source === "server" ? "text-green-400" : "text-amber-400")}>
                        {readiness.source === "server" ? "Server (precomputed)" : "Client fallback"}
                      </span>
                    </span>
                    {readiness.checked_at && (
                      <span className="text-[8px] text-muted-foreground/50 ml-auto">
                        {new Date(readiness.checked_at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  {READINESS_LABELS.map(([key, label]) => {
                    const ok = !!(readiness as any)[key];
                    return (
                      <div key={key} className="flex items-center gap-2 text-[10px]">
                        {ok ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                        <span className={cn("font-medium", ok ? "text-foreground/80" : "text-red-400")}>{label}</span>
                      </div>
                    );
                  })}
                  {readiness.failure_stage && (
                    <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
                      <p className="text-[9px] font-bold text-red-400">First Failed Stage: {readiness.failure_stage}</p>
                      {readiness.failure_detail && (
                        <p className="text-[9px] text-red-300 mt-0.5">{readiness.failure_detail}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No readiness data for this game</p>
              )}
            </DiagSection>
          )}

          {/* Roster & Lineup Hydration */}
          {gameId && (
            <DiagSection title="Roster & Lineup Hydration" icon={Users}>
              {rosterStatus ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[8px] px-1 py-0",
                      rosterStatus.confidence === "high" ? "text-green-400 border-green-400/20" :
                      rosterStatus.confidence === "medium" ? "text-amber-400 border-amber-400/20" :
                      "text-red-400 border-red-400/20"
                    )}>
                      {rosterStatus.confidence} confidence
                    </Badge>
                  </div>
                  <KV k={`${rosterStatus.homeTeam} players`} v={String(rosterStatus.homePlayersCount)} status={rosterStatus.homePlayersCount >= 5 ? "ok" : "fail"} />
                  <KV k={`${rosterStatus.awayTeam} players`} v={String(rosterStatus.awayPlayersCount)} status={rosterStatus.awayPlayersCount >= 5 ? "ok" : "fail"} />
                  {rosterStatus.stalePlayerCount > 0 && (
                    <KV k="Stale/wrong-team" v={String(rosterStatus.stalePlayerCount)} status="fail" />
                  )}
                  <KV k="Detail" v={rosterStatus.detail} />

                  {/* Lineup section */}
                  <div className="mt-2 pt-2 border-t border-border/20">
                    <div className="flex items-center gap-2 text-[10px]">
                      {rosterStatus.lineupsReady
                        ? <CheckCircle2 className="h-3 w-3 text-green-400" />
                        : <XCircle className="h-3 w-3 text-red-400" />}
                      <span className={cn("font-medium", rosterStatus.lineupsReady ? "text-foreground/80" : "text-red-400")}>
                        Lineups Ready
                      </span>
                    </div>
                    <KV k="Depth Chart Entries" v={String(rosterStatus.lineupCount)} status={rosterStatus.lineupsReady ? "ok" : "fail"} />
                    <KV k="Lineup Detail" v={rosterStatus.lineupDetail} />
                  </div>

                  {rosterStatus.confidence !== "high" && (
                    <div className="mt-1 p-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                      <p className="text-[9px] font-bold text-amber-400">⚠ Roster confidence is {rosterStatus.confidence}. Lineup/roster displays may be inaccurate.</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No roster data</p>
              )}
            </DiagSection>
          )}

          {/* Prop Generation Stats */}
          {gameId && propStats && (
            <DiagSection title="Prop Generation" icon={Activity}>
              <div className="space-y-1">
                <KV k="Raw live props" v={String(propStats.rawProps)} status={propStats.rawProps > 0 ? "ok" : "fail"} />
                <KV k="Nebula predictions" v={String(propStats.nebulaProps)} status={propStats.nebulaProps > 0 ? "ok" : "warn"} />
                {propStats.rawProps === 0 && (
                  <p className="text-[9px] text-red-400 mt-1">No live props found — check readiness pipeline above for failed stage</p>
                )}
              </div>
            </DiagSection>
          )}

          {/* Context IDs */}
          <DiagSection title="Context IDs" icon={Database}>
            <div className="space-y-1">
              {gameId && <KV k="game_id" v={gameId} />}
              {playerId && <KV k="player_id" v={playerId} />}
              <KV k="Context" v={context} />
            </div>
          </DiagSection>

          {/* Activation Audit Log */}
          <DiagSection title="Activation Audit Log" icon={Shield}>
            {auditLog?.length ? (
              <div className="space-y-2">
                {auditLog.slice(0, 5).map((log: any) => (
                  <div key={log.id} className="text-[9px] border-b border-border/20 pb-1.5 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("text-[8px] px-1 py-0", log.result_status === "confirmed" ? "text-green-400 border-green-400/20" : "text-red-400 border-red-400/20")}>
                        {log.result_status}
                      </Badge>
                      <span className="text-muted-foreground">{log.action}</span>
                      <span className="text-muted-foreground/50 ml-auto">{new Date(log.triggered_at).toLocaleString()}</span>
                    </div>
                    <KV k="Model" v={log.new_model_id?.slice(0, 8)} />
                    {log.result_message && <p className="text-muted-foreground/60 italic">{log.result_message}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">No audit entries</p>
            )}
          </DiagSection>

          {/* Publish Safety / Schema Parity */}
          <DiagSection title="Publish Safety" icon={GitBranch}>
            {parityIssues && parityIssues.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[9px] font-bold text-amber-400">{parityIssues.length} potential issues found</p>
                {parityIssues.slice(0, 10).map((issue: any, i: number) => (
                  <div key={i} className="text-[9px] p-1.5 rounded bg-card/50 border border-border/30 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[7px] px-1 py-0 text-amber-400 border-amber-400/20">{issue.object_type}</Badge>
                      <span className="font-mono text-foreground/80">{issue.object_name}</span>
                    </div>
                    <p className="text-muted-foreground/60">{issue.issue}</p>
                  </div>
                ))}
                {parityIssues.length > 10 && (
                  <p className="text-[8px] text-muted-foreground">+{parityIssues.length - 10} more…</p>
                )}
              </div>
            ) : parityIssues ? (
              <div className="flex items-center gap-2 text-[10px] text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                No schema parity issues detected
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">Checking…</p>
            )}
          </DiagSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}
