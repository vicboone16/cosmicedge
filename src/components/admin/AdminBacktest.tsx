import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { FlaskConical, Save, Trash2 } from "lucide-react";

const MODEL_WEIGHT_DEFS = [
  { key: "four_factors", label: "Four Factors", default: 20, nbaOnly: true, group: "Team" },
  { key: "efficiency", label: "Efficiency (ORtg/DRtg)", default: 20, nbaOnly: false, group: "Team" },
  { key: "pace", label: "Pace", default: 5, nbaOnly: true, group: "Team" },
  { key: "net_rating", label: "Net Rating", default: 10, nbaOnly: false, group: "Team" },
  { key: "log5", label: "Log5 Win Prob", default: 15, nbaOnly: false, group: "Team" },
  { key: "pythag_expectation", label: "Pythagorean", default: 10, nbaOnly: false, group: "Team" },
  { key: "home_away_splits", label: "Home/Away Splits", default: 15, nbaOnly: false, group: "Team" },
  { key: "schedule_fatigue", label: "Schedule Fatigue", default: 10, nbaOnly: false, group: "Team" },
  { key: "recent_form", label: "Recent Form", default: 10, nbaOnly: false, group: "Team" },
  { key: "h2h_history", label: "Head-to-Head", default: 5, nbaOnly: false, group: "Team" },
  { key: "game_score", label: "Game Score", default: 5, nbaOnly: true, group: "Player" },
  { key: "usage", label: "Usage Rate", default: 0, nbaOnly: true, group: "Player" },
  { key: "ppp", label: "Points/Possession", default: 0, nbaOnly: true, group: "Player" },
  { key: "points_per_shot", label: "Points/Shot", default: 0, nbaOnly: true, group: "Player" },
  { key: "plus_minus", label: "+/- Avg", default: 5, nbaOnly: true, group: "Player" },
];

const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  MODEL_WEIGHT_DEFS.map(d => [d.key, d.default])
);

