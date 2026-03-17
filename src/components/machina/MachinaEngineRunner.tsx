import { useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { fetchPlayerFactors, executeModel, STAT_KEYS } from "@/lib/model-engine";
import { FACTOR_LIBRARY, SPORTS } from "@/lib/model-factors";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Search, Cpu, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from "lucide-react";

const BUILTIN_ENGINES = [
  { key: "nebula_prop", name: "NebulaProp", description: "Core player prop distribution engine", layer: "projection", status: "active" },
  { key: "edge_score", name: "Edge Score", description: "Projection vs line delta scorer", layer: "signal", status: "active" },
  { key: "edge_radar", name: "Edge Radar", description: "Weighted composite of edge, trend, matchup, signals", layer: "signal", status: "active" },
  { key: "monte_carlo", name: "Monte Carlo", description: "Stochastic outcome simulation (1000+ draws)", layer: "simulation", status: "active" },
  { key: "volatility", name: "Volatility Engine", description: "Standard deviation and consistency scorer", layer: "adjustment", status: "active" },
  { key: "streak", name: "Streak Engine", description: "Consecutive over/under hit detection", layer: "adjustment", status: "active" },
  { key: "usage", name: "Usage Engine", description: "Recent usage rate shift analysis", layer: "adjustment", status: "active" },
  { key: "matchup", name: "Matchup Engine", description: "Opponent strength at defending stat", layer: "adjustment", status: "active" },
  { key: "pace_pulse", name: "PacePulse", description: "Game environment possessions and tempo", layer: "environment", status: "active" },
  { key: "game_predict", name: "Game Prediction", description: "Full-game score and win probability model", layer: "projection", status: "active" },
  { key: "live_wp", name: "Live Win Probability", description: "In-game win probability from snapshots", layer: "live", status: "active" },
  { key: "astro", name: "Astro Engine", description: "Planetary transit and natal chart modifiers", layer: "astro", status: "active" },
  { key: "correlation", name: "Correlation Engine", description: "Stat interdependence analysis", layer: "advanced", status: "beta" },
];

export default function MachinaEngineRunner() {
  const { user } = useAuth();
  const [selectedEngine, setSelectedEngine] = useState<string | null>(null);
  const [sport, setSport] = useState("NBA");
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string; team: string } | null>(null);
  const [statKey, setStatKey] = useState("points");
  const [line, setLine] = useState("20.5");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showTrace, setShowTrace] = useState(false);

  // DB engines
  const { data: dbEngines } = useQuery({
    queryKey: ["ce-engine-registry"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ce_engine_registry")
        .select("engine_key, engine_name, description, status, layer")
        .order("display_order");
      return data ?? [];
    },
  });

  // Player search
  const { data: playerResults } = useQuery({
    queryKey: ["engine-player-search", playerSearch, sport],
    queryFn: async () => {
      if (playerSearch.length < 2) return [];
      const { data } = await supabase.rpc("search_players_unaccent", { search_query: playerSearch, max_results: 8 });
      return (data ?? []).filter((p: any) => !sport || p.player_league === sport);
    },
    enabled: playerSearch.length >= 2 && !selectedPlayer,
  });

  const allEngines = [
    ...BUILTIN_ENGINES,
    ...(dbEngines ?? []).filter((e: any) => !BUILTIN_ENGINES.some((b) => b.key === e.engine_key)).map((e: any) => ({
      key: e.engine_key, name: e.engine_name, description: e.description ?? "", layer: e.layer ?? "custom", status: e.status ?? "active",
    })),
  ];

  const engine = allEngines.find((e) => e.key === selectedEngine);

  async function runEngine() {
    if (!selectedPlayer || !engine) return;
    setRunning(true);
    setResult(null);
    try {
      const values = await fetchPlayerFactors(selectedPlayer.id, statKey);
      const factors = FACTOR_LIBRARY.map((f) => ({ key: f.key, weight: f.defaultWeight, enabled: true }));
      const res = executeModel(factors, values, parseFloat(line), engine.name);
      setResult(res);

      if (user) {
        await supabase.from("custom_model_runs" as any).insert({
          user_id: user.id,
          model_key: `engine:${engine.key}`,
          player_id: selectedPlayer.id,
          sport,
          market_type: "player_prop",
          inputs: { engine: engine.key, stat_key: statKey, line: parseFloat(line) } as any,
          outputs: res.output as any,
          explanation: res.output.explanation,
          calculation_trace: res.trace as any,
          confidence: res.output.confidence,
        } as any);
      }
    } catch (e) {
      console.error("Engine run error:", e);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Engine List */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Available Engines</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
          {allEngines.map((e) => (
            <button
              key={e.key}
              onClick={() => setSelectedEngine(e.key)}
              className={cn(
                "text-left p-3 rounded-xl border transition-all",
                selectedEngine === e.key
                  ? "border-primary/40 bg-card shadow-sm"
                  : "border-border bg-secondary/20 hover:bg-secondary/40"
              )}
            >
              <div className="flex items-center gap-2">
                <Cpu className={cn("h-3 w-3", e.status === "active" ? "text-cosmic-green" : "text-cosmic-gold")} />
                <span className="text-xs font-semibold text-foreground">{e.name}</span>
                <Badge variant="outline" className="text-[7px] ml-auto">{e.layer}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{e.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Engine selected → show controls */}
      {engine && (
        <>
          <div className="rounded-xl border border-primary/20 bg-card p-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground">{engine.name}</span>
              <Badge variant="outline" className="text-[8px]">{engine.status}</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{engine.description}</p>
          </div>

          {/* Target config */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Sport</label>
              <div className="flex gap-1.5">
                {SPORTS.map((s) => (
                  <button key={s.value} onClick={() => { setSport(s.value); setSelectedPlayer(null); }} className={cn("px-2 py-1 rounded-full text-[10px] font-semibold border", sport === s.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>{s.label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Stat</label>
              <select value={statKey} onChange={(e) => setStatKey(e.target.value)} className="w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground">
                {STAT_KEYS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Line</label>
              <Input type="number" step="0.5" value={line} onChange={(e) => setLine(e.target.value)} className="bg-secondary text-xs h-8" />
            </div>
          </div>

          {/* Player */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Player</label>
            {selectedPlayer ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border">
                <span className="text-sm font-semibold text-foreground">{selectedPlayer.name}</span>
                <Badge variant="outline" className="text-[8px]">{selectedPlayer.team}</Badge>
                <button onClick={() => { setSelectedPlayer(null); setPlayerSearch(""); }} className="ml-auto text-[10px] text-muted-foreground hover:text-destructive">Clear</button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} placeholder="Search player..." className="pl-8 bg-secondary text-xs h-9" />
                {playerResults && playerResults.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {playerResults.map((p: any) => (
                      <button key={p.player_id} onClick={() => { setSelectedPlayer({ id: p.player_id, name: p.player_name, team: p.player_team }); setPlayerSearch(""); }} className="w-full text-left px-3 py-2 text-xs hover:bg-secondary/50 flex items-center gap-2">
                        <span className="font-semibold text-foreground">{p.player_name}</span>
                        <span className="text-muted-foreground">{p.player_team}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Run */}
          <button onClick={runEngine} disabled={running || !selectedPlayer} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running Engine…" : `Run ${engine.name}`}
          </button>

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="rounded-xl border border-primary/20 bg-card p-4 grid grid-cols-4 gap-3">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Projection</p>
                  <p className="text-lg font-bold text-foreground">{result.output.projection}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Edge</p>
                  <p className={cn("text-lg font-bold", result.output.edge > 0 ? "text-cosmic-green" : "text-destructive")}>{result.output.edge > 0 ? "+" : ""}{result.output.edge}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Probability</p>
                  <p className="text-lg font-bold text-foreground">{(result.output.probability * 100).toFixed(1)}%</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Tier</p>
                  <Badge className={cn("text-xs font-bold", result.output.confidenceTier === "S" ? "bg-cosmic-green" : result.output.confidenceTier === "A" ? "bg-primary" : "bg-muted")}>{result.output.confidenceTier}</Badge>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-secondary/30">
                <button onClick={() => setShowTrace(!showTrace)} className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold text-foreground">
                  <Cpu className="h-3.5 w-3.5 text-primary" /> Engine Trace
                  {showTrace ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
                </button>
                {showTrace && (
                  <pre className="px-4 pb-3 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">{result.trace.join("\n")}</pre>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
