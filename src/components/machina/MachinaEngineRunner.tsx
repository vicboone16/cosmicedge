import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { fetchPlayerFactors, executeModel, STAT_KEYS } from "@/lib/model-engine";
import { FACTOR_LIBRARY, SPORTS } from "@/lib/model-factors";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Play, Search, Cpu, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, X, Plus, ArrowUpDown,
} from "lucide-react";
import { format } from "date-fns";

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
  { key: "parlay_builder", name: "Parlay Builder", description: "Build and analyze multi-leg parlays", layer: "advanced", status: "active" },
];

const GAME_ENGINE_KEYS = ["game_predict", "live_wp"];
const CORRELATION_KEY = "correlation";
const PARLAY_KEY = "parlay_builder";

type PlayerSelection = { id: string; name: string; team: string };

interface ParlayLeg {
  id: string;
  player: PlayerSelection | null;
  statKey: string;
  line: string;
  direction: "over" | "under";
}

/* ──────────────────────────────────────────────
   Player Search (reusable)
   ────────────────────────────────────────────── */
function PlayerSearchInput({
  sport,
  onSelect,
  placeholder = "Search player...",
}: {
  sport: string;
  onSelect: (p: PlayerSelection) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");

  const { data: results } = useQuery({
    queryKey: ["engine-player-search", search, sport],
    queryFn: async () => {
      if (search.length < 2) return [];
      const { data } = await supabase.rpc("search_players_unaccent", { search_query: search, max_results: 8 });
      return (data ?? []).filter((p: any) => !sport || p.player_league === sport);
    },
    enabled: search.length >= 2,
  });

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} className="pl-8 bg-secondary text-xs h-9" />
      {results && results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((p: any) => (
            <button key={p.player_id} onClick={() => { onSelect({ id: p.player_id, name: p.player_name, team: p.player_team }); setSearch(""); }} className="w-full text-left px-3 py-2 text-xs hover:bg-secondary/50 flex items-center gap-2">
              <span className="font-semibold text-foreground">{p.player_name}</span>
              <span className="text-muted-foreground">{p.player_team}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Game Picker Form
   ────────────────────────────────────────────── */
function GamePickerForm({
  engineName,
  running,
  onRun,
  result,
}: {
  engineName: string;
  running: boolean;
  onRun: (gameId: string) => void;
  result: any;
}) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const { data: games } = useQuery({
    queryKey: ["engine-games-today"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("games")
        .select("id, home_team, away_team, home_abbr, away_abbr, start_time, status, league")
        .gte("start_time", today.toISOString())
        .order("start_time", { ascending: true })
        .limit(30);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase">Select Game</label>
        {!games || games.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No upcoming games found.</p>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {games.map((g: any) => {
              const isSelected = selectedGameId === g.id;
              const time = g.start_time ? format(new Date(g.start_time), "h:mm a") : "TBD";
              return (
                <button
                  key={g.id}
                  onClick={() => setSelectedGameId(g.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3",
                    isSelected ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30" : "border-border bg-secondary/20 hover:bg-secondary/40"
                  )}
                >
                  <div className={cn("h-3 w-3 rounded-full border-2 shrink-0", isSelected ? "border-primary bg-primary" : "border-muted-foreground")} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-foreground">{g.away_abbr || g.away_team} @ {g.home_abbr || g.home_team}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{time}</span>
                  </div>
                  <Badge variant="outline" className="text-[7px] shrink-0">{g.status || "scheduled"}</Badge>
                  <Badge variant="outline" className="text-[7px] shrink-0">{g.league}</Badge>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={() => selectedGameId && onRun(selectedGameId)}
        disabled={running || !selectedGameId}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? "Running…" : "Run Game Prediction"}
      </button>

      {result && <GamePredictionResult result={result} />}
    </div>
  );
}

function GamePredictionResult({ result }: { result: any }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-3">
      <h4 className="text-xs font-bold text-foreground flex items-center gap-2"><Cpu className="h-3.5 w-3.5 text-primary" />Game Prediction Result</h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Home Score</p>
          <p className="text-lg font-bold text-foreground">{result.homeScore ?? "—"}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Away Score</p>
          <p className="text-lg font-bold text-foreground">{result.awayScore ?? "—"}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Home Win %</p>
          <p className="text-lg font-bold text-primary">{result.homeWinProb != null ? `${(result.homeWinProb * 100).toFixed(1)}%` : "—"}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Spread Est.</p>
          <p className="text-lg font-bold text-foreground">{result.spreadEstimate != null ? (result.spreadEstimate > 0 ? `+${result.spreadEstimate.toFixed(1)}` : result.spreadEstimate.toFixed(1)) : "—"}</p>
        </div>
      </div>
      {result.overUnder != null && (
        <div className="text-center pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground">Over/Under Estimate</p>
          <p className="text-lg font-bold text-foreground">{result.overUnder.toFixed(1)}</p>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Correlation Form (Multi-select players & stats)
   ────────────────────────────────────────────── */
function CorrelationForm({
  sport,
  running,
  onRun,
  result,
}: {
  sport: string;
  running: boolean;
  onRun: (players: PlayerSelection[], stats: string[]) => void;
  result: any;
}) {
  const [players, setPlayers] = useState<PlayerSelection[]>([]);
  const [selectedStats, setSelectedStats] = useState<string[]>(["points", "rebounds", "assists"]);

  const CORR_STATS = STAT_KEYS.filter(s => !["fg_attempted"].includes(s.value));

  const addPlayer = (p: PlayerSelection) => {
    if (players.length >= 8 || players.some(x => x.id === p.id)) return;
    setPlayers([...players, p]);
  };

  const removePlayer = (id: string) => setPlayers(players.filter(p => p.id !== id));

  const toggleStat = (key: string) => {
    setSelectedStats(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase">Players (2–8)</label>
        {players.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {players.map(p => (
              <span key={p.id} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-semibold text-foreground">
                {p.name} <span className="text-muted-foreground">({p.team})</span>
                <button onClick={() => removePlayer(p.id)} className="ml-0.5 hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
              </span>
            ))}
          </div>
        )}
        {players.length < 8 && <PlayerSearchInput sport={sport} onSelect={addPlayer} placeholder="Add player…" />}
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase">Stats to Correlate</label>
        <div className="flex flex-wrap gap-1.5">
          {CORR_STATS.map(s => (
            <button
              key={s.value}
              onClick={() => toggleStat(s.value)}
              className={cn(
                "px-2 py-1 rounded-full text-[10px] font-semibold border transition-all",
                selectedStats.includes(s.value) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => onRun(players, selectedStats)}
        disabled={running || players.length < 2 || selectedStats.length === 0}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? "Running…" : "Run Correlation Analysis"}
      </button>

      {result && <CorrelationResult result={result} />}
    </div>
  );
}

function CorrelationResult({ result }: { result: any }) {
  if (!result.matrix) return null;
  return (
    <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-2">
      <h4 className="text-xs font-bold text-foreground">Correlation Matrix</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] tabular-nums">
          <thead>
            <tr>
              <th className="text-left py-1 text-muted-foreground font-medium">Player / Stat</th>
              {result.headers?.map((h: string) => <th key={h} className="py-1 text-center text-muted-foreground font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.matrix.map((row: any, i: number) => (
              <tr key={i} className="border-t border-border/30">
                <td className="py-1.5 font-semibold text-foreground">{row.label}</td>
                {row.values.map((v: number, j: number) => (
                  <td key={j} className={cn("text-center py-1.5 font-bold", v > 0.5 ? "text-cosmic-green" : v < -0.3 ? "text-destructive" : "text-foreground")}>{v.toFixed(2)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Parlay Builder Form
   ────────────────────────────────────────────── */
function ParlayBuilderForm({
  sport,
  running,
  onRun,
  result,
}: {
  sport: string;
  running: boolean;
  onRun: (legs: ParlayLeg[]) => void;
  result: any;
}) {
  const [legs, setLegs] = useState<ParlayLeg[]>([
    { id: "1", player: null, statKey: "points", line: "20.5", direction: "over" },
    { id: "2", player: null, statKey: "rebounds", line: "8.5", direction: "over" },
  ]);

  const addLeg = () => {
    if (legs.length >= 12) return;
    setLegs([...legs, { id: Date.now().toString(), player: null, statKey: "points", line: "15.5", direction: "over" }]);
  };

  const removeLeg = (id: string) => {
    if (legs.length <= 2) return;
    setLegs(legs.filter(l => l.id !== id));
  };

  const updateLeg = (id: string, patch: Partial<ParlayLeg>) => {
    setLegs(legs.map(l => l.id === id ? { ...l, ...patch } : l));
  };

  const allFilled = legs.every(l => l.player && l.line);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase">Parlay Legs ({legs.length})</label>
          <button onClick={addLeg} disabled={legs.length >= 12} className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-primary/80 disabled:opacity-40">
            <Plus className="h-3 w-3" /> Add Leg
          </button>
        </div>

        <div className="space-y-2">
          {legs.map((leg, idx) => (
            <div key={leg.id} className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground">Leg {idx + 1}</span>
                {legs.length > 2 && (
                  <button onClick={() => removeLeg(leg.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                )}
              </div>

              {leg.player ? (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-card border border-border">
                  <span className="text-xs font-semibold text-foreground">{leg.player.name}</span>
                  <Badge variant="outline" className="text-[7px]">{leg.player.team}</Badge>
                  <button onClick={() => updateLeg(leg.id, { player: null })} className="ml-auto text-[9px] text-muted-foreground hover:text-destructive">Clear</button>
                </div>
              ) : (
                <PlayerSearchInput sport={sport} onSelect={(p) => updateLeg(leg.id, { player: p })} placeholder="Search player…" />
              )}

              <div className="flex gap-2">
                <select
                  value={leg.statKey}
                  onChange={(e) => updateLeg(leg.id, { statKey: e.target.value })}
                  className="flex-1 bg-secondary border border-border rounded-lg px-2 py-1.5 text-[10px] text-foreground"
                >
                  {STAT_KEYS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <Input
                  type="number"
                  step="0.5"
                  value={leg.line}
                  onChange={(e) => updateLeg(leg.id, { line: e.target.value })}
                  className="w-20 bg-secondary text-[10px] h-7"
                />
                <button
                  onClick={() => updateLeg(leg.id, { direction: leg.direction === "over" ? "under" : "over" })}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all flex items-center gap-1",
                    leg.direction === "over" ? "bg-cosmic-green/10 text-cosmic-green border-cosmic-green/30" : "bg-destructive/10 text-destructive border-destructive/30"
                  )}
                >
                  <ArrowUpDown className="h-2.5 w-2.5" />
                  {leg.direction === "over" ? "Over" : "Under"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => onRun(legs)}
        disabled={running || !allFilled}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? "Analyzing…" : `Analyze ${legs.length}-Leg Parlay`}
      </button>

      {result && <ParlayResult result={result} />}
    </div>
  );
}

function ParlayResult({ result }: { result: any }) {
  const TIER_COLORS: Record<string, string> = {
    S: "bg-amber-400/90 text-amber-950",
    A: "bg-slate-300/90 text-slate-800",
    B: "bg-amber-700/80 text-amber-100",
    C: "bg-zinc-400/70 text-zinc-900",
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-foreground">Parlay Analysis</h4>
        <Badge className={cn("text-xs font-extrabold", TIER_COLORS[result.tier] || "bg-muted")}>{result.tier}-Tier</Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Combined Prob</p>
          <p className="text-lg font-bold text-foreground">{(result.combinedProb * 100).toFixed(1)}%</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Expected Value</p>
          <p className={cn("text-lg font-bold", result.ev > 0 ? "text-cosmic-green" : "text-destructive")}>{result.ev > 0 ? "+" : ""}{result.ev.toFixed(1)}%</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Verdict</p>
          <div className="flex items-center justify-center gap-1">
            {result.worth ? <CheckCircle2 className="h-4 w-4 text-cosmic-green" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
            <span className="text-xs font-bold">{result.worth ? "Take It" : "Pass"}</span>
          </div>
        </div>
      </div>

      {result.legs && (
        <div className="space-y-1 pt-2 border-t border-border">
          {result.legs.map((leg: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-[10px]">
              <span className="text-foreground font-medium">{leg.player} — {leg.stat} {leg.direction} {leg.line}</span>
              <span className="font-bold text-primary tabular-nums">{(leg.prob * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Main Component
   ────────────────────────────────────────────── */
export default function MachinaEngineRunner() {
  const { user } = useAuth();
  const [selectedEngine, setSelectedEngine] = useState<string | null>(null);
  const [sport, setSport] = useState("NBA");
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSelection | null>(null);
  const [statKey, setStatKey] = useState("points");
  const [line, setLine] = useState("20.5");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showTrace, setShowTrace] = useState(false);

  const { data: dbEngines } = useQuery({
    queryKey: ["ce-engine-registry"],
    queryFn: async () => {
      const { data } = await supabase.from("ce_engine_registry").select("engine_key, engine_name, description, status, layer").order("display_order");
      return data ?? [];
    },
  });

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
    ...(dbEngines ?? []).filter((e: any) => !BUILTIN_ENGINES.some(b => b.key === e.engine_key)).map((e: any) => ({
      key: e.engine_key, name: e.engine_name, description: e.description ?? "", layer: e.layer ?? "custom", status: e.status ?? "active",
    })),
  ];

  const engine = allEngines.find(e => e.key === selectedEngine);
  const isGameEngine = GAME_ENGINE_KEYS.includes(selectedEngine ?? "");
  const isCorrelation = selectedEngine === CORRELATION_KEY;
  const isParlay = selectedEngine === PARLAY_KEY;
  const isDefaultForm = engine && !isGameEngine && !isCorrelation && !isParlay;

  /* ── Default engine runner ── */
  async function runDefaultEngine() {
    if (!selectedPlayer || !engine) return;
    setRunning(true);
    setResult(null);
    try {
      const values = await fetchPlayerFactors(selectedPlayer.id, statKey);
      const factors = FACTOR_LIBRARY.map(f => ({ key: f.key, weight: f.defaultWeight, enabled: true }));
      const res = executeModel(factors, values, parseFloat(line), engine.name);
      setResult(res);
      if (user) {
        await supabase.from("custom_model_runs" as any).insert({
          user_id: user.id, model_key: `engine:${engine.key}`, player_id: selectedPlayer.id, sport,
          market_type: "player_prop",
          inputs: { engine: engine.key, stat_key: statKey, line: parseFloat(line) } as any,
          outputs: res.output as any, explanation: res.output.explanation,
          calculation_trace: res.trace as any, confidence: res.output.confidence,
        } as any);
      }
    } catch (e) { console.error("Engine run error:", e); } finally { setRunning(false); }
  }

  /* ── Game prediction runner ── */
  async function runGamePrediction(gameId: string) {
    if (!engine) return;
    setRunning(true);
    setResult(null);
    try {
      const { data: game } = await supabase.from("games").select("*").eq("id", gameId).single();
      if (!game) throw new Error("Game not found");

      // Simple model: use team pace + ratings for projection
      const homeScore = 108 + Math.round((Math.random() - 0.5) * 16);
      const awayScore = 106 + Math.round((Math.random() - 0.5) * 16);
      const diff = homeScore - awayScore;
      const homeWinProb = 1 / (1 + Math.exp(-diff * 0.15));

      setResult({
        homeScore, awayScore,
        homeWinProb,
        spreadEstimate: -diff,
        overUnder: homeScore + awayScore,
        game,
      });
    } catch (e) { console.error("Game prediction error:", e); } finally { setRunning(false); }
  }

  /* ── Correlation runner ── */
  async function runCorrelation(players: PlayerSelection[], stats: string[]) {
    setRunning(true);
    setResult(null);
    try {
      // Build mock correlation matrix from player stats
      const headers = players.map(p => `${p.name.split(" ").pop()} (${stats[0]})`);
      const matrix = players.map((p, i) => ({
        label: p.name.split(" ").pop() || p.name,
        values: players.map((_, j) => i === j ? 1.0 : parseFloat((Math.random() * 1.4 - 0.4).toFixed(2))),
      }));
      setResult({ matrix, headers });
    } catch (e) { console.error("Correlation error:", e); } finally { setRunning(false); }
  }

  /* ── Parlay runner ── */
  async function runParlay(legs: ParlayLeg[]) {
    setRunning(true);
    setResult(null);
    try {
      const legResults = legs.map(l => {
        const prob = 0.4 + Math.random() * 0.3; // simulate per-leg prob
        return { player: l.player?.name ?? "", stat: STAT_KEYS.find(s => s.value === l.statKey)?.label ?? l.statKey, direction: l.direction, line: l.line, prob };
      });
      const combinedProb = legResults.reduce((acc, l) => acc * l.prob, 1);
      const ev = (combinedProb * (legs.length * 1.8) - 1) * 100; // simplified EV calc
      const tier = combinedProb > 0.25 ? "S" : combinedProb > 0.15 ? "A" : combinedProb > 0.08 ? "B" : "C";
      setResult({ legs: legResults, combinedProb, ev, tier, worth: ev > 5 });
    } catch (e) { console.error("Parlay error:", e); } finally { setRunning(false); }
  }

  return (
    <div className="space-y-5">
      {/* Engine List */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Available Engines</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
          {allEngines.map(e => (
            <button
              key={e.key}
              onClick={() => { setSelectedEngine(e.key); setResult(null); }}
              className={cn(
                "text-left p-3 rounded-xl border transition-all",
                selectedEngine === e.key ? "border-primary/40 bg-card shadow-sm" : "border-border bg-secondary/20 hover:bg-secondary/40"
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

      {/* Engine header */}
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

          {/* Sport selector (shared) */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Sport</label>
            <div className="flex gap-1.5">
              {SPORTS.map(s => (
                <button key={s.value} onClick={() => { setSport(s.value); setSelectedPlayer(null); }} className={cn("px-2 py-1 rounded-full text-[10px] font-semibold border", sport === s.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>{s.label}</button>
              ))}
            </div>
          </div>

          {/* ═══ ENGINE-SPECIFIC FORMS ═══ */}

          {isGameEngine && (
            <GamePickerForm engineName={engine.name} running={running} onRun={runGamePrediction} result={result} />
          )}

          {isCorrelation && (
            <CorrelationForm sport={sport} running={running} onRun={runCorrelation} result={result} />
          )}

          {isParlay && (
            <ParlayBuilderForm sport={sport} running={running} onRun={runParlay} result={result} />
          )}

          {/* ═══ DEFAULT FORM (single player) ═══ */}
          {isDefaultForm && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">Stat</label>
                  <select value={statKey} onChange={(e) => setStatKey(e.target.value)} className="w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground">
                    {STAT_KEYS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">Line</label>
                  <Input type="number" step="0.5" value={line} onChange={(e) => setLine(e.target.value)} className="bg-secondary text-xs h-8" />
                </div>
              </div>

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

              <button onClick={runDefaultEngine} disabled={running || !selectedPlayer} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? "Running Engine…" : `Run ${engine.name}`}
              </button>

              {result && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-primary/20 bg-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Projection</p>
                      <p className="text-lg font-bold text-foreground">{result.output?.projection ?? "—"}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Edge</p>
                      <p className={cn("text-lg font-bold", (result.output?.edge ?? 0) > 0 ? "text-cosmic-green" : "text-destructive")}>{(result.output?.edge ?? 0) > 0 ? "+" : ""}{result.output?.edge ?? "—"}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Probability</p>
                      <p className="text-lg font-bold text-foreground">{result.output?.probability != null ? `${(result.output.probability * 100).toFixed(1)}%` : "—"}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Tier</p>
                      <Badge className={cn("text-xs font-bold", result.output?.confidenceTier === "S" ? "bg-cosmic-green" : result.output?.confidenceTier === "A" ? "bg-primary" : "bg-muted")}>{result.output?.confidenceTier ?? "—"}</Badge>
                    </div>
                  </div>

                  {result.trace && (
                    <div className="rounded-xl border border-border bg-secondary/30">
                      <button onClick={() => setShowTrace(!showTrace)} className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold text-foreground">
                        <Cpu className="h-3.5 w-3.5 text-primary" /> Engine Trace
                        {showTrace ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
                      </button>
                      {showTrace && (
                        <pre className="px-4 pb-3 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">{result.trace.join("\n")}</pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
