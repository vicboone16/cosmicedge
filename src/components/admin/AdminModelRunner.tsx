import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Play, Zap, Brain, Sparkles, ChevronDown, ChevronUp, Target, Search, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface RunResult {
  label: string;
  status: "idle" | "running" | "done" | "error";
  detail?: string;
  data?: any;
}

type RunMode = "all" | "oracle" | "nebula" | "edgescore";

export default function AdminModelRunner() {
  const [results, setResults] = useState<RunResult[]>([]);
  const [running, setRunning] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [gameSearch, setGameSearch] = useState("");
  const [showResults, setShowResults] = useState(true);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  // Fetch today's and tomorrow's games for the picker
  const { data: games } = useQuery({
    queryKey: ["model-runner-games"],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now.getTime() - 12 * 3600_000).toISOString();
      const end = new Date(now.getTime() + 48 * 3600_000).toISOString();
      const { data } = await supabase
        .from("games")
        .select("id, league, home_abbr, away_abbr, home_team, away_team, start_time, status, home_score, away_score")
        .gte("start_time", start)
        .lte("start_time", end)
        .order("start_time", { ascending: true })
        .limit(100);
      return data || [];
    },
  });

  // Fetch existing predictions for selected game
  const { data: existingPredictions, refetch: refetchPredictions } = useQuery({
    queryKey: ["model-runner-predictions", selectedGameId],
    queryFn: async () => {
      if (!selectedGameId) return null;
      const [{ data: oracle }, { data: nebula }, { data: ceOracle }] = await Promise.all([
        supabase.from("game_predictions").select("*").eq("game_id", selectedGameId).order("run_ts", { ascending: false }).limit(5),
        supabase.from("nebula_prop_predictions" as any).select("*").eq("game_id", selectedGameId).order("pred_ts", { ascending: false }).limit(20),
        supabase.from("ce_game_predictions").select("*").eq("game_id", selectedGameId).order("run_ts", { ascending: false }).limit(5),
      ]);
      return { oracle: oracle || [], nebula: nebula || [], ceOracle: ceOracle || [] };
    },
    enabled: !!selectedGameId,
  });

  const updateResult = (label: string, update: Partial<RunResult>) => {
    setResults(prev => prev.map(r => r.label === label ? { ...r, ...update } : r));
  };

  const runOracleML = async (gameId?: string) => {
    if (gameId) {
      // Run for specific game — determine league
      const game = games?.find(g => g.id === gameId);
      if (!game) return;
      const league = game.league.toLowerCase();
      const label = `Oracle ML (${game.away_abbr}@${game.home_abbr})`;
      setResults(prev => [...prev, { label, status: "running" }]);
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oracle-ml-${league}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ game_id: gameId }),
          }
        );
        const data = await resp.json();
        updateResult(label, { status: "done", detail: `Processed`, data });
        refetchPredictions();
      } catch (e) {
        updateResult(label, { status: "error", detail: String(e) });
      }
    } else {
      // Run all leagues
      const leagues = ["nba", "nhl", "nfl", "mlb"];
      const newResults: RunResult[] = leagues.map(l => ({ label: `Oracle ML (${l.toUpperCase()})`, status: "running" as const }));
      setResults(prev => [...prev, ...newResults]);
      for (const league of leagues) {
        try {
          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oracle-ml-${league}`,
            { method: "GET", headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" } }
          );
          const data = await resp.json();
          updateResult(`Oracle ML (${league.toUpperCase()})`, { status: "done", detail: `${data.inserted ?? 0} games processed`, data });
        } catch (e) {
          updateResult(`Oracle ML (${league.toUpperCase()})`, { status: "error", detail: String(e) });
        }
      }
    }
  };

  const runNebula = async (gameId?: string) => {
    if (gameId) {
      const game = games?.find(g => g.id === gameId);
      const label = `Nebula (${game ? `${game.away_abbr}@${game.home_abbr}` : gameId.slice(0, 8)})`;
      setResults(prev => [...prev, { label, status: "running" }]);
      try {
        const { data } = await supabase.functions.invoke("nebula-prop-engine", { body: { game_id: gameId } });
        updateResult(label, { status: "done", detail: `${data?.predictions ?? 0} predictions`, data });
        refetchPredictions();
      } catch (e) {
        updateResult(label, { status: "error", detail: String(e) });
      }
    } else {
      const label = "Nebula Prop Engine (All)";
      setResults(prev => [...prev, { label, status: "running" }]);
      try {
        const { data: nbaGames } = await supabase.from("games").select("id, home_abbr, away_abbr")
          .eq("league", "NBA").eq("status", "scheduled")
          .gte("start_time", new Date(Date.now() - 2 * 3600_000).toISOString())
          .lte("start_time", new Date(Date.now() + 48 * 3600_000).toISOString()).limit(30);
        if (!nbaGames?.length) { updateResult(label, { status: "done", detail: "No upcoming NBA games" }); return; }
        let total = 0, errors = 0;
        for (const g of nbaGames) {
          try { const { data } = await supabase.functions.invoke("nebula-prop-engine", { body: { game_id: g.id } }); total += data?.predictions ?? 0; }
          catch { errors++; }
        }
        updateResult(label, { status: errors > 0 ? "error" : "done", detail: `${total} predictions across ${nbaGames.length} games${errors ? ` (${errors} errors)` : ""}` });
      } catch (e) { updateResult(label, { status: "error", detail: String(e) }); }
    }
  };

  const runEdgeScore = async () => {
    const label = "EdgeScore v1.1 Persist";
    setResults(prev => [...prev, { label, status: "running" }]);
    try {
      const { data, error } = await supabase.rpc("np_persist_edgescore_v11", { minutes_back: 1440 });
      if (error) throw error;
      const rowCount = typeof data === "number" ? data : (data as any)?.updated ?? (data as any)?.count ?? JSON.stringify(data);
      updateResult(label, { status: "done", detail: `${rowCount} rows updated` });
    } catch (e) { updateResult(label, { status: "error", detail: String(e) }); }
  };

  const runAll = async () => {
    setRunning(true); setResults([]);
    try {
      if (selectedGameId) {
        await runOracleML(selectedGameId);
        const game = games?.find(g => g.id === selectedGameId);
        if (game?.league === "NBA") await runNebula(selectedGameId);
        await runEdgeScore();
      } else {
        await runOracleML();
        await runNebula();
        await runEdgeScore();
      }
      toast.success("All models completed");
    } catch (e) { toast.error("Model run failed: " + String(e)); }
    finally { setRunning(false); }
  };

  const runSingle = async (fn: () => Promise<void>) => { setRunning(true); try { await fn(); } finally { setRunning(false); } };

  const selectedGame = games?.find(g => g.id === selectedGameId);
  const filteredGames = games?.filter(g => {
    if (!gameSearch) return true;
    const q = gameSearch.toLowerCase();
    return g.home_abbr?.toLowerCase().includes(q) || g.away_abbr?.toLowerCase().includes(q)
      || g.home_team?.toLowerCase().includes(q) || g.away_team?.toLowerCase().includes(q)
      || g.league?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        Model Runner
      </h3>

      {/* Game Selector */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Target className="h-3 w-3" /> Target Game (optional)
        </label>
        {selectedGame ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-primary/30">
            <Badge variant="outline" className="text-[8px]">{selectedGame.league}</Badge>
            <span className="text-xs font-semibold text-foreground">
              {selectedGame.away_abbr} @ {selectedGame.home_abbr}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(selectedGame.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
            <Badge variant="outline" className={cn("text-[8px] ml-auto",
              selectedGame.status === "live" ? "border-cosmic-green text-cosmic-green" :
              selectedGame.status === "final" ? "border-muted-foreground" : "border-primary"
            )}>{selectedGame.status}</Badge>
            <button onClick={() => setSelectedGameId(null)} className="text-[10px] text-muted-foreground hover:text-destructive ml-1">✕</button>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={gameSearch}
                onChange={e => setGameSearch(e.target.value)}
                placeholder="Search games (team, league)..."
                className="pl-8 bg-secondary/50 text-xs h-8"
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-lg border border-border bg-card">
              {filteredGames?.map(g => (
                <button
                  key={g.id}
                  onClick={() => { setSelectedGameId(g.id); setGameSearch(""); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary/50 transition-colors"
                >
                  <Badge variant="outline" className="text-[7px] shrink-0">{g.league}</Badge>
                  <span className="text-[11px] font-semibold text-foreground">{g.away_abbr} @ {g.home_abbr}</span>
                  {g.status === "final" && <span className="text-[9px] text-muted-foreground">{g.home_score}-{g.away_score}</span>}
                  <span className="text-[9px] text-muted-foreground ml-auto">
                    {new Date(g.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <Badge variant="outline" className={cn("text-[7px]",
                    g.status === "live" ? "border-cosmic-green text-cosmic-green" :
                    g.status === "final" ? "border-muted-foreground" : ""
                  )}>{g.status}</Badge>
                </button>
              ))}
              {filteredGames?.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-3">No games found</p>}
            </div>
          </div>
        )}
        <p className="text-[9px] text-muted-foreground">
          {selectedGameId ? "Models will run for this specific game only." : "No game selected — models run for all upcoming games."}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => runSingle(runAll)} disabled={running}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {selectedGameId ? "Run for Game" : "Run All Models"}
        </button>
        <button onClick={() => runSingle(() => runOracleML(selectedGameId ?? undefined))} disabled={running}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-semibold disabled:opacity-50">
          <Zap className="h-3.5 w-3.5 text-yellow-500" /> Oracle ML
        </button>
        {(!selectedGameId || selectedGame?.league === "NBA") && (
          <button onClick={() => runSingle(() => runNebula(selectedGameId ?? undefined))} disabled={running}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-semibold disabled:opacity-50">
            <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Nebula
          </button>
        )}
        <button onClick={() => runSingle(runEdgeScore)} disabled={running}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-semibold disabled:opacity-50">
          <Zap className="h-3.5 w-3.5 text-cosmic-green" /> EdgeScore v1.1
        </button>
      </div>

      {/* Run Results */}
      {results.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Run Log</h4>
            <button onClick={() => setResults([])} className="text-[9px] text-muted-foreground hover:text-foreground">Clear</button>
          </div>
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {r.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              {r.status === "done" && <span className="h-3 w-3 rounded-full bg-cosmic-green inline-block shrink-0" />}
              {r.status === "error" && <span className="h-3 w-3 rounded-full bg-destructive inline-block shrink-0" />}
              <span className="font-medium text-foreground">{r.label}</span>
              {r.detail && <span className="text-muted-foreground">— {r.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Prediction Results Viewer (when a game is selected) */}
      {selectedGameId && existingPredictions && (
        <div className="space-y-3 pt-3 border-t border-border/50">
          <button onClick={() => setShowResults(!showResults)} className="flex items-center gap-2 text-xs font-bold text-foreground w-full">
            <Eye className="h-3.5 w-3.5 text-primary" />
            Prediction Results
            {showResults ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
          </button>

          {showResults && (
            <div className="space-y-3">
              {/* Oracle ML Results */}
              {(existingPredictions.oracle.length > 0 || existingPredictions.ceOracle.length > 0) && (
                <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                  <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Zap className="h-3 w-3 text-yellow-500" /> Oracle ML / StellarLine
                  </h5>
                  {[...(existingPredictions.ceOracle || []), ...(existingPredictions.oracle || [])].slice(0, 3).map((p: any, idx: number) => (
                    <div key={p.id || idx} className="rounded-lg bg-secondary/30 p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[7px]">{p.model_key}</Badge>
                        <span className="text-[9px] text-muted-foreground">{new Date(p.run_ts).toLocaleString()}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-[9px] text-muted-foreground">Home Score</p>
                          <p className="text-sm font-bold text-foreground">{p.mu_home?.toFixed(1) ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">Away Score</p>
                          <p className="text-sm font-bold text-foreground">{p.mu_away?.toFixed(1) ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">Home Win%</p>
                          <p className={cn("text-sm font-bold", (p.p_home_win ?? 0) > 0.5 ? "text-cosmic-green" : "text-destructive")}>
                            {p.p_home_win != null ? (p.p_home_win * 100).toFixed(1) + "%" : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">Total</p>
                          <p className="text-sm font-bold text-foreground">{p.mu_total?.toFixed(1) ?? "—"}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-[9px] text-muted-foreground">Spread</p>
                          <p className="text-xs font-semibold">{p.mu_spread_home != null ? (p.mu_spread_home > 0 ? "+" : "") + p.mu_spread_home.toFixed(1) : "—"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">Edge Home</p>
                          <p className={cn("text-xs font-semibold", (p.edge_home ?? 0) > 0 ? "text-cosmic-green" : "text-destructive")}>
                            {p.edge_home != null ? (p.edge_home > 0 ? "+" : "") + (p.edge_home * 100).toFixed(1) + "%" : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">Fair ML Home</p>
                          <p className="text-xs font-semibold">{p.fair_ml_home ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">Blowout Risk</p>
                          <p className="text-xs font-semibold">{p.blowout_risk != null ? (p.blowout_risk * 100).toFixed(0) + "%" : "—"}</p>
                        </div>
                      </div>
                      {p.notes_json && (
                        <button onClick={() => setExpandedResult(expandedResult === p.id ? null : p.id)} className="text-[9px] text-primary hover:underline">
                          {expandedResult === p.id ? "Hide details" : "Show details"}
                        </button>
                      )}
                      {expandedResult === p.id && p.notes_json && (
                        <pre className="text-[9px] font-mono text-muted-foreground bg-secondary/50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(p.notes_json, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                  {existingPredictions.oracle.length === 0 && existingPredictions.ceOracle.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-2">No Oracle predictions yet. Run Oracle ML above.</p>
                  )}
                </div>
              )}

              {/* Nebula Prop Results */}
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-purple-400" /> Nebula Prop Predictions
                  {(existingPredictions.nebula?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="text-[7px] ml-1">{existingPredictions.nebula.length} props</Badge>
                  )}
                </h5>
                {existingPredictions.nebula.length > 0 ? (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    <div className="grid grid-cols-7 gap-1 text-[8px] font-bold text-muted-foreground uppercase px-1">
                      <span className="col-span-2">Player</span>
                      <span>Stat</span>
                      <span>Line</span>
                      <span>μ</span>
                      <span>Edge</span>
                      <span>Side</span>
                    </div>
                    {existingPredictions.nebula.map((p: any) => {
                      const edgeScore = p.edge_score_v11 ?? p.edge_score ?? 0;
                      return (
                        <div key={p.id} className="grid grid-cols-7 gap-1 text-[10px] items-center px-1 py-0.5 hover:bg-secondary/30 rounded">
                          <span className="col-span-2 font-medium text-foreground truncate">{p.player_name}</span>
                          <span className="text-muted-foreground uppercase">{p.prop_type}</span>
                          <span className="tabular-nums">{p.line}</span>
                          <span className="tabular-nums font-semibold">{p.mu?.toFixed(1)}</span>
                          <span className={cn("tabular-nums font-bold", edgeScore >= 60 ? "text-cosmic-green" : edgeScore >= 55 ? "text-primary" : "text-muted-foreground")}>
                            {edgeScore.toFixed(0)}
                          </span>
                          <span className={cn("font-semibold", p.side === "over" ? "text-cosmic-green" : "text-destructive")}>
                            {p.side === "over" ? "O" : "U"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground text-center py-2">No Nebula predictions yet. Run Nebula above.</p>
                )}
              </div>

              {/* No predictions at all */}
              {existingPredictions.oracle.length === 0 && existingPredictions.ceOracle.length === 0 && existingPredictions.nebula.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-3">
                  No predictions found for this game. Select a game above and run models to generate results.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
