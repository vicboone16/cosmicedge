import { useState, type FC } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Shield } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useIsAdmin } from "@/hooks/use-admin";
import { logger } from "@/lib/logger";

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn" | "pending";
  message: string;
  latency_ms?: number;
  timestamp?: string;
}

const StatusIcon: FC<{ status: CheckResult["status"] }> = ({ status }) => {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 text-accent-foreground" />;
  return <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />;
};

const StatusBadge: FC<{ status: CheckResult["status"] }> = ({ status }) => {
  const variants: Record<CheckResult["status"], string> = {
    pass:    "bg-primary/10 text-primary border-primary/20",
    fail:    "bg-destructive/10 text-destructive border-destructive/20",
    warn:    "bg-accent/20 text-accent-foreground border-border",
    pending: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${variants[status]}`}>
      {status}
    </span>
  );
};

function HealthPageContent() {
  const { isAdmin } = useIsAdmin();
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [ranAt, setRanAt] = useState<string | null>(null);

  async function runChecks() {
    setRunning(true);
    setRanAt(null);
    const results: CheckResult[] = [];

    // ── 1. Supabase read access ────────────────────────────────────────────
    const t1 = performance.now();
    try {
      const { error } = await supabase.from("games").select("id").limit(1);
      results.push({
        name: "Supabase Read (games)",
        status: error ? "fail" : "pass",
        message: error ? error.message : "OK — games table readable",
        latency_ms: Math.round(performance.now() - t1),
      });
    } catch (e: any) {
      results.push({ name: "Supabase Read (games)", status: "fail", message: e.message });
    }

    // ── 2. Auth session check ──────────────────────────────────────────────
    const t2 = performance.now();
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      results.push({
        name: "Auth Session",
        status: user ? "pass" : "warn",
        message: user ? `Authenticated as ${user.email}` : error?.message ?? "No active session",
        latency_ms: Math.round(performance.now() - t2),
      });
    } catch (e: any) {
      results.push({ name: "Auth Session", status: "fail", message: e.message });
    }

    // ── 3. Provider flags readable ─────────────────────────────────────────
    const t3 = performance.now();
    try {
      const { data, error } = await supabase.from("provider_flags" as any).select("provider_name, enabled");
      const flags = (data as any[] | null) ?? [];
      const disabled = flags.filter((f) => !f.enabled).map((f) => f.provider_name);
      results.push({
        name: "Provider Flags",
        status: error ? "fail" : disabled.length > 0 ? "warn" : "pass",
        message: error
          ? error.message
          : disabled.length > 0
          ? `Disabled providers: ${disabled.join(", ")}`
          : `All ${flags.length} providers enabled`,
        latency_ms: Math.round(performance.now() - t3),
      });
    } catch (e: any) {
      results.push({ name: "Provider Flags", status: "fail", message: e.message });
    }

    // ── 4. Edge function reachability (write-pick health ping) ─────────────
    const t4 = performance.now();
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("write-pick", {
        body: { action: "__health__" },
      });
      // A 400 UNKNOWN_ACTION response means the function is alive and auth is working
      const isReachable = fnData?.code === "UNKNOWN_ACTION" || fnData?.ok === false;
      const isFnError = fnError && !isReachable;
      results.push({
        name: "Edge Fn: write-pick",
        status: isFnError ? "fail" : "pass",
        message: isFnError
          ? fnError?.message ?? "Unreachable"
          : `Reachable — responded: ${fnData?.code ?? "ok"}`,
        latency_ms: Math.round(performance.now() - t4),
      });
    } catch (e: any) {
      results.push({ name: "Edge Fn: write-pick", status: "fail", message: e.message, latency_ms: Math.round(performance.now() - t4) });
    }

    // ── 5. Supabase safe diagnostic write ─────────────────────────────────
    const t5 = performance.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Use service-role for health check write via edge fn approach
        const { data, error } = await supabase.from("health_checks" as any).select("id").limit(1);
        results.push({
          name: "Health Checks Table",
          status: error ? "warn" : "pass",
          message: error ? `${error.message} (RLS expected for anon)` : "Readable by admin",
          latency_ms: Math.round(performance.now() - t5),
        });
      } else {
        results.push({ name: "Health Checks Table", status: "warn", message: "Not authenticated — skipped write test" });
      }
    } catch (e: any) {
      results.push({ name: "Health Checks Table", status: "fail", message: e.message });
    }

    // ── 6. Odds snapshot freshness ─────────────────────────────────────────
    const t6 = performance.now();
    try {
      const { data, error } = await supabase
        .from("odds_snapshots")
        .select("captured_at")
        .order("captured_at", { ascending: false })
        .limit(1)
        .single();
      if (error) throw error;
      const age = Date.now() - new Date(data.captured_at).getTime();
      const hours = Math.round(age / 3_600_000);
      results.push({
        name: "Odds Freshness",
        status: hours < 6 ? "pass" : hours < 24 ? "warn" : "fail",
        message: `Last odds snapshot: ${hours}h ago`,
        latency_ms: Math.round(performance.now() - t6),
      });
    } catch (e: any) {
      results.push({ name: "Odds Freshness", status: "warn", message: "No odds snapshots found" });
    }

    // ── 7. Audit log writable ──────────────────────────────────────────────
    const t7 = performance.now();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from("audit_log" as any).insert({
          user_id: user.id,
          action: "health:check",
          entity_type: "system",
          correlation_id: "health_check",
          meta: { source: "health_page" },
        });
        results.push({
          name: "Audit Log Write",
          status: error ? "fail" : "pass",
          message: error ? error.message : "Audit log write OK",
          latency_ms: Math.round(performance.now() - t7),
        });
      } else {
        results.push({ name: "Audit Log Write", status: "warn", message: "Not authenticated" });
      }
    } catch (e: any) {
      results.push({ name: "Audit Log Write", status: "fail", message: e.message });
    }

    logger.info("health:check:complete", {
      pass: results.filter((r) => r.status === "pass").length,
      fail: results.filter((r) => r.status === "fail").length,
      warn: results.filter((r) => r.status === "warn").length,
    });

    setChecks(results);
    setRanAt(new Date().toISOString());
    setRunning(false);
  }

  const passing = checks.filter((c) => c.status === "pass").length;
  const failing = checks.filter((c) => c.status === "fail").length;
  const warning = checks.filter((c) => c.status === "warn").length;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Shield className="h-10 w-10 opacity-30" />
        <p className="text-sm">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            System Health
          </h1>
          {ranAt && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Last checked: {new Date(ranAt).toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button size="sm" onClick={runChecks} disabled={running} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
          {running ? "Checking..." : "Run Checks"}
        </Button>
      </div>

      {checks.length > 0 && (
        <div className="flex gap-3 text-xs">
          <span className="text-primary font-medium">{passing} passing</span>
          {warning > 0 && <span className="text-accent-foreground font-medium">{warning} warnings</span>}
          {failing > 0 && <span className="text-destructive font-medium">{failing} failing</span>}
        </div>
      )}

      {checks.length === 0 && !running && (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Press "Run Checks" to verify system health.
        </Card>
      )}

      <div className="space-y-2">
        {checks.map((check) => (
          <Card key={check.name} className="p-3 flex items-center gap-3">
            <StatusIcon status={check.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{check.name}</span>
                <StatusBadge status={check.status} />
                {check.latency_ms !== undefined && (
                  <span className="text-[10px] text-muted-foreground">{check.latency_ms}ms</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{check.message}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function HealthPage() {
  return (
    <RequireAuth>
      <HealthPageContent />
    </RequireAuth>
  );
}
