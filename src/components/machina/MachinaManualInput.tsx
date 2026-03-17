import { useState } from "react";
import { cn } from "@/lib/utils";
import { executeModel, STAT_KEYS } from "@/lib/model-engine";
import { FACTOR_LIBRARY, SPORTS, MARKET_TYPES } from "@/lib/model-factors";
import { useCustomModels } from "@/hooks/use-custom-models";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Play, Loader2, Save, RotateCcw, ChevronDown, ChevronUp, Brain, Pencil } from "lucide-react";

const MANUAL_FIELDS = [
  { key: "season_avg", label: "Season Average", default: 22 },
  { key: "last_10_avg", label: "Last 10 Average", default: 24 },
  { key: "last_5_avg", label: "Last 5 Average", default: 25 },
  { key: "volatility", label: "Std Deviation (σ)", default: 5.2 },
  { key: "consistency", label: "Consistency", default: 0.78 },
  { key: "momentum", label: "Momentum (L5 vs L10)", default: 0.04 },
  { key: "usage_shift", label: "Usage Change (%)", default: 0.02 },
  { key: "pace", label: "Pace (possessions)", default: 100 },
  { key: "off_rating", label: "Offensive Rating", default: 112 },
  { key: "def_rating", label: "Opponent Def Rating", default: 109 },
  { key: "matchup_diff", label: "Matchup Difficulty", default: 0 },
  { key: "injuries", label: "Injury Impact", default: 0 },
  { key: "blowout_risk", label: "Blowout Risk (0-1)", default: 0.15 },
  { key: "streak_score", label: "Streak Score", default: 2 },
  { key: "rest_days", label: "Rest Days", default: 1 },
  { key: "line_movement", label: "Line Movement", default: 0 },
  { key: "astro_overlay", label: "Astro Overlay", default: 0 },
  { key: "transit_score", label: "Transit Score", default: 0 },
  { key: "mars_boost", label: "Mars Boost", default: 0 },
  { key: "mercury_chaos", label: "Mercury Chaos", default: 0 },
  { key: "game_script", label: "Game Script", default: 0 },
  { key: "correlation", label: "Correlation", default: 0 },
];

