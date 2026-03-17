import { useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FACTOR_LIBRARY } from "@/lib/model-factors";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, BookOpen, Sigma, Database, ChevronDown, ChevronUp, Cpu, Info } from "lucide-react";

const UNIVERSAL_LEGEND = [
  {
    symbol: "μ",
    name: "Projected Mean (mu)",
    desc: "The model's projected average output for a stat. Weighted blend of Season Avg, L10, L5.",
    source: "player_game_stats → computed via model-engine.ts executeModel()",
    howToFind: "Run any engine on a player. The 'Projection' result is μ. Also available in nebula_prop_predictions.mu",
    plugIn: "Use as the center of a Normal distribution. Compare against Line (L) to compute Edge (Δ = μ - L).",
  },
  {
    symbol: "σ",
    name: "Standard Deviation (sigma)",
    desc: "Spread of recent performance around the mean. Measures volatility.",
    source: "player_game_stats → stdDev(last 10 game values)",
    howToFind: "Computed from L10 game logs. Also in nebula_prop_predictions.sigma and Manual Input 'Std Deviation' field.",
    plugIn: "Denominator in z-score: z = (μ - L) / σ. Higher σ = wider range = less certainty.",
  },
  {
    symbol: "L",
    name: "Sportsbook Line",
    desc: "The posted prop/total/spread line from the sportsbook.",
    source: "nba_player_props_live.line_value, player_props.line, or sgo_market_odds.line",
    howToFind: "Found on Trends page props, Game Detail prop tabs, or enter manually in Manual Input.",
    plugIn: "Subtracted from μ to get Edge. Used as threshold in hit-rate calculations.",
  },
  {
    symbol: "P",
    name: "Probability (P_over / P_under)",
    desc: "Model-estimated chance of clearing or missing the line.",
    source: "Computed: P = 1 / (1 + e^(-k·z)) where z = (μ - L) / σ",
    howToFind: "Displayed as 'Probability' in engine results. Also nebula_prop_predictions.p_over.",
    plugIn: "Compare vs Implied Probability from odds. If P_model > P_implied → positive edge.",
  },
  {
    symbol: "k",
    name: "Calibration Constant (kappa)",
    desc: "Tuning scalar for logistic transform. Controls curve steepness. Default 1.5.",
    source: "Hardcoded in model-engine.ts → logisticCdf(z * 1.5)",
    howToFind: "Fixed at 1.5 in default engine. Adjustable in custom model configurations.",
    plugIn: "Multiplied by z before logistic sigmoid. Higher k = more confident predictions at same edge.",
  },
  {
    symbol: "N",
    name: "Sample Size (games count)",
    desc: "Number of games in the lookback window (L5, L10, L20, or season).",
    source: "player_game_stats row count per player",
    howToFind: "Shown in Player Page stats panel. np_build_prop_features returns games_count.",
    plugIn: "Larger N → more reliable μ and σ. Small N (< 5) triggers wider σ floor (minimum 2.0).",
  },
  {
    symbol: "xᵢ",
    name: "Observed Value (game i stat)",
    desc: "Actual stat value recorded in a single game.",
    source: "player_game_stats.points / rebounds / assists etc. for period='full'",
    howToFind: "Visible in Player Page → Game Logs tab. Each row is one xᵢ.",
    plugIn: "Used to compute μ = Σxᵢ/N and σ = √(Σ(xᵢ - μ)²/N). Also determines hit rate vs L.",
  },
  {
    symbol: "Δ",
    name: "Delta / Edge",
    desc: "Difference between projection and line. Δ = μ - L.",
    source: "Computed in model-engine.ts: edge = projection - line",
    howToFind: "Shown as 'Edge' in every engine result. Positive = model favors Over.",
    plugIn: "Core signal. Divide by σ to get z-score. Multiply by stake for expected profit estimate.",
  },
  {
    symbol: "w",
    name: "Weight (factor importance)",
    desc: "Factor importance on 0-100 scale. Controls how much each input affects projection.",
    source: "custom_models.factors[].weight or FACTOR_LIBRARY[].defaultWeight",
    howToFind: "Set in Model Builder sliders. View defaults in Factor Source Map below.",
    plugIn: "Weighted average: base_proj = Σ(value_i × w_i) / Σ(w_i). Adjustment factors use normalized weights.",
  },
  {
    symbol: "z",
    name: "Z-Score (standardized edge)",
    desc: "Edge normalized by volatility: z = (μ - L) / σ. Measures edge in standard-deviation units.",
    source: "Computed in model-engine.ts",
    howToFind: "Shown in engine trace output. Also derivable from any Edge + σ pair.",
    plugIn: "Fed into logistic CDF: P = 1/(1+e^(-k·z)). z > 1.0 = strong signal, z > 2.0 = very strong.",
  },
];

