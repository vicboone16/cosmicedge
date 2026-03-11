import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Cpu, FlaskConical, BarChart3, Save, SlidersHorizontal, Play, Copy, Sparkles, Bug, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const AstraComputeDebug = lazy(() => import("@/components/astra/AstraComputeDebug"));

const MACHINA_TABS = [
  { key: "model-lab", label: "Model Lab", icon: SlidersHorizontal },
  { key: "formula-sandbox", label: "Formula Sandbox", icon: FlaskConical },
  { key: "backtest", label: "Backtest Console", icon: BarChart3 },
  { key: "saved", label: "Saved Models", icon: Save },
  { key: "compute-debug", label: "Compute Debug", icon: Bug },
] as const;

type MachinaTab = typeof MACHINA_TABS[number]["key"];

const STAT_TYPES = ["PTS", "REB", "AST", "PRA", "FG3M", "PR", "PA", "RA", "STL", "BLK", "TOV"];

const ENGINE_COMPONENTS = [
  { key: "momentum", label: "Momentum", defaultWeight: 15, defaultOn: true },
  { key: "streak", label: "Streak", defaultWeight: 10, defaultOn: true },
  { key: "usage_shift", label: "Usage Shift", defaultWeight: 12, defaultOn: true },
  { key: "defense_difficulty", label: "Defense Difficulty", defaultWeight: 18, defaultOn: true },
  { key: "astro", label: "Astro", defaultWeight: 8, defaultOn: true },
  { key: "matchup", label: "Matchup", defaultWeight: 20, defaultOn: true },
  { key: "injury_ripple", label: "Injury Ripple", defaultWeight: 7, defaultOn: true },
  { key: "correlation", label: "Correlation", defaultWeight: 10, defaultOn: false },
];