export default function AdminBacktest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [btStart, setBtStart] = useState("");
  const [btEnd, setBtEnd] = useState("");
  const [btResult, setBtResult] = useState<any>(null);
  const [btWeights, setBtWeights] = useState<Record<string, number>>({ ...DEFAULT_WEIGHTS });
  const [presetName, setPresetName] = useState("");
  const [flatBet, setFlatBet] = useState(100);
  const [btLeagues, setBtLeagues] = useState<string[]>(["NBA"]);

  const { data: presets } = useQuery({
    queryKey: ["backtest-presets", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("backtest_presets")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const savePresetMutation = useMutation({
    mutationFn: async () => {
      if (!user || !presetName.trim()) throw new Error("Name required");
      const { error } = await supabase.from("backtest_presets").insert({
        user_id: user.id,
        name: presetName.trim(),
        home_away_splits: btWeights.home_away_splits ?? 15,
        schedule_fatigue: btWeights.schedule_fatigue ?? 10,
        recent_form: btWeights.recent_form ?? 10,
        h2h_history: btWeights.h2h_history ?? 5,
        weights_json: btWeights,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Preset saved" });
      setPresetName("");
      qc.invalidateQueries({ queryKey: ["backtest-presets"] });
    },
  });

  const deletePresetMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("backtest_presets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backtest-presets"] }),
  });

  const loadPreset = (preset: any) => {
    if (preset.weights_json && Object.keys(preset.weights_json).length > 0) {
      setBtWeights({ ...DEFAULT_WEIGHTS, ...preset.weights_json });
    } else {
      setBtWeights({
        ...DEFAULT_WEIGHTS,
        home_away_splits: preset.home_away_splits,
        schedule_fatigue: preset.schedule_fatigue,
        recent_form: preset.recent_form,
        h2h_history: preset.h2h_history,
      });
    }
    toast({ title: `Loaded "${preset.name}"` });
  };

  const backtestMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please log in to run backtests");

      const leaguesToRun = btLeagues.length > 0 ? btLeagues : ["NBA"];
      const allResults: any[] = [];

      for (const lg of leaguesToRun) {
        const resp = await supabase.functions.invoke("quant-engine", {
          body: { mode: "backtest", league: lg, date_start: btStart, date_end: btEnd, custom_weights: btWeights, flat_bet: flatBet },
        });
        if (resp.error) throw new Error(resp.error.message);
        allResults.push({ league: lg, ...resp.data.backtest });
      }

      if (allResults.length === 1) return allResults[0];

      const merged: any = {
        total_games: 0, total_picked: 0, correct_picks: 0,
        strength_breakdown: {} as Record<string, any>,
        layer_breakdown: {} as Record<string, any>,
        by_market: {} as Record<string, any>,
        by_league: {} as Record<string, any>,
        roi_simulation: { flat_bet: flatBet, total_wagered: 0, net_profit: 0, roi: 0 },
      };

      for (const r of allResults) {
        merged.total_games += r.total_games || 0;
        merged.total_picked += r.total_picked || 0;
        merged.correct_picks += r.correct_picks || 0;
        for (const [k, v] of Object.entries(r.strength_breakdown || {})) {
          const d = v as any;
          if (!merged.strength_breakdown[k]) merged.strength_breakdown[k] = { total: 0, correct: 0 };
          merged.strength_breakdown[k].total += d.total;
          merged.strength_breakdown[k].correct += d.correct;
        }
        for (const [k, v] of Object.entries(r.layer_breakdown || {})) {
          const d = v as any;
          if (!merged.layer_breakdown[k]) merged.layer_breakdown[k] = { total: 0, correct: 0 };
          merged.layer_breakdown[k].total += d.total;
          merged.layer_breakdown[k].correct += d.correct;
        }
        for (const [k, v] of Object.entries(r.by_market || {})) {
          const d = v as any;
          if (!merged.by_market[k]) merged.by_market[k] = { total: 0, correct: 0, total_wagered: 0, net_profit: 0 };
          merged.by_market[k].total += d.total;
          merged.by_market[k].correct += d.correct;
          merged.by_market[k].total_wagered += d.total_wagered;
          merged.by_market[k].net_profit += d.net_profit;
        }
        merged.roi_simulation.total_wagered += r.roi_simulation?.total_wagered || 0;
        merged.roi_simulation.net_profit += r.roi_simulation?.net_profit || 0;
        merged.by_league[r.league] = {
          total_picked: r.total_picked, correct_picks: r.correct_picks,
          accuracy: r.accuracy, roi: r.roi_simulation?.roi || 0,
        };
      }

      merged.accuracy = merged.total_picked > 0 ? +(merged.correct_picks / merged.total_picked * 100).toFixed(1) : 0;
      merged.roi_simulation.roi = merged.roi_simulation.total_wagered > 0
        ? +(merged.roi_simulation.net_profit / merged.roi_simulation.total_wagered * 100).toFixed(1) : 0;
      for (const v of Object.values(merged.strength_breakdown)) { const d = v as any; d.accuracy = d.total > 0 ? +(d.correct / d.total * 100).toFixed(1) : 0; }
      for (const v of Object.values(merged.layer_breakdown)) { const d = v as any; d.accuracy = d.total > 0 ? +(d.correct / d.total * 100).toFixed(1) : 0; }
      for (const v of Object.values(merged.by_market)) { const d = v as any; d.win_pct = d.total > 0 ? +(d.correct / d.total * 100).toFixed(1) : 0; d.roi = d.total_wagered > 0 ? +(d.net_profit / d.total_wagered * 100).toFixed(1) : 0; }

      return merged;
    },
    onSuccess: (data) => {
      setBtResult(data);
      toast({ title: "Backtest complete", description: `${data.total_picked} games analyzed` });
    },
    onError: (err: any) => {
      toast({ title: "Backtest failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-3">
      <div className="cosmic-card rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest flex items-center gap-1.5">
          <FlaskConical className="h-3.5 w-3.5" /> Astro Backtest Engine
        </h3>
        <p className="text-[10px] text-muted-foreground">Run astro verdicts on completed games and measure prediction accuracy.</p>

        {/* Multi-league selector */}
        <div>
          <label className="text-[9px] text-muted-foreground block mb-1">Leagues</label>
          <div className="flex gap-1.5">
            {["NBA", "NHL", "NFL", "MLB"].map(lg => {
              const isSelected = btLeagues.includes(lg);
              return (
                <button key={lg} onClick={() => setBtLeagues(prev => isSelected ? prev.filter(l => l !== lg) : [...prev, lg])}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    isSelected ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}>{lg}</button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] text-muted-foreground block mb-0.5">Start Date</label>
            <input type="date" value={btStart} onChange={e => setBtStart(e.target.value)}
              className="w-full bg-secondary/50 border border-border/50 rounded px-2 py-1 text-xs" />
          </div>
          <div>
            <label className="text-[9px] text-muted-foreground block mb-0.5">End Date</label>
            <input type="date" value={btEnd} onChange={e => setBtEnd(e.target.value)}
              className="w-full bg-secondary/50 border border-border/50 rounded px-2 py-1 text-xs" />
          </div>
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground block mb-0.5">Flat Bet Amount ($)</label>
          <Input type="number" min={1} value={flatBet} onChange={e => setFlatBet(Math.max(1, parseInt(e.target.value) || 100))} className="h-7 text-xs w-28" />
        </div>

        {/* Model Weight Sliders */}
        <div className="space-y-3 pt-2 border-t border-border/30">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Model Weights</h4>
          {["Team", "Player"].map(group => {
            const groupDefs = MODEL_WEIGHT_DEFS.filter(d => d.group === group);
            const visibleDefs = groupDefs.filter(d => !d.nbaOnly || btLeagues.includes("NBA"));
            if (visibleDefs.length === 0) return null;
            return (
              <div key={group} className="space-y-1.5">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{group} Models</p>
                {visibleDefs.map(def => (
                  <div key={def.key} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-foreground font-medium">
                        {def.label}
                        {def.nbaOnly && <span className="ml-1 text-[8px] text-primary/60 font-normal">NBA</span>}
                      </span>
                      <span className="text-[10px] text-primary font-bold tabular-nums w-8 text-right">{btWeights[def.key] ?? def.default}%</span>
                    </div>
                    <Slider value={[btWeights[def.key] ?? def.default]} onValueChange={([v]) => setBtWeights(prev => ({ ...prev, [def.key]: v }))} min={0} max={50} step={1} className="w-full" />
                  </div>
                ))}
              </div>
            );
          })}
          <button onClick={() => setBtWeights({ ...DEFAULT_WEIGHTS })} className="text-[9px] text-muted-foreground hover:text-foreground transition-colors">
            Reset to defaults
          </button>
        </div>

        {/* Preset Save/Load */}
        <div className="space-y-2 pt-2 border-t border-border/30">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Presets</h4>
          <div className="flex gap-1.5">
            <Input placeholder="Preset name..." value={presetName} onChange={e => setPresetName(e.target.value)} className="h-7 text-[10px] flex-1" />
            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => savePresetMutation.mutate()} disabled={!presetName.trim() || savePresetMutation.isPending}>
              <Save className="h-3 w-3 mr-1" />Save
            </Button>
          </div>
          {presets && presets.length > 0 && (
            <div className="space-y-1">
              {presets.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between bg-secondary/30 rounded px-2 py-1">
                  <button onClick={() => loadPreset(p)} className="text-[10px] font-medium text-foreground hover:text-primary transition-colors flex-1 text-left">
                    {p.name}
                    <span className="text-muted-foreground ml-1.5">
                      {p.weights_json && Object.keys(p.weights_json).length > 0 ? `(${Object.keys(p.weights_json).length} models)` : `(${p.home_away_splits}/${p.schedule_fatigue}/${p.recent_form}/${p.h2h_history})`}
                    </span>
                  </button>
                  <button onClick={() => deletePresetMutation.mutate(p.id)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button onClick={() => backtestMutation.mutate()} disabled={!btStart || !btEnd || btLeagues.length === 0 || backtestMutation.isPending} className="w-full text-xs" size="sm">
          {backtestMutation.isPending ? "Running backtest..." : `Run Backtest (${btLeagues.join(", ") || "select leagues"})`}
        </Button>
        {backtestMutation.isPending && <Progress value={undefined} className="h-1" />}
      </div>

      {btResult && (
        <div className="space-y-2">
          {/* Per-Market Type Cards */}
          {btResult.by_market && Object.keys(btResult.by_market).length > 0 && (
            <div className="space-y-2">
              {["spread", "moneyline", "total"].map(mkt => {
                const d = btResult.by_market[mkt];
                if (!d) return null;
                const isProfitable = d.roi >= 0;
                return (
                  <div key={mkt} className="cosmic-card rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold capitalize">{mkt === "total" ? "Total Points" : mkt}</h4>
                        <p className="text-[10px] text-muted-foreground">based on {d.total} bets</p>
                      </div>
                      <div className="flex items-center gap-6 text-center">
                        <div>
                          <p className="text-[9px] text-muted-foreground">Win</p>
                          <p className="text-lg font-bold tabular-nums">{d.win_pct}%</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">ROI</p>
                          <p className="text-lg font-bold tabular-nums">{d.roi}%</p>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${isProfitable ? "bg-cosmic-green/20 text-cosmic-green" : "bg-cosmic-red/20 text-cosmic-red"}`}>
                            {isProfitable ? "Profitable" : "Loss"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ROI Comparison */}
          {btResult.roi_simulation && (
            <div className="cosmic-card rounded-xl p-4 space-y-3">
              <div>
                <h4 className="text-xs font-semibold">
                  {btResult.roi_simulation.roi >= 7 ? "🏆 This Model Wins Across the Board" :
                   btResult.roi_simulation.roi >= 4 ? "🏆 This Model Matches the Pros" :
                   btResult.roi_simulation.roi >= 0 ? "📊 This Model is Profitable" :
                   "📉 Model Needs Tuning"}
                </h4>
              </div>
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium w-24 text-right">This Model</span>
                  <div className="flex-1 h-4 bg-secondary/30 rounded-full overflow-hidden relative">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(2, (btResult.roi_simulation.roi + 10) * 3))}%` }} />
                  </div>
                  <span className={`text-[10px] font-bold tabular-nums w-14 text-right ${btResult.roi_simulation.roi >= 0 ? "text-cosmic-green" : "text-cosmic-red"}`}>
                    {btResult.roi_simulation.roi > 0 ? "+" : ""}{btResult.roi_simulation.roi}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium w-24 text-right text-muted-foreground">Pro Bettor</span>
                  <div className="flex-1 h-4 bg-secondary/30 rounded-full overflow-hidden relative">
                    <div className="h-full bg-muted-foreground/50 rounded-full" style={{ width: `${(5.5 + 10) * 3}%` }} />
                  </div>
                  <span className="text-[10px] font-medium tabular-nums w-14 text-right text-muted-foreground">4–7%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium w-24 text-right text-muted-foreground">Casual Bettor</span>
                  <div className="flex-1 h-4 bg-secondary/30 rounded-full overflow-hidden relative">
                    <div className="h-full bg-muted-foreground/30 rounded-full" style={{ width: `${(-5 + 10) * 3}%` }} />
                  </div>
                  <span className="text-[10px] font-medium tabular-nums w-14 text-right text-muted-foreground">-5%</span>
                </div>
              </div>
            </div>
          )}

          {/* Overall Accuracy */}
          <div className="cosmic-card rounded-xl p-4">
            <h4 className="text-xs font-semibold mb-2">Overall Accuracy</h4>
            <div className="flex items-center gap-4">
              <span className="text-2xl font-bold text-primary">{btResult.accuracy}%</span>
              <div className="text-[10px] text-muted-foreground">
                <p>{btResult.correct_picks} / {btResult.total_picked} correct picks</p>
                <p>{btResult.total_games} total games analyzed</p>
              </div>
            </div>
          </div>

          {/* Per-League Breakdown */}
          {btResult.by_league && Object.keys(btResult.by_league).length > 1 && (
            <div className="cosmic-card rounded-xl p-4">
              <h4 className="text-xs font-semibold mb-2">By League</h4>
              <div className="space-y-1.5">
                {Object.entries(btResult.by_league).map(([lg, data]: [string, any]) => (
                  <div key={lg} className="flex items-center justify-between text-[10px]">
                    <span className="font-bold">{lg}</span>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums">{data.accuracy}% win</span>
                      <span className={`tabular-nums font-semibold ${data.roi >= 0 ? "text-cosmic-green" : "text-cosmic-red"}`}>
                        {data.roi >= 0 ? "+" : ""}{data.roi}% ROI
                      </span>
                      <span className="text-muted-foreground">({data.correct_picks}/{data.total_picked})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ROI Summary */}
          {btResult.roi_simulation && (
            <div className="cosmic-card rounded-xl p-4">
              <h4 className="text-xs font-semibold mb-2">ROI Simulation (Flat ${flatBet} Bets)</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[9px] text-muted-foreground">Wagered</p>
                  <p className="text-sm font-bold tabular-nums">${btResult.roi_simulation.total_wagered?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground">Net P&L</p>
                  <p className={`text-sm font-bold tabular-nums ${btResult.roi_simulation.net_profit >= 0 ? "text-cosmic-green" : "text-cosmic-red"}`}>
                    {btResult.roi_simulation.net_profit >= 0 ? "+" : ""}${btResult.roi_simulation.net_profit?.toFixed(0)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground">ROI</p>
                  <p className={`text-sm font-bold tabular-nums ${btResult.roi_simulation.roi >= 0 ? "text-cosmic-green" : "text-cosmic-red"}`}>
                    {btResult.roi_simulation.roi >= 0 ? "+" : ""}{btResult.roi_simulation.roi}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Strength Breakdown */}
          {btResult.strength_breakdown && (
            <div className="cosmic-card rounded-xl p-4">
              <h4 className="text-xs font-semibold mb-2">By Prediction Strength</h4>
              <div className="space-y-1.5">
                {Object.entries(btResult.strength_breakdown).map(([tier, data]: [string, any]) => (
                  data.total > 0 && (
                    <div key={tier} className="flex items-center justify-between text-[10px]">
                      <span className="capitalize font-medium">{tier}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={data.accuracy} className="w-20 h-1.5" />
                        <span className="tabular-nums font-semibold w-12 text-right">{data.accuracy}%</span>
                        <span className="text-muted-foreground w-12 text-right">({data.correct}/{data.total})</span>
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Layer Breakdown */}
          {btResult.layer_breakdown && (
            <div className="cosmic-card rounded-xl p-4">
              <h4 className="text-xs font-semibold mb-2">By Astro Layer</h4>
              <div className="space-y-1.5">
                {Object.entries(btResult.layer_breakdown).map(([layer, data]: [string, any]) => (
                  data.total > 0 && (
                    <div key={layer} className="flex items-center justify-between text-[10px]">
                      <span className="capitalize font-medium">{layer.replace(/_/g, " ")}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={data.accuracy} className="w-20 h-1.5" />
                        <span className="tabular-nums font-semibold w-12 text-right">{data.accuracy}%</span>
                        <span className="text-muted-foreground w-12 text-right">({data.correct}/{data.total})</span>
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
