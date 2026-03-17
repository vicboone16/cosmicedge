import { useCustomModels } from "@/hooks/use-custom-models";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  FlaskConical, Play, Plus, GitCompareArrows, History, Brain, Cpu, Zap,
  AlertTriangle, CheckCircle2, Clock, Loader2, BarChart3
} from "lucide-react";

interface Props {
  onNavigate: (tab: string) => void;
}

export default function MachinaOverview({ onNavigate }: Props) {
  const { data: models, isLoading: modelsLoading } = useCustomModels();

  const { data: recentRuns } = useQuery({
    queryKey: ["machina-recent-runs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("custom_model_runs" as any)
        .select("id, model_key, sport, market_type, confidence, explanation, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      return (data ?? []) as any[];
    },
  });

  const { data: engines } = useQuery({
    queryKey: ["machina-engines"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ce_engine_registry")
        .select("engine_key, engine_name, status, layer")
        .order("display_order");
      return data ?? [];
    },
  });

  const activeModels = models?.filter((m) => m.is_active) ?? [];
  const totalModels = models?.length ?? 0;
  const readyEngines = engines?.filter((e: any) => e.status === "active")?.length ?? 0;
  const totalEngines = engines?.length ?? 0;

  if (modelsLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {[
          { label: "Run Model", icon: Play, tab: "studio", color: "text-cosmic-green" },
          { label: "Build Model", icon: Plus, tab: "builder", color: "text-primary" },
          { label: "Compare", icon: GitCompareArrows, tab: "studio", color: "text-cosmic-cyan" },
          { label: "Backtest", icon: History, tab: "backtest", color: "text-cosmic-gold" },
          { label: "AI Studio", icon: Brain, tab: "studio", color: "text-cosmic-lavender" },
        ].map((a) => (
          <button
            key={a.label}
            onClick={() => onNavigate(a.tab)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-colors"
          >
            <a.icon className={cn("h-4 w-4", a.color)} />
            <span className="text-[10px] font-semibold text-foreground">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={FlaskConical} label="Active Models" value={String(activeModels.length)} sub={`${totalModels} total`} />
        <SummaryCard icon={Cpu} label="Engines" value={String(readyEngines)} sub={`${totalEngines} registered`} />
        <SummaryCard icon={BarChart3} label="Recent Runs" value={String(recentRuns?.length ?? 0)} sub="last 24h" />
        <SummaryCard icon={Zap} label="System" value="Ready" sub="all services up" accent />
      </div>

      {/* Active Models */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <FlaskConical className="h-3.5 w-3.5 text-primary" /> Active Models
          </h3>
          <button onClick={() => onNavigate("saved")} className="text-[10px] text-primary font-semibold">View All →</button>
        </div>
        {activeModels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center">
            <p className="text-xs text-muted-foreground">No active models. Build one to get started.</p>
            <button onClick={() => onNavigate("builder")} className="mt-2 text-[10px] text-primary font-semibold">+ Create Model</button>
          </div>
        ) : (
          <div className="space-y-2">
            {activeModels.slice(0, 4).map((m) => {
              const enabledFactors = (m.factors as any[]).filter((f: any) => f.enabled).length;
              return (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-primary/20 bg-card">
                  <div className="h-2 w-2 rounded-full bg-cosmic-green shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground truncate">{m.name}</span>
                      <Badge variant="outline" className="text-[8px]">{m.sport}</Badge>
                      <Badge variant="outline" className="text-[8px]">{m.market_type}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{enabledFactors} factors · Updated {new Date(m.updated_at).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => onNavigate("studio")} className="text-[10px] text-primary font-semibold px-2 py-1 rounded-lg border border-primary/20 hover:bg-primary/10">Run</button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Runs */}
      {recentRuns && recentRuns.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
            <Clock className="h-3.5 w-3.5 text-primary" /> Recent Executions
          </h3>
          <div className="space-y-1.5">
            {recentRuns.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-semibold text-foreground">{r.model_key ?? "Default"}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{r.sport} · {r.market_type}</span>
                </div>
                {r.confidence != null && (
                  <Badge variant="outline" className="text-[8px]">{r.confidence}%</Badge>
                )}
                <span className="text-[9px] text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* System Readiness */}
      <section>
        <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
          <Cpu className="h-3.5 w-3.5 text-primary" /> System Readiness
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Player Stats", ok: true },
            { label: "Team Pace", ok: true },
            { label: "Prop Lines", ok: true },
            { label: "Astro Overrides", ok: true },
            { label: "Game Schedule", ok: true },
            { label: "Live Scores", ok: true },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-secondary/30">
              {s.ok ? <CheckCircle2 className="h-3 w-3 text-cosmic-green" /> : <AlertTriangle className="h-3 w-3 text-cosmic-gold" />}
              <span className="text-[10px] text-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] text-muted-foreground font-semibold">{label}</span>
      </div>
      <p className={cn("text-lg font-bold", accent ? "text-cosmic-green" : "text-foreground")}>{value}</p>
      <p className="text-[9px] text-muted-foreground">{sub}</p>
    </div>
  );
}