// ── Model Lab ──
function ModelLab() {
  const [statType, setStatType] = useState("PTS");
  const [engines, setEngines] = useState(
    ENGINE_COMPONENTS.map(e => ({ ...e, on: e.defaultOn, weight: e.defaultWeight }))
  );

  const totalWeight = engines.filter(e => e.on).reduce((s, e) => s + e.weight, 0);
  const mockProjection = 24.7;
  const mockEdge = 62;
  const mockProb = 0.64;
  const mockConf = "Strong";

  const toggleEngine = (key: string) => {
    setEngines(prev => prev.map(e => e.key === key ? { ...e, on: !e.on } : e));
  };

  const setWeight = (key: string, val: number) => {
    setEngines(prev => prev.map(e => e.key === key ? { ...e, weight: val } : e));
  };

  return (
    <div className="space-y-5">
      {/* Stat selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stat Type</span>
        <Select value={statType} onValueChange={setStatType}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAT_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Engine toggles + weights */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Engine Components</h4>
        {engines.map(eng => (
          <div key={eng.key} className="cosmic-card rounded-lg p-3 flex items-center gap-3">
            <Switch checked={eng.on} onCheckedChange={() => toggleEngine(eng.key)} />
            <div className="flex-1 min-w-0">
              <span className={cn("text-xs font-semibold", eng.on ? "text-foreground" : "text-muted-foreground")}>{eng.label}</span>
              {eng.on && (
                <div className="flex items-center gap-2 mt-1">
                  <Slider
                    value={[eng.weight]}
                    onValueChange={([v]) => setWeight(eng.key, v)}
                    min={0} max={50} step={1}
                    className="flex-1"
                  />
                  <span className="text-[10px] font-bold text-muted-foreground tabular-nums w-6 text-right">{eng.weight}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground">
          Total weight: <span className="font-bold text-foreground">{totalWeight}</span>
        </p>
      </div>

      {/* Live output preview */}
      <div className="cosmic-card rounded-xl p-4 space-y-3">
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Output Preview</h4>
        <div className="grid grid-cols-2 gap-2">
          <OutputBox label="Projection" value={mockProjection.toFixed(1)} />
          <OutputBox label="Edge Score" value={mockEdge.toString()} />
          <OutputBox label="Probability" value={`${(mockProb * 100).toFixed(0)}%`} />
          <OutputBox label="Confidence" value={mockConf} />
        </div>
        <p className="text-[10px] text-muted-foreground italic">Baseline: 23.1 · Δ +1.6</p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5" onClick={() => toast.success("Model saved")}>
          <Save className="h-3.5 w-3.5" /> Save Model
        </Button>
        <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5" onClick={() => toast.info("Duplicated")}>
          <Copy className="h-3.5 w-3.5" /> Duplicate
        </Button>
        <Button variant="default" size="sm" className="flex-1 text-xs gap-1.5" onClick={() => toast.success("Test run complete")}>
          <Play className="h-3.5 w-3.5" /> Run Test
        </Button>
      </div>
    </div>
  );
}

// ── Formula Sandbox ──
function FormulaSandbox() {
  const [selectedFormula, setSelectedFormula] = useState("edge_score");
  const [vars, setVars] = useState<Record<string, number>>({ mu: 25.3, line: 23.5, sigma: 4.2 });

  const formulas: Record<string, { name: string; text: string; plain: string; variables: string[] }> = {
    edge_score: {
      name: "Edge Score",
      text: "edge = (μ − line) / σ × 100 × conf_multiplier",
      plain: "How far the model projection exceeds the line, normalized by uncertainty and scaled by confidence.",
      variables: ["mu", "line", "sigma"],
    },
    logistic_prob: {
      name: "Logistic Probability",
      text: "P(over) = 1 / (1 + e^(-(μ − line) / σ))",
      plain: "The probability of clearing the line based on a logistic curve fitted to model mean and sigma.",
      variables: ["mu", "line", "sigma"],
    },
    momentum_mult: {
      name: "Momentum Multiplier",
      text: "mult = 1 + (hitL10 − 0.5) × momentum_weight",
      plain: "Scales projection based on recent over/under hit rate vs the 50% baseline.",
      variables: ["mu", "line", "sigma"],
    },
  };

  const f = formulas[selectedFormula];
  const computedEdge = vars.sigma > 0 ? ((vars.mu - vars.line) / vars.sigma * 100 * 0.65).toFixed(1) : "—";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Formula</span>
        <Select value={selectedFormula} onValueChange={setSelectedFormula}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(formulas).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="cosmic-card rounded-xl p-4 space-y-2">
        <p className="text-xs font-mono text-primary">{f.text}</p>
        <p className="text-[10px] text-muted-foreground italic">{f.plain}</p>
      </div>

      <div className="space-y-2">
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Variables</h4>
        {f.variables.map(v => (
          <div key={v} className="flex items-center gap-3">
            <span className="text-xs font-mono text-foreground w-12">{v}</span>
            <Input
              type="number"
              step="0.1"
              value={vars[v] ?? 0}
              onChange={e => setVars(prev => ({ ...prev, [v]: parseFloat(e.target.value) || 0 }))}
              className="h-8 text-xs w-24"
            />
          </div>
        ))}
      </div>

      <div className="cosmic-card rounded-xl p-4 text-center">
        <p className="text-[10px] text-muted-foreground">Output</p>
        <p className="text-2xl font-bold text-primary tabular-nums">{computedEdge}</p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5" onClick={() => toast.success("Formula variant saved")}>
          <Save className="h-3.5 w-3.5" /> Save Variant
        </Button>
        <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5" onClick={() => toast.info("Sent to model")}>
          <Play className="h-3.5 w-3.5" /> Test in Model
        </Button>
      </div>
    </div>
  );
}

// ── Backtest Console ──
function BacktestConsole() {
  const [league, setLeague] = useState("NBA");
  const [marketType, setMarketType] = useState("points");
  const [running, setRunning] = useState(false);

  const mockResults = {
    hitRate: 58.3,
    roi: 4.7,
    avgEdge: 2.1,
    totalGames: 412,
    byConf: [
      { tier: "Elite", hitRate: 71.2, count: 45 },
      { tier: "Strong", hitRate: 62.1, count: 98 },
      { tier: "Playable", hitRate: 55.8, count: 142 },
      { tier: "Watch", hitRate: 48.9, count: 127 },
    ],
  };

  const handleRun = () => {
    setRunning(true);
    setTimeout(() => { setRunning(false); toast.success("Backtest complete"); }, 1500);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">League</span>
          <Select value={league} onValueChange={setLeague}>
            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["NBA", "NFL", "NHL", "MLB"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Market</span>
          <Select value={marketType} onValueChange={setMarketType}>
            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["points", "rebounds", "assists", "threes", "pts_reb_ast"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Date Range</span>
          <div className="flex gap-1 mt-1">
            <Input type="date" defaultValue="2025-10-01" className="h-8 text-xs flex-1" />
            <Input type="date" defaultValue="2026-03-01" className="h-8 text-xs flex-1" />
          </div>
        </div>
        <div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Model</span>
          <Select defaultValue="nebula_v2">
            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nebula_v1">NebulaProp v1</SelectItem>
              <SelectItem value="nebula_v2">NebulaProp v2</SelectItem>
              <SelectItem value="live_beta">Live Prop Beta</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={handleRun} disabled={running} className="w-full text-xs gap-1.5">
        {running ? <Cpu className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        {running ? "Running Backtest..." : "Run Backtest"}
      </Button>

      {/* Results */}
      <div className="cosmic-card rounded-xl p-4 space-y-3">
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Results</h4>
        <div className="grid grid-cols-4 gap-2">
          <OutputBox label="Hit Rate" value={`${mockResults.hitRate}%`} />
          <OutputBox label="ROI" value={`${mockResults.roi}%`} />
          <OutputBox label="Avg Edge" value={`+${mockResults.avgEdge}`} />
          <OutputBox label="Games" value={mockResults.totalGames.toString()} />
        </div>

        <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pt-2">By Confidence Tier</h5>
        <div className="space-y-1.5">
          {mockResults.byConf.map(c => (
            <div key={c.tier} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{c.tier}</span>
              <div className="flex items-center gap-3">
                <span className="font-bold tabular-nums text-foreground">{c.hitRate}%</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">n={c.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Saved Models ──
function SavedModels() {
  const models = [
    { name: "NebulaProp v1", version: "1.0", tags: ["baseline"], date: "2025-11-15", active: false },
    { name: "NebulaProp v2", version: "2.0", tags: ["production"], date: "2026-01-20", active: true },
    { name: "Live Prop Beta", version: "0.9", tags: ["experimental", "live"], date: "2026-02-28", active: false },
    { name: "PRA Aggressive Build", version: "1.1", tags: ["pra", "high-weight"], date: "2026-03-01", active: false },
    { name: "Astro Heavy Build", version: "1.0", tags: ["astro", "experimental"], date: "2026-03-03", active: false },
  ];

  return (
    <div className="space-y-3">
      {models.map(m => (
        <div key={m.name} className={cn(
          "cosmic-card rounded-xl p-3 space-y-2",
          m.active && "border-primary/30 shadow-[0_0_12px_-4px] shadow-primary/20"
        )}>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-foreground">{m.name}</span>
              <span className="text-[10px] text-muted-foreground ml-2">v{m.version}</span>
            </div>
            {m.active && (
              <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 font-bold bg-cosmic-green/15 text-cosmic-green border-cosmic-green/30">
                Active
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {m.tags.map(t => (
              <span key={t} className="text-[8px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">{t}</span>
            ))}
            <span className="text-[9px] text-muted-foreground ml-auto">{m.date}</span>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => toast.info(`Loaded ${m.name}`)}>Load</Button>
            <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => toast.info("Duplicated")}>Duplicate</Button>
            <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => toast.info("Comparing...")}>Compare</Button>
            {!m.active && (
              <Button variant="default" size="sm" className="text-[10px] h-6 px-2 ml-auto" onClick={() => toast.success(`${m.name} activated`)}>Activate</Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Output helper ──
function OutputBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="cosmic-card rounded-lg p-2 text-center">
      <div className="text-[9px] text-muted-foreground font-medium">{label}</div>
      <div className="text-sm font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

// ── Main Machina Section ──
export default function MachinaSection() {
  const [activeTab, setActiveTab] = useState<MachinaTab>("model-lab");

  return (
    <div className="space-y-4">
      <div className="cosmic-card rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Machina</h3>
          <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 font-bold bg-primary/10 text-primary border-primary/20">Admin</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Model lab, formula sandbox, backtesting, and version control
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {MACHINA_TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-colors whitespace-nowrap shrink-0",
                activeTab === t.key
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3 w-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === "model-lab" && <ModelLab />}
      {activeTab === "formula-sandbox" && <FormulaSandbox />}
      {activeTab === "backtest" && <BacktestConsole />}
      {activeTab === "saved" && <SavedModels />}
      {activeTab === "compute-debug" && (
        <Suspense fallback={<div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /></div>}>
          <AstraComputeDebug />
        </Suspense>
      )}
    </div>
  );
}
