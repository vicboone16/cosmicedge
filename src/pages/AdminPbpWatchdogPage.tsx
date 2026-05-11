import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { usePbpWatchdog, freshnessLabel, freshnessColor } from "@/hooks/use-pbp-watchdog";

interface GameRow {
  id: string;
  home_abbr: string;
  away_abbr: string;
  status: string | null;
  start_time: string;
  league: string;
}

interface DiagRow {
  cadence: number;
  monotonicityViolations: number;
}

export default function AdminPbpWatchdogPage() {
  const [hoursBack, setHoursBack] = useState(6);

  const { data: games = [] } = useQuery({
    queryKey: ["watchdog-games", hoursBack],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, status, start_time, league")
        .eq("league", "NBA")
        .gte("start_time", since)
        .order("start_time", { ascending: false })
        .limit(40);
      return (data ?? []) as GameRow[];
    },
  });

  const gameIds = games.map((g) => g.id);
  const { data: watchdog = {} } = usePbpWatchdog(gameIds);

  const { data: diagnostics = {} } = useQuery({
    queryKey: ["watchdog-diag", gameIds.join(",")],
    enabled: gameIds.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 60_000).toISOString();
      const { data } = await supabase
        .from("pbp_events" as any)
        .select("game_key, home_score, away_score, created_at")
        .in("game_key", gameIds)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(5000);

      const rows = ((data ?? []) as unknown as Array<{ game_key: string; home_score: number | null; away_score: number | null; created_at: string }>);
      const result: Record<string, DiagRow> = {};
      const grouped = new Map<string, typeof rows>();
      for (const r of rows) {
        const arr = grouped.get(r.game_key) ?? [];
        arr.push(r);
        grouped.set(r.game_key, arr);
      }
      const fiveMinAgo = Date.now() - 5 * 60_000;
      for (const [k, arr] of grouped.entries()) {
        const recent = arr.filter((r) => new Date(r.created_at).getTime() >= fiveMinAgo);
        let violations = 0, lastH = -Infinity, lastA = -Infinity;
        for (const r of arr) {
          const h = Number(r.home_score ?? lastH);
          const a = Number(r.away_score ?? lastA);
          if (lastH !== -Infinity && (h < lastH || a < lastA)) violations++;
          lastH = h; lastA = a;
        }
        result[k] = { cadence: +(recent.length / 5).toFixed(2), monotonicityViolations: violations };
      }
      return result;
    },
  });

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold font-display">PBP Watchdog</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        Validates that NBA PBP events and live WP streams are updating in real time.
        Fresh &lt;60s · Slow 60s–5m · Frozen ≥5m.
      </p>

      <div className="flex gap-2">
        {[2, 6, 24].map((h) => (
          <button key={h} onClick={() => setHoursBack(h)}
            className={cn("px-3 py-1 rounded-full border text-xs font-semibold transition-colors",
              hoursBack === h ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
            )}>
            Last {h}h
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              {["Matchup", "Status", "PBP Stream", "Cadence/min", "Monotonicity", "Live WP"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {games.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No games in window.</td></tr>
            ) : games.map((g) => {
              const w = watchdog[g.id];
              const d = diagnostics[g.id];
              const dot = freshnessColor(w?.status ?? "no_data");
              return (
                <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-semibold">{g.away_abbr} @ {g.home_abbr}</td>
                  <td className="px-3 py-2 text-muted-foreground">{g.status ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
                      {freshnessLabel(w?.status ?? "no_data")}
                      {w?.ageSec != null && <span className="text-muted-foreground">{w.ageSec}s</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{d?.cadence ?? "—"}</td>
                  <td className={cn("px-3 py-2 tabular-nums font-semibold", (d?.monotonicityViolations ?? 0) > 0 ? "text-rose-500" : "text-emerald-500")}>
                    {d?.monotonicityViolations ?? 0}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {w?.wpAgeSec != null ? `${w.wpAgeSec}s ago` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