const ENGINE_VARIABLE_MAP = [
  {
    engine: "NebulaProp (Core Distribution)",
    key: "nebula_prop",
    variables: [
      { var: "μ (mu)", fullName: "Projected Mean Stat Output", where: "nebula_prop_predictions.mu", howToGet: "Weighted blend of L5 (20%), L10 (30%), Season (50%) averages from player_game_stats" },
      { var: "σ (sigma)", fullName: "Stat Standard Deviation", where: "nebula_prop_predictions.sigma", howToGet: "StdDev of L10 game values, floored at 0.5" },
      { var: "P_over", fullName: "Over Probability", where: "nebula_prop_predictions.p_over", howToGet: "Normal CDF: P = Φ((μ - L) / σ)" },
      { var: "hit_l10", fullName: "Hit Rate Last 10", where: "nebula_prop_predictions.hit_l10", howToGet: "Count of L10 games where stat > line / 10" },
      { var: "edge_score_v11", fullName: "EdgeScore v11", where: "nebula_prop_predictions.edge_score_v11", howToGet: "100 × (P_model - P_implied) × env_mult × astro_mult" },
    ],
  },
  {
    engine: "PacePulse (Game Environment)",
    key: "pace_pulse",
    variables: [
      { var: "avg_pace", fullName: "Team Average Pace (possessions/48)", where: "team_season_pace.avg_pace", howToGet: "FGA + 0.44×FTA - OREB + TOV per game, averaged across season" },
      { var: "expected_poss", fullName: "Expected Game Possessions", where: "Computed: (home_pace + away_pace) / 2", howToGet: "np_build_pace_features() function" },
      { var: "off_rating", fullName: "Offensive Rating (pts/100 poss)", where: "team_season_pace.off_rating", howToGet: "From team_season_pace table, updated via seed-team-pace function" },
      { var: "def_rating", fullName: "Defensive Rating (pts/100 poss allowed)", where: "team_season_pace.def_rating", howToGet: "From team_season_pace table for opponent" },
      { var: "blowout_risk", fullName: "Blowout Probability (0-1)", where: "Computed: |net_rating_diff| / 30", howToGet: "Difference in team net ratings, normalized to 0-1" },
    ],
  },
  {
    engine: "TransitLift (Astro Adjustments)",
    key: "transit_lift",
    variables: [
      { var: "mars_boost", fullName: "Mars Transit Athletic Amplifier", where: "ce_astro_overrides.mars_boost", howToGet: "Manual override or calculated from Mars transit to natal chart" },
      { var: "mercury_chaos", fullName: "Mercury Retrograde Variance Modifier", where: "ce_astro_overrides.mercury_chaos", howToGet: "Active during Mercury Rx periods, affects Air signs most" },
      { var: "astro_mean_mult", fullName: "Astro Mean Multiplier", where: "ce_astro_overrides.astro_mean_multiplier", howToGet: "Composite multiplier applied to μ, capped at ±5%" },
      { var: "astro_conf_mult", fullName: "Astro Confidence Multiplier", where: "ce_astro_overrides.astro_conf_multiplier", howToGet: "Adjusts σ based on planetary harmony/dissonance" },
      { var: "sky_noise", fullName: "Sky Noise Level", where: "ce_astro_overrides.sky_noise", howToGet: "low/medium/high — number of active disruptive transits" },
    ],
  },
  {
    engine: "Monte Carlo Simulation",
    key: "monte_carlo",
    variables: [
      { var: "sim_count", fullName: "Simulation Iterations", where: "Hardcoded: 100 (SQL) or 1000+ (edge fn)", howToGet: "ce_monte_input_supermodel provides μ and σ per stat" },
      { var: "sim_mean", fullName: "Simulated Mean Output", where: "ce_monte_carlo results", howToGet: "Average of N random draws from Normal(μ, σ)" },
      { var: "over_hit_rate", fullName: "Simulated Over Hit %", where: "ce_monte_carlo results", howToGet: "Count(draws > L) / sim_count × 100" },
      { var: "P10 / P90", fullName: "10th / 90th Percentile", where: "ce_monte_carlo results", howToGet: "Sorted draws, pick 10% and 90% indices for range" },
    ],
  },
  {
    engine: "Edge Score Engine",
    key: "edge_score",
    variables: [
      { var: "edge_raw", fullName: "Raw Edge (μ - L)", where: "Computed", howToGet: "Projection minus sportsbook line" },
      { var: "P_model", fullName: "Model Probability", where: "From NebulaProp P_over", howToGet: "Normal CDF or logistic sigmoid of z-score" },
      { var: "P_implied", fullName: "Implied Probability from Odds", where: "From odds: |odds| / (|odds| + 100)", howToGet: "american_to_break_even_prob() SQL function or manual calc" },
      { var: "m_env", fullName: "Environment Multiplier", where: "From PacePulse pace band", howToGet: "get_pace_band() → slow=0.9, neutral=1.0, fast=1.05, blazing=1.1" },
      { var: "edge_v11", fullName: "EdgeScore v11 Final", where: "nebula_prop_predictions.edge_score_v11", howToGet: "100 × (P_model - P_implied) × m_env × m_astro" },
    ],
  },
  {
    engine: "Live Win Probability",
    key: "live_wp",
    variables: [
      { var: "score_diff", fullName: "Home Score - Away Score", where: "game_state_snapshots.home_score - away_score", howToGet: "Real-time from live score feed" },
      { var: "time_remaining", fullName: "Seconds Remaining in Game", where: "Computed from quarter + clock", howToGet: "get_elapsed_game_seconds() then T - elapsed" },
      { var: "wp_home", fullName: "Home Win Probability", where: "game_live_wp.wp_home", howToGet: "Logistic model: β₁·(SD/σ)·ln((T+1)/(remaining+1)) + β₃·poss + β₄·√(elapsed/T)" },
      { var: "fair_ml_home", fullName: "Fair Moneyline (Home)", where: "game_live_wp.fair_ml_home", howToGet: "Converted from wp_home: if ≥50% → -(wp/(1-wp))×100" },
    ],
  },
  {
    engine: "Volatility Engine",
    key: "volatility",
    variables: [
      { var: "cv", fullName: "Coefficient of Variation", where: "np_build_prop_features.coeff_of_var", howToGet: "σ / μ — higher = more volatile. CV > 0.4 = 'volatile' archetype" },
      { var: "consistency", fullName: "Consistency Score (1 - CV)", where: "Computed", howToGet: "1 - (σ / μ). Higher = more predictable player output" },
    ],
  },
  {
    engine: "Matchup Engine",
    key: "matchup",
    variables: [
      { var: "opp_def_rank", fullName: "Opponent Defensive Rank at Stat", where: "ce_defense_difficulty view", howToGet: "Normalized opp stats vs 30-day league averages" },
      { var: "matchup_diff", fullName: "Matchup Difficulty Score", where: "Computed from defense difficulty", howToGet: "Positive = easier matchup, negative = harder. Applied as adjustment multiplier." },
    ],
  },
  {
    engine: "Usage Engine",
    key: "usage",
    variables: [
      { var: "fga_l10", fullName: "FGA per Game (Last 10)", where: "player_game_stats.fg_attempted", howToGet: "Average FGA over last 10 games" },
      { var: "fga_season", fullName: "FGA per Game (Season)", where: "player_game_stats.fg_attempted", howToGet: "Season-long FGA average" },
      { var: "usage_shift", fullName: "Usage Rate Change (%)", where: "Computed: (fga_l10 - fga_season) / fga_season", howToGet: "Positive = increased usage recently. Drives ripple_multiplier_auto in ce_usage_shift." },
    ],
  },
];

