import { useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCustomModels, type CustomModel } from "@/hooks/use-custom-models";
import { SPORTS, FACTOR_LIBRARY } from "@/lib/model-factors";
import { fetchPlayerFactors, executeModel, STAT_KEYS, type PredictionResult } from "@/lib/model-engine";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, ChevronDown, ChevronUp, Search, Target, TrendingUp, BarChart3, Brain } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function PredictionStudioPanel() {
  const { user } = useAuth();
  const { data: models } = useCustomModels();
  const [sport, setSport] = useState("NBA");
  const [modelId, setModelId] = useState<string>("default");
  const [statKey, setStatKey] = useState("points");
  const [line, setLine] = useState("20.5");
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string; team: string } | null>(null);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [running, setRunning] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [showInputs, setShowInputs] = useState(false);

  // Search players
  const { data: playerResults } = useQuery({
    queryKey: ["player-search", playerSearch, sport],
    queryFn: async () => {
      if (playerSearch.length < 2) return [];
      const { data } = await supabase.rpc("search_players_unaccent", {
        search_query: playerSearch,
        max_results: 8,
      });
      return (data ?? []).filter((p: any) => !sport || p.player_league === sport);
    },
    enabled: playerSearch.length >= 2 && !selectedPlayer,
  });

  // Fetch upcoming games for selected player
  const { data: upcomingGames } = useQuery({
    queryKey: ["player-games", selectedPlayer?.team, sport],
    queryFn: async () => {
      if (!selectedPlayer?.team) return [];
      const { data } = await supabase
        .from("games")
        .select("id, home_team, away_team, home_abbr, away_abbr, start_time, status")
        .or(`home_abbr.eq.${selectedPlayer.team},away_abbr.eq.${selectedPlayer.team}`)
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(5);
      return data ?? [];
    },
    enabled: !!selectedPlayer?.team,
  });

  async function runPrediction() {
    if (!selectedPlayer || !line) return;
    setRunning(true);
    setResult(null);

    try {
      const values = await fetchPlayerFactors(selectedPlayer.id, statKey, selectedGame ?? undefined);

      const selectedModel = modelId !== "default" ? models?.find((m) => m.id === modelId) : null;
      const factors = selectedModel
        ? (selectedModel.factors as any)
        : FACTOR_LIBRARY.map((f) => ({ key: f.key, weight: f.defaultWeight, enabled: f.category === "base" || f.category === "environment" }));

      const res = executeModel(
        factors,
        values,
        parseFloat(line),
        selectedModel?.name ?? "CosmicEdge Default",
        selectedModel?.id
      );

      setResult(res);

      // Persist run
      if (user) {
        await supabase.from("custom_model_runs" as any).insert({
          model_id: selectedModel?.id ?? null,
          user_id: user.id,
          model_key: selectedModel?.name ?? "default",
          player_id: selectedPlayer.id,
          game_id: selectedGame,
          sport,
          market_type: "player_prop",
          inputs: { factors: res.inputs, stat_key: statKey, line: parseFloat(line) } as any,
          outputs: res.output as any,
          explanation: res.output.explanation,
          calculation_trace: res.trace as any,
          confidence: res.output.confidence,
        } as any);
      }
    } catch (e) {
      console.error("Prediction error:", e);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Config Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sport</label>
          <div className="flex gap-1.5">
            {SPORTS.map((s) => (
              <button key={s.value} onClick={() => { setSport(s.value); setSelectedPlayer(null); }} className={cn("px-2 py-1 rounded-full text-[10px] font-semibold border", sport === s.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Model</label>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground">
            <option value="default">CosmicEdge Default</option>
            {models?.filter((m) => m.sport === sport).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Stat</label>
          <select value={statKey} onChange={(e) => setStatKey(e.target.value)} className="w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground">
            {STAT_KEYS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Line</label>
          <Input type="number" step="0.5" value={line} onChange={(e) => setLine(e.target.value)} className="bg-secondary text-xs h-8" />
        </div>
      </div>

      {/* ── Player Selector ── */}
      <div className="space-y-1">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Player</label>
        {selectedPlayer ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border">
            <span className="text-sm font-semibold text-foreground">{selectedPlayer.name}</span>
            <Badge variant="outline" className="text-[8px]">{selectedPlayer.team}</Badge>
            <button onClick={() => { setSelectedPlayer(null); setPlayerSearch(""); setSelectedGame(null); }} className="ml-auto text-[10px] text-muted-foreground hover:text-destructive">Clear</button>
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

      {/* ── Game Selector ── */}
      {selectedPlayer && upcomingGames && upcomingGames.length > 0 && (
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Game (optional)</label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSelectedGame(null)} className={cn("px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border", !selectedGame ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>
              No game context
            </button>
            {upcomingGames.map((g: any) => (
              <button key={g.id} onClick={() => setSelectedGame(g.id)} className={cn("px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border", selectedGame === g.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>
                {g.away_abbr} @ {g.home_abbr} · {new Date(g.start_time).toLocaleDateString()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Run Button ── */}
      <button onClick={runPrediction} disabled={running || !selectedPlayer || !line} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 transition-opacity hover:opacity-90">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? "Running Model…" : "Run Prediction"}
      </button>

      {/* ── Result ── */}
      {result && (
        <div className="space-y-4">
          {/* Main Result Card */}
          <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">{result.modelName}</span>
              </div>
              <Badge className={cn("text-xs font-bold", result.output.confidenceTier === "S" ? "bg-cosmic-green text-primary-foreground" : result.output.confidenceTier === "A" ? "bg-primary text-primary-foreground" : result.output.confidenceTier === "B" ? "bg-cosmic-gold text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {result.output.confidenceTier}-Tier
              </Badge>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Projection</p>
                <p className="text-lg font-bold text-foreground">{result.output.projection}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Edge</p>
                <p className={cn("text-lg font-bold", result.output.edge > 0 ? "text-cosmic-green" : result.output.edge < 0 ? "text-destructive" : "text-muted-foreground")}>
                  {result.output.edge > 0 ? "+" : ""}{result.output.edge}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Probability</p>
                <p className="text-lg font-bold text-foreground">{(result.output.probability * 100).toFixed(1)}%</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Pick</p>
                <p className={cn("text-lg font-bold", result.output.pick === "OVER" ? "text-cosmic-green" : result.output.pick === "UNDER" ? "text-destructive" : "text-muted-foreground")}>
                  {result.output.pick}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {result.output.explanation.split("**").map((part, i) =>
                i % 2 === 1 ? <strong key={i} className="text-foreground">{part}</strong> : part
              )}
            </p>
          </div>

          {/* ── Show Inputs ── */}
          <div className="rounded-xl border border-border bg-secondary/30">
            <button onClick={() => setShowInputs(!showInputs)} className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold text-foreground">
              <BarChart3 className="h-3.5 w-3.5 text-primary" /> Model Inputs
              {showInputs ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
            </button>
            {showInputs && (
              <div className="px-4 pb-3 space-y-1.5">
                {result.inputs.map((inp) => (
                  <div key={inp.factorKey} className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">{inp.factorName}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-foreground font-mono">{inp.rawValue?.toFixed(2) ?? "—"}</span>
                      <span className="text-muted-foreground">w{inp.weight}</span>
                      <span className={cn("font-mono", inp.weightedValue > 0 ? "text-cosmic-green" : inp.weightedValue < 0 ? "text-destructive" : "text-muted-foreground")}>
                        {inp.weightedValue > 0 ? "+" : ""}{inp.weightedValue.toFixed(4)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Show Math ── */}
          <div className="rounded-xl border border-border bg-secondary/30">
            <button onClick={() => setShowTrace(!showTrace)} className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold text-foreground">
              <Brain className="h-3.5 w-3.5 text-primary" /> Calculation Trace
              {showTrace ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
            </button>
            {showTrace && (
              <div className="px-4 pb-3">
                <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {result.trace.join("\n")}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
