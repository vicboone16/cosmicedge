import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Play, Zap, Brain, Sparkles } from "lucide-react";

interface RunResult {
  label: string;
  status: "idle" | "running" | "done" | "error";
  detail?: string;
}

export default function AdminModelRunner() {
  const [results, setResults] = useState<RunResult[]>([]);
  const [running, setRunning] = useState(false);

  const updateResult = (label: string, update: Partial<RunResult>) => {
    setResults(prev => prev.map(r => r.label === label ? { ...r, ...update } : r));
  };

  const runOracleML = async () => {
    const leagues = ["nba", "nhl", "nfl", "mlb"];
    const newResults: RunResult[] = leagues.map(l => ({ label: `Oracle ML (${l.toUpperCase()})`, status: "running" as const }));
    setResults(prev => [...prev, ...newResults]);

    for (const league of leagues) {
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oracle-ml-${league}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );
        const data = await resp.json();
        updateResult(`Oracle ML (${league.toUpperCase()})`, {
          status: "done",
          detail: `${data.inserted ?? 0} games processed`,
        });
      } catch (e) {
        updateResult(`Oracle ML (${league.toUpperCase()})`, {
          status: "error",
          detail: String(e),
        });
      }
    }
  };

  const runNebulaForAllGames = async () => {
    const label = "Nebula Prop Engine";
    setResults(prev => [...prev, { label, status: "running" }]);

    try {
      // Fetch upcoming NBA games
      const { data: games } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr")
        .eq("league", "NBA")
        .eq("status", "scheduled")
        .gte("start_time", new Date(Date.now() - 2 * 3600_000).toISOString())
        .lte("start_time", new Date(Date.now() + 48 * 3600_000).toISOString())
        .limit(30);

      if (!games?.length) {
        updateResult(label, { status: "done", detail: "No upcoming NBA games found" });
        return;
      }

      let total = 0;
      let errors = 0;
      for (const game of games) {
        try {
          const { data } = await supabase.functions.invoke("nebula-prop-engine", {
            body: { game_id: game.id },
          });
          total += data?.predictions ?? 0;
        } catch {
          errors++;
        }
      }
      updateResult(label, {
        status: errors > 0 ? "error" : "done",
        detail: `${total} predictions across ${games.length} games${errors ? ` (${errors} errors)` : ""}`,
      });
    } catch (e) {
      updateResult(label, { status: "error", detail: String(e) });
    }
  };

  const runEdgeScoreV11 = async () => {
    const label = "EdgeScore v1.1 Persist";
    setResults(prev => [...prev, { label, status: "running" }]);

    try {
      const { data, error } = await supabase.rpc("np_persist_edgescore_v11", { minutes_back: 1440 });
      if (error) throw error;
      updateResult(label, { status: "done", detail: `${data} rows updated` });
    } catch (e) {
      updateResult(label, { status: "error", detail: String(e) });
    }
  };

  const runAll = async () => {
    setRunning(true);
    setResults([]);
    try {
      await runOracleML();
      await runNebulaForAllGames();
      await runEdgeScoreV11();
      toast.success("All models completed");
    } catch (e) {
      toast.error("Model run failed: " + String(e));
    } finally {
      setRunning(false);
    }
  };

  const runSingle = async (fn: () => Promise<void>) => {
    setRunning(true);
    try {
      await fn();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        Model Runner
      </h3>
      <p className="text-xs text-muted-foreground">
        Manually trigger prediction models for upcoming games. Oracle ML runs for all leagues, Nebula runs per-game for NBA.
      </p>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => runSingle(runAll)}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run All Models
        </button>
        <button
          onClick={() => runSingle(runOracleML)}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-semibold disabled:opacity-50"
        >
          <Zap className="h-3.5 w-3.5 text-yellow-500" />
          Oracle ML Only
        </button>
        <button
          onClick={() => runSingle(runNebulaForAllGames)}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-semibold disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          Nebula Only
        </button>
        <button
          onClick={() => runSingle(runEdgeScoreV11)}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-semibold disabled:opacity-50"
        >
          <Zap className="h-3.5 w-3.5 text-green-400" />
          EdgeScore v1.1
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-1.5 mt-3">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {r.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              {r.status === "done" && <span className="h-3 w-3 rounded-full bg-green-500 inline-block" />}
              {r.status === "error" && <span className="h-3 w-3 rounded-full bg-destructive inline-block" />}
              <span className="font-medium text-foreground">{r.label}</span>
              {r.detail && <span className="text-muted-foreground">— {r.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