export default function MachinaManualInput() {
  const { user } = useAuth();
  const { data: models } = useCustomModels();
  const [playerName, setPlayerName] = useState("");
  const [sport, setSport] = useState("NBA");
  const [marketType, setMarketType] = useState("player_prop");
  const [statKey, setStatKey] = useState("points");
  const [line, setLine] = useState("20.5");
  const [modelId, setModelId] = useState("default");
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(MANUAL_FIELDS.map((f) => [f.key, f.default]))
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [showInputs, setShowInputs] = useState(false);

  function updateValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: parseFloat(val) || 0 }));
  }

  function resetAll() {
    setValues(Object.fromEntries(MANUAL_FIELDS.map((f) => [f.key, f.default])));
    setResult(null);
  }

  async function runManual() {
    setRunning(true);
    setResult(null);
    try {
      const selectedModel = modelId !== "default" ? models?.find((m) => m.id === modelId) : null;
      const factors = selectedModel
        ? (selectedModel.factors as any)
        : FACTOR_LIBRARY.map((f) => ({ key: f.key, weight: f.defaultWeight, enabled: true }));

      const res = executeModel(factors, values, parseFloat(line), selectedModel?.name ?? "Manual Run");
      setResult(res);

      if (user) {
        await supabase.from("custom_model_runs" as any).insert({
          user_id: user.id,
          model_key: `manual:${selectedModel?.name ?? "sandbox"}`,
          model_id: selectedModel?.id ?? null,
          sport,
          market_type: marketType,
          inputs: { manual: true, values, stat_key: statKey, line: parseFloat(line), player_name: playerName } as any,
          outputs: res.output as any,
          explanation: res.output.explanation,
          calculation_trace: res.trace as any,
          confidence: res.output.confidence,
        } as any);
      }
    } catch (e) {
      console.error("Manual run error:", e);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">Manual Input Mode</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Enter raw values to run any model without relying on database sources. Ideal for sandbox testing and what-if scenarios.
        </p>
      </div>

      {/* Context */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase">Player Name</label>
          <Input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="e.g. Jalen Brunson" className="bg-secondary text-xs h-8" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase">Sport</label>
          <div className="flex gap-1">
            {SPORTS.map((s) => (
              <button key={s.value} onClick={() => setSport(s.value)} className={cn("px-2 py-1 rounded-full text-[10px] font-semibold border", sport === s.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>{s.label}</button>
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

      {/* Model selector */}
      <div className="space-y-1">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase">Model</label>
        <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground">
          <option value="default">All Factors (Default)</option>
          {models?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {/* Manual Value Grid */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Input Variables</h4>
          <button onClick={resetAll} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {MANUAL_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-secondary/30 border border-border/50">
              <span className="text-[10px] text-muted-foreground flex-1 min-w-0 truncate">{f.label}</span>
              <Input
                type="number"
                step="0.1"
                value={values[f.key]}
                onChange={(e) => updateValue(f.key, e.target.value)}
                className="h-6 w-20 text-[10px] text-right font-mono px-1"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Run */}
      <button onClick={runManual} disabled={running} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? "Running…" : "Run Manual Prediction"}
      </button>

      {/* Result */}
      {result && (
        <div className="space-y-3">
          <div className="rounded-xl border border-primary/20 bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-foreground">{result.modelName}</span>
              <Badge className={cn("text-xs font-bold", result.output.confidenceTier === "S" ? "bg-cosmic-green" : result.output.confidenceTier === "A" ? "bg-primary" : "bg-muted")}>{result.output.confidenceTier}-Tier</Badge>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center"><p className="text-[10px] text-muted-foreground">Projection</p><p className="text-lg font-bold text-foreground">{result.output.projection}</p></div>
              <div className="text-center"><p className="text-[10px] text-muted-foreground">Edge</p><p className={cn("text-lg font-bold", result.output.edge > 0 ? "text-cosmic-green" : "text-destructive")}>{result.output.edge > 0 ? "+" : ""}{result.output.edge}</p></div>
              <div className="text-center"><p className="text-[10px] text-muted-foreground">Probability</p><p className="text-lg font-bold text-foreground">{(result.output.probability * 100).toFixed(1)}%</p></div>
              <div className="text-center"><p className="text-[10px] text-muted-foreground">Pick</p><p className={cn("text-lg font-bold", result.output.pick === "OVER" ? "text-cosmic-green" : "text-destructive")}>{result.output.pick}</p></div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">{result.output.explanation}</p>
          </div>

          {/* Inputs */}
          <div className="rounded-xl border border-border bg-secondary/30">
            <button onClick={() => setShowInputs(!showInputs)} className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold text-foreground">
              <Brain className="h-3.5 w-3.5 text-primary" /> Factor Contributions
              {showInputs ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
            </button>
            {showInputs && (
              <div className="px-4 pb-3 space-y-1">
                {result.inputs.map((inp: any) => (
                  <div key={inp.factorKey} className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">{inp.factorName}</span>
                    <span className={cn("font-mono", inp.weightedValue > 0 ? "text-cosmic-green" : inp.weightedValue < 0 ? "text-destructive" : "text-muted-foreground")}>
                      {inp.weightedValue > 0 ? "+" : ""}{inp.weightedValue.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Trace */}
          <div className="rounded-xl border border-border bg-secondary/30">
            <button onClick={() => setShowTrace(!showTrace)} className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold text-foreground">
              <Brain className="h-3.5 w-3.5 text-primary" /> Calculation Trace
              {showTrace ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
            </button>
            {showTrace && <pre className="px-4 pb-3 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">{result.trace.join("\n")}</pre>}
          </div>
        </div>
      )}
    </div>
  );
}
