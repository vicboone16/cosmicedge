import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Database, Server, HardDrive, Wrench, Loader2, Trophy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function AdminBackend() {
  const [normalizing, setNormalizing] = useState(false);
  const [normLog, setNormLog] = useState<string[] | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [fixingStatuses, setFixingStatuses] = useState(false);
  const [statusFixLog, setStatusFixLog] = useState<{ fixed_capitalization: number; fixed_has_scores: number; log: string[] } | null>(null);
  const [backfillLog, setBackfillLog] = useState<{ log: string[]; total_updated: number; leagues: any[]; status_fixes?: any } | null>(null);
  const [backfillLeagues, setBackfillLeagues] = useState<string[]>(["NBA", "NFL", "NHL", "MLB"]);

  const toggleLeague = (l: string) =>
    setBackfillLeagues(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  const runFixStatuses = async () => {
    setFixingStatuses(true);
    setStatusFixLog(null);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-backfill-scores", {
        body: { mode: "fix_statuses" },
      });
      if (error) throw error;
      setStatusFixLog(data);
      const total = (data?.fixed_capitalization ?? 0) + (data?.fixed_has_scores ?? 0);
      toast.success(`Status fix complete — ${total} games corrected`);
    } catch (e: any) {
      toast.error(e.message || "Status fix failed");
    } finally {
      setFixingStatuses(false);
    }
  };

  const runBackfill = async () => {
    setBackfilling(true);
    setBackfillLog(null);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-backfill-scores", {
        body: { leagues: backfillLeagues },
      });
      if (error) throw error;
      setBackfillLog(data);
      const total = data?.total_updated ?? 0;
      const statusTotal = (data?.status_fixes?.fixed_capitalization ?? 0) + (data?.status_fixes?.fixed_has_scores ?? 0);
      toast.success(`Backfill complete — ${total} scores updated, ${statusTotal} status fixes`);
    } catch (e: any) {
      toast.error(e.message || "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  };

  const runNormalize = async (dryRun: boolean) => {
    setNormalizing(true);
    setNormLog(null);
    try {
      const { data, error } = await supabase.functions.invoke("normalize-data", {
        body: { dry_run: dryRun },
      });
      if (error) throw error;
      setNormLog(data.changes || []);
      toast.success(`${dryRun ? "Dry run" : "Applied"}: ${data.total_updates} updates${data.changes?.length ? "" : " (all clean!)"}`);
    } catch (e: any) {
      toast.error(e.message || "Normalization failed");
    } finally {
      setNormalizing(false);
    }
  };

  const { data: tableStats } = useQuery({
    queryKey: ["admin-table-stats"],
    queryFn: async () => {
      const tables = ["games", "players", "odds_snapshots", "bets", "player_game_stats", "player_props", "historical_odds", "injuries", "alerts", "player_news"];
      const results: { table: string; count: number }[] = [];
      for (const t of tables) {
        const { count } = await supabase.from(t as any).select("*", { count: "exact", head: true }).limit(1000000);
        results.push({ table: t, count: count || 0 });
      }
      return results;
    },
    staleTime: 60000,
  });

  const { data: edgeFns } = useQuery({
    queryKey: ["admin-edge-functions"],
    queryFn: async () => {
      // List known edge functions
      return [
        "fetch-odds", "fetch-live-scores", "fetch-player-props", "fetch-injuries-lineups",
        "fetch-news", "fetch-stats", "fetch-historical-odds", "fetch-projections",
        "quant-engine", "astro-batch", "astro-interpret", "check-alerts",
        "import-historical-csv", "import-sdio-bulk", "import-schedule-xlsx",
        "backfill-scores", "aggregate-period-stats",
      ];
    },
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-primary" />
          Database Tables
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {tableStats?.map(t => (
            <div key={t.table} className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2">
              <span className="text-xs text-foreground">{t.table}</span>
              <Badge variant="outline" className="text-[10px]">{t.count.toLocaleString()}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Server className="h-4 w-4 text-primary" />
          Backend Functions
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {edgeFns?.map(fn => (
            <Badge key={fn} variant="secondary" className="text-[10px]">{fn}</Badge>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <HardDrive className="h-4 w-4 text-primary" />
          Storage Buckets
        </h2>
        <div className="space-y-1">
          <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2">
            <span className="text-xs text-foreground">csv-imports</span>
            <Badge variant="outline" className="text-[10px]">Private</Badge>
          </div>
          <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2">
            <span className="text-xs text-foreground">avatars</span>
            <Badge variant="outline" className="text-[10px]">Public</Badge>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Wrench className="h-4 w-4 text-primary" />
          Data Normalization
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Normalize team abbreviations across all tables (games, players, stats, injuries, etc.)
        </p>
        <div className="flex gap-2 mb-3">
          <Button size="sm" variant="outline" onClick={() => runNormalize(true)} disabled={normalizing}>
            {normalizing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Dry Run
          </Button>
          <Button size="sm" variant="destructive" onClick={() => runNormalize(false)} disabled={normalizing}>
            {normalizing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Apply Fixes
          </Button>
        </div>
        {normLog && (
          <div className="bg-secondary/30 rounded-lg p-3 max-h-48 overflow-y-auto">
            {normLog.length === 0 ? (
              <p className="text-xs text-muted-foreground">✅ All abbreviations are canonical — nothing to fix.</p>
            ) : (
              normLog.map((line, i) => (
                <p key={i} className="text-[10px] text-foreground font-mono">{line}</p>
              ))
            )}
          </div>
        )}
      </Card>

      {/* ── Fix Game Statuses ── */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Fix Game Statuses
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Normalizes "Final/OT", "Final/2OT" etc. → "final", and marks any game with scores as final. Run this first.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={runFixStatuses}
          disabled={fixingStatuses}
          className="mb-3"
        >
          {fixingStatuses ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <ShieldCheck className="h-3 w-3 mr-1.5" />}
          {fixingStatuses ? "Fixing…" : "Fix Status Cases"}
        </Button>
        {statusFixLog && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              ✅ {statusFixLog.fixed_capitalization} capitalization fixes · {statusFixLog.fixed_has_scores} scored→final fixes
            </p>
            <div className="bg-secondary/30 rounded-lg p-3 max-h-32 overflow-y-auto">
              {statusFixLog.log?.map((line, i) => (
                <p key={i} className="text-[10px] text-foreground font-mono">{line}</p>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── Season-Wide Score Backfill ── */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
          <Trophy className="h-4 w-4 text-primary" />
          Season-Wide Score Backfill
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Pulls the full season from TheSportsDB and marks all matched past games as <strong>final</strong> with correct scores.
        </p>

        {/* League toggles */}
        <div className="flex gap-2 flex-wrap mb-3">
          {["NBA", "NFL", "NHL", "MLB"].map(l => (
            <button
              key={l}
              onClick={() => toggleLeague(l)}
              className={`text-[11px] px-2 py-1 rounded border font-medium transition-colors ${
                backfillLeagues.includes(l)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          variant="default"
          onClick={runBackfill}
          disabled={backfilling || backfillLeagues.length === 0}
          className="mb-3"
        >
          {backfilling ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Trophy className="h-3 w-3 mr-1.5" />}
          {backfilling ? "Running backfill…" : "Run Backfill"}
        </Button>

        {backfillLog && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="font-semibold text-primary">✅ {backfillLog.total_updated} scores updated</span>
              {backfillLog.status_fixes && (
                <span className="text-muted-foreground">
                  +{(backfillLog.status_fixes.fixed_capitalization ?? 0) + (backfillLog.status_fixes.fixed_has_scores ?? 0)} status fixes
                </span>
              )}
              {backfillLog.leagues?.map((r: any) => (
                <span key={r.league} className="text-muted-foreground">
                  {r.league}: {r.games_updated}↑
                </span>
              ))}
            </div>
            <div className="bg-secondary/30 rounded-lg p-3 max-h-56 overflow-y-auto">
              {backfillLog.log?.map((line, i) => (
                <p key={i} className="text-[10px] text-foreground font-mono leading-relaxed">{line}</p>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