const CALCULATION_PIPELINE = [
  { step: 1, name: "Base Projection", formula: "μ_base = (season_avg × w₁ + L10_avg × w₂ + L5_avg × w₃) / (w₁ + w₂ + w₃)", inputs: "season_avg, last_10_avg, last_5_avg + weights" },
  { step: 2, name: "Momentum Adjustment", formula: "mom = (L5_avg - L10_avg) / L10_avg", inputs: "L5 and L10 game averages" },
  { step: 3, name: "Usage Adjustment", formula: "usage_shift = (fga_l10 - fga_season) / fga_season", inputs: "FGA from player_game_stats" },
  { step: 4, name: "Matchup Adjustment", formula: "matchup_mod = opp_def_difficulty × normalized_weight × 0.2", inputs: "ce_defense_difficulty, factor weight" },
  { step: 5, name: "Pace Adjustment", formula: "pace_mod = ((matchup_pace - 100) / 100) × normalized_weight", inputs: "team_season_pace for both teams" },
  { step: 6, name: "Game Script", formula: "script_multipliers for Shootout/Grind/Blowout/Tight/OT", inputs: "Spread, pace, def ratings, fatigue" },
  { step: 7, name: "Astro Overlay", formula: "μ_final = μ_adj × astro_mean_mult (capped ±5%)", inputs: "ce_astro_overrides" },
  { step: 8, name: "Final Projection", formula: "μ = μ_base × clamp(adjustment_mult, 0.7, 1.3)", inputs: "All adjustment multipliers combined" },
  { step: 9, name: "Edge & Probability", formula: "Δ = μ - L, z = Δ/σ, P = 1/(1+e^(-1.5z))", inputs: "μ, σ, L" },
  { step: 10, name: "Confidence Tier", formula: "score = min(100, |Δ/L|×200 + P×30) → S/A/B/C", inputs: "Edge, probability" },
];

