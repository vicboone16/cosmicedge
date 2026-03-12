import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Database, Server, HardDrive, Wrench, Loader2, Trophy, ShieldCheck, GraduationCap, BarChart3, Globe } from "lucide-react";
import { toast } from "sonner";

export default function AdminBackend() {
  const [normalizing, setNormalizing] = useState(false);
  const [normLog, setNormLog] = useState<string[] | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [fixingStatuses, setFixingStatuses] = useState(false);
  const [statusFixLog, setStatusFixLog] = useState<{ fixed_capitalization: number; fixed_has_scores: number; log: string[] } | null>(null);
  const [backfillLog, setBackfillLog] = useState<{ log: string[]; total_updated: number; leagues: any[]; status_fixes?: any } | null>(null);
  const [backfillLeagues, setBackfillLeagues] = useState<string[]>(["NBA", "NFL", "NHL", "MLB"]);
  const [ncaabLoading, setNcaabLoading] = useState<string | null>(null);
  const [ncaabLog, setNcaabLog] = useState<any>(null);
  const [bdlQDate, setBdlQDate] = useState(new Date().toISOString().split("T")[0]);
  const [bdlQSeason, setBdlQSeason] = useState("2025");
  const [bdlQLoading, setBdlQLoading] = useState(false);
  const [bdlQLog, setBdlQLog] = useState<any>(null);
  const [bdlMultiLeagues, setBdlMultiLeagues] = useState<string[]>(["NHL", "MLB", "NCAAB"]);
  const [bdlMultiLoading, setBdlMultiLoading] = useState(false);
  const [bdlMultiLog, setBdlMultiLog] = useState<any>(null);

  const toggleLeague = (l: string) =>
    setBackfillLeagues(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  const runNcaab = async (mode: string) => {
    setNcaabLoading(mode);
    setNcaabLog(null);
    try {
      const { data, error } = await supabase.functions.invoke("ncaab-dispatcher", {
        body: { mode },
      });
      if (error) throw error;
      setNcaabLog(data);
      toast.success(`NCAAB ${mode} complete`);
    } catch (e: any) {
      toast.error(e.message || `NCAAB ${mode} failed`);
      setNcaabLog({ error: e.message });
    } finally {
      setNcaabLoading(null);
    }
  };

  // ... keep existing code (runFixStatuses, runBackfill, runNormalize, tableStats, edgeFns queries)

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
      return [
        "fetch-odds", "fetch-live-scores", "fetch-player-props", "fetch-injuries-lineups",
        "fetch-news", "fetch-stats", "fetch-historical-odds", "fetch-projections",
        "quant-engine", "astro-batch", "astro-interpret", "check-alerts",
        "import-historical-csv", "import-sdio-bulk", "import-schedule-xlsx",
        "backfill-scores", "aggregate-period-stats", "ncaab-dispatcher",
      ];
    },
  });

  const runBdlQuarterStats = async () => {
    setBdlQLoading(true);
    setBdlQLog(null);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/bdl-quarter-stats?date=${bdlQDate}&season=${bdlQSeason}`;
      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
      setBdlQLog(result);
      toast.success(`Quarter stats fetched: ${result.stats?.total_rows ?? 0} rows, ${result.stats?.halves_computed ?? 0} halves`);
    } catch (e: any) {
      toast.error(e.message || "BDL Quarter Stats failed");
      setBdlQLog({ error: e.message });
    } finally {
      setBdlQLoading(false);
    }
  };

  const toggleBdlMultiLeague = (l: string) =>
    setBdlMultiLeagues(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  const runBdlMultiLeague = async () => {
    setBdlMultiLoading(true);
    setBdlMultiLog(null);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const leagueParam = bdlMultiLeagues.join(",");
      const url = `https://${projectId}.supabase.co/functions/v1/bdl-backfill-multi-league?leagues=${leagueParam}`;
      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
      setBdlMultiLog(result);
      toast.success(`Multi-league backfill: ${result.stats?.total_games_updated ?? 0} games, ${result.stats?.total_periods_upserted ?? 0} periods`);
    } catch (e: any) {
      toast.error(e.message || "Multi-league backfill failed");
      setBdlMultiLog({ error: e.message });
    } finally {
      setBdlMultiLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── BDL Multi-League Backfill ── */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
          <Globe className="h-4 w-4 text-primary" />
          BDL Multi-League Score Backfill
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Fetch all completed games from BDL for NHL, MLB, and NCAAB this season. Updates final scores + period/inning/half scores.
        </p>
        <div className="flex gap-2 flex-wrap mb-3">
          {["NHL", "MLB", "NCAAB"].map(l => (
            <button
              key={l}
              onClick={() => toggleBdlMultiLeague(l)}
              className={`text-[11px] px-2 py-1 rounded border font-medium transition-colors ${
                bdlMultiLeagues.includes(l)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={runBdlMultiLeague} disabled={bdlMultiLoading || bdlMultiLeagues.length === 0} className="mb-3">
          {bdlMultiLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Globe className="h-3 w-3 mr-1.5" />}
          {bdlMultiLoading ? "Backfilling…" : `Backfill ${bdlMultiLeagues.join(", ")}`}
        </Button>
        {bdlMultiLog && (
          <div className="bg-secondary/30 rounded-lg p-3 max-h-64 overflow-y-auto">
            {bdlMultiLog.log ? (
              bdlMultiLog.log.map((line: string, i: number) => (
                <p key={i} className="text-[10px] text-foreground font-mono whitespace-pre-wrap">{line}</p>
              ))
            ) : (
              <pre className="text-[10px] text-foreground font-mono whitespace-pre-wrap">
                {JSON.stringify(bdlMultiLog, null, 2).slice(0, 3000)}
              </pre>
            )}
          </div>
        )}
      </Card>
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
          <BarChart3 className="h-4 w-4 text-primary" />
          BDL Quarter Stats
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Fetch per-quarter player stats from BDL and auto-compute 1H/2H aggregates.
        </p>
        <div className="flex gap-2 items-end mb-3 flex-wrap">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Date</label>
            <Input type="date" value={bdlQDate} onChange={e => setBdlQDate(e.target.value)} className="h-8 w-36 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Season</label>
            <Input value={bdlQSeason} onChange={e => setBdlQSeason(e.target.value)} className="h-8 w-20 text-xs" placeholder="2025" />
          </div>
          <Button size="sm" onClick={runBdlQuarterStats} disabled={bdlQLoading}>
            {bdlQLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <BarChart3 className="h-3 w-3 mr-1.5" />}
            {bdlQLoading ? "Fetching…" : "Fetch Quarter Stats"}
          </Button>
        </div>
        {bdlQLog && (
          <div className="bg-secondary/30 rounded-lg p-3 max-h-48 overflow-y-auto">
            <pre className="text-[10px] text-foreground font-mono whitespace-pre-wrap">
              {JSON.stringify(bdlQLog, null, 2).slice(0, 3000)}
            </pre>
          </div>
        )}
      </Card>

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

      {/* ── NCAAB Dispatcher ── */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
          <GraduationCap className="h-4 w-4 text-primary" />
          NCAAB Dispatcher
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Sync NCAA Basketball schedules, live games, and standings from API-Basketball.
        </p>
        <div className="flex gap-2 flex-wrap mb-3">
          {[
            { mode: "live", label: "Fetch Live" },
            { mode: "sync_schedule", label: "Sync Schedule" },
            { mode: "sync_standings", label: "Sync Standings" },
            { mode: "sync_teams", label: "Sync Teams" },
          ].map(({ mode, label }) => (
            <Button
              key={mode}
              size="sm"
              variant="outline"
              onClick={() => runNcaab(mode)}
              disabled={ncaabLoading !== null}
            >
              {ncaabLoading === mode ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
              {label}
            </Button>
          ))}
        </div>
        {ncaabLog && (
          <div className="bg-secondary/30 rounded-lg p-3 max-h-48 overflow-y-auto">
            <pre className="text-[10px] text-foreground font-mono whitespace-pre-wrap">
              {JSON.stringify(ncaabLog, null, 2).slice(0, 2000)}
            </pre>
          </div>
        )}
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
          {["NBA", "NFL", "NHL", "MLB", "NCAAB"].map(l => (
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