export default function MachinaFormulaReference() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedEngine, setExpandedEngine] = useState<string | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);

  const { data: formulas, isLoading: formulasLoading } = useQuery({
    queryKey: ["machina-formulas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ce_formulas")
        .select("*")
        .order("display_order")
        .order("formula_name");
      return data ?? [];
    },
  });

  const { data: engines } = useQuery({
    queryKey: ["machina-engines-ref"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ce_engine_registry")
        .select("engine_key, engine_name, description, purpose, input_objects, output_objects, layer, status")
        .order("display_order");
      return data ?? [];
    },
  });

  const filteredFormulas = formulas?.filter((f: any) =>
    !search || f.formula_name.toLowerCase().includes(search.toLowerCase()) || (f.category ?? "").toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const filteredFactors = FACTOR_LIBRARY.filter((f) =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.key.toLowerCase().includes(search.toLowerCase())
  );

  const filteredEngineVars = ENGINE_VARIABLE_MAP.filter((e) =>
    !search || e.engine.toLowerCase().includes(search.toLowerCase()) || e.variables.some(v => v.fullName.toLowerCase().includes(search.toLowerCase()))
  );

  if (formulasLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Page instructions */}
      <div className="cosmic-card rounded-xl p-4 space-y-1.5 border-primary/20">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <h2 className="text-sm font-bold text-foreground">Formula & Engine Reference</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Complete technical reference for every formula, variable, engine, and factor used in the CosmicEdge prediction system.
          These run automatically — you don't need to call them. Use this page to understand what drives each prediction.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed italic">
          Admin only · Find this under Machina → Reference tab
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search formulas, variables, engines..." className="pl-8 bg-secondary text-xs h-9" />
      </div>

      {/* 10-Step Calculation Pipeline */}
      <section>
        <button onClick={() => setShowPipeline(!showPipeline)} className="w-full flex items-center gap-1.5 mb-2">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-xs font-bold text-foreground">10-Step Prediction Pipeline</h3>
          <span className="text-[10px] text-muted-foreground ml-1">How every projection is built, step by step</span>
          {showPipeline ? <ChevronUp className="h-3 w-3 ml-auto text-muted-foreground" /> : <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />}
        </button>
        {showPipeline && (
          <div className="space-y-2">
            {CALCULATION_PIPELINE.map((step) => (
              <div key={step.step} className="px-4 py-3 rounded-xl bg-secondary/30 border border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary bg-primary/10 rounded-full h-6 w-6 flex items-center justify-center shrink-0">{step.step}</span>
                  <span className="text-xs font-semibold text-foreground">{step.name}</span>
                </div>
                <code className="block text-xs font-mono text-primary mt-1.5 whitespace-pre-wrap break-words leading-relaxed">{step.formula}</code>
                <p className="text-[11px] text-muted-foreground mt-1">Inputs: {step.inputs}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Universal Variable Legend — Enhanced */}
      <section>
        <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
          <Sigma className="h-3.5 w-3.5 text-primary" /> Universal Variable Legend
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {UNIVERSAL_LEGEND.map((v) => (
            <div key={v.symbol} className="px-4 py-3 rounded-xl bg-secondary/30 border border-border/50">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base font-bold font-mono text-primary">{v.symbol}</span>
                <span className="text-xs font-semibold text-foreground">{v.name}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{v.desc}</p>
              <div className="mt-2 space-y-1">
                <p className="text-[11px] text-muted-foreground"><span className="font-bold text-foreground/80">Source:</span> <code className="font-mono text-primary/80">{v.source}</code></p>
                <p className="text-[11px] text-muted-foreground"><span className="font-bold text-foreground/80">Find it:</span> {v.howToFind}</p>
                <p className="text-[11px] text-muted-foreground"><span className="font-bold text-foreground/80">Plug in:</span> {v.plugIn}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Engine Variable Maps */}
      <section>
        <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
          <Cpu className="h-3.5 w-3.5 text-primary" /> Engine Variables ({filteredEngineVars.length} engines)
        </h3>
        <div className="space-y-2">
          {filteredEngineVars.map((eng) => {
            const isOpen = expandedEngine === eng.key;
            return (
              <div key={eng.key} className="rounded-xl border border-border bg-card">
                <button onClick={() => setExpandedEngine(isOpen ? null : eng.key)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <Cpu className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground flex-1">{eng.engine}</span>
                  <Badge variant="outline" className="text-[8px] shrink-0">{eng.variables.length} vars</Badge>
                  {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 space-y-2 border-t border-border pt-3">
                    {eng.variables.map((v) => (
                      <div key={v.var} className="px-3 py-2 rounded-lg bg-secondary/20 border border-border/30">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-mono font-bold text-primary">{v.var}</span>
                          <span className="text-[10px] font-semibold text-foreground">{v.fullName}</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground"><span className="font-bold text-foreground/70">Where:</span> <code className="font-mono text-primary/80">{v.where}</code></p>
                        <p className="text-[9px] text-muted-foreground"><span className="font-bold text-foreground/70">How to get:</span> {v.howToGet}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Formulas */}
      <section>
        <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
          <BookOpen className="h-3.5 w-3.5 text-primary" /> Formula Registry ({filteredFormulas.length})
        </h3>
        <div className="space-y-2">
          {filteredFormulas.map((f: any) => {
            const isOpen = expandedId === f.id;
            return (
              <div key={f.id} className="rounded-xl border border-border bg-card">
                <button onClick={() => setExpandedId(isOpen ? null : f.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">{f.formula_name}</span>
                      {f.category && <Badge variant="outline" className="text-[8px]">{f.category}</Badge>}
                      {f.is_featured && <Badge className="text-[7px] bg-cosmic-gold">Featured</Badge>}
                    </div>
                    {f.plain_english && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{f.plain_english}</p>}
                  </div>
                  {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    {f.formula_text && (
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Equation</span>
                        <p className="text-xs font-mono text-primary mt-0.5 break-all">{f.formula_text}</p>
                      </div>
                    )}
                    {f.plain_english && (
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Plain English</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{f.plain_english}</p>
                      </div>
                    )}
                    {f.variables && typeof f.variables === "object" && (
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Variables</span>
                        <div className="space-y-1 mt-1">
                          {Object.entries(f.variables as Record<string, string>).map(([k, v]) => (
                            <div key={k} className="flex items-start gap-2 text-[10px]">
                              <span className="font-mono font-bold text-primary w-10 shrink-0">{k}</span>
                              <span className="text-muted-foreground">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {f.example_input && (
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Example</span>
                        <pre className="text-[10px] font-mono text-muted-foreground mt-0.5 whitespace-pre-wrap break-all">{JSON.stringify(f.example_input, null, 2)}</pre>
                        {f.example_output && <p className="text-[10px] font-mono text-cosmic-green mt-1">→ {JSON.stringify(f.example_output)}</p>}
                      </div>
                    )}
                    {f.notes && (
                      <p className="text-[10px] text-muted-foreground italic">{f.notes}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredFormulas.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No formulas match your search.</p>
          )}
        </div>
      </section>

      {/* Factor Source Map — responsive table */}
      <section>
        <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
          <Database className="h-3.5 w-3.5 text-primary" /> Factor Source Map ({filteredFactors.length})
        </h3>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left px-3 py-2 text-muted-foreground font-semibold">Factor</th>
                <th className="text-left px-2 py-2 text-muted-foreground font-semibold">Category</th>
                <th className="text-left px-2 py-2 text-muted-foreground font-semibold">Source Table</th>
                <th className="text-left px-2 py-2 text-muted-foreground font-semibold">Metric</th>
                <th className="text-center px-2 py-2 text-muted-foreground font-semibold">Live</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-semibold">Default W</th>
              </tr>
            </thead>
            <tbody>
              {filteredFactors.map((f) => (
                <tr key={f.key} className="border-t border-border/50">
                  <td className="px-3 py-1.5 text-foreground font-medium">{f.name}</td>
                  <td className="px-2 py-1.5"><Badge variant="outline" className="text-[8px]">{f.category}</Badge></td>
                  <td className="px-2 py-1.5 text-muted-foreground font-mono">{f.source ?? "—"}</td>
                  <td className="px-2 py-1.5 text-muted-foreground font-mono">{f.sourceMetric ?? "—"}</td>
                  <td className="text-center px-2 py-1.5">{f.live ? <span className="text-cosmic-green">●</span> : <span className="text-muted-foreground">○</span>}</td>
                  <td className="text-right px-3 py-1.5 font-mono text-foreground">{f.defaultWeight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile card view */}
        <div className="md:hidden space-y-2">
          {filteredFactors.map((f) => (
            <div key={f.key} className="px-3 py-2 rounded-lg bg-secondary/30 border border-border/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-foreground">{f.name}</span>
                <div className="flex items-center gap-1.5">
                  {f.live ? <span className="text-cosmic-green text-[10px]">● Live</span> : <span className="text-muted-foreground text-[10px]">○</span>}
                  <span className="font-mono text-[10px] text-foreground">w{f.defaultWeight}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[8px]">{f.category}</Badge>
                {f.source && <span className="text-[8px] font-mono text-muted-foreground">{f.source}</span>}
                {f.sourceMetric && <span className="text-[8px] font-mono text-primary/70">.{f.sourceMetric}</span>}
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Engine Registry */}
      {engines && engines.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
            <Sigma className="h-3.5 w-3.5 text-primary" /> Engine Registry ({engines.length})
          </h3>
          <div className="space-y-2">
            {engines.map((e: any) => (
              <div key={e.engine_key} className="px-3 py-2.5 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">{e.engine_name}</span>
                  <Badge variant="outline" className="text-[8px]">{e.layer ?? "core"}</Badge>
                  <Badge variant="outline" className={cn("text-[8px]", e.status === "active" ? "text-cosmic-green border-cosmic-green/30" : "")}>{e.status}</Badge>
                </div>
                {e.description && <p className="text-[10px] text-muted-foreground mt-0.5">{e.description}</p>}
                {e.purpose && <p className="text-[9px] text-muted-foreground italic mt-0.5">{e.purpose}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
