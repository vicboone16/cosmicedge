import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  runSimulation, getEdgeColor, getEdgeBg, americanToImpliedProb,
  type PlayerProjection, type PropLine, type SimulationResult 
} from "@/lib/monte-carlo-engine";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Activity, BarChart3, Dices, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";

interface MonteCarloSimTabProps {
  selectedDate: Date;
}

// Stat type display labels
const STAT_LABELS: Record<string, string> = {
  points: "PTS",
  rebounds: "REB",
  assists: "AST",
  steals: "STL",
  blocks: "BLK",
  turnovers: "TO",
  pts_reb_ast: "PRA",
  pts_reb: "P+R",
  pts_ast: "P+A",
  reb_ast: "R+A",
  steals_blocks: "S+B",
  fantasy_points: "FPTS",
  threes: "3PM",
};

function getStatLabel(stat: string): string {
  return STAT_LABELS[stat] || stat.toUpperCase();
}

// Map market_key from player_props to our stat_type
function marketKeyToStatType(mk: string): string | null {
  if (mk.includes("point")) return "points";
  if (mk.includes("rebound")) return "rebounds";
  if (mk.includes("assist")) return "assists";
  if (mk.includes("steal")) return "steals";
  if (mk.includes("block")) return "blocks";
  if (mk.includes("turnover")) return "turnovers";
  if (mk.includes("pts_reb_ast") || mk.includes("pra")) return "pts_reb_ast";
  if (mk.includes("pts_reb") || mk.includes("points_rebounds")) return "pts_reb";
  if (mk.includes("pts_ast") || mk.includes("points_assists")) return "pts_ast";
  if (mk.includes("reb_ast") || mk.includes("rebounds_assists")) return "reb_ast";
  if (mk.includes("three") || mk.includes("3pt")) return "threes";
  return null;
}

function DistributionBar({ result }: { result: SimulationResult }) {
  const range = result.percentile_90 - result.percentile_10;
  if (range <= 0) return null;

  const linePos = Math.max(0, Math.min(100, ((result.line - result.percentile_10) / range) * 100));
  const medianPos = Math.max(0, Math.min(100, ((result.percentile_50 - result.percentile_10) / range) * 100));

  return (
    <div className="relative h-3 w-full rounded-full bg-muted/40 overflow-hidden">
      {/* IQR range */}
      <div
        className="absolute h-full bg-primary/20 rounded-full"
        style={{
          left: `${((result.percentile_25 - result.percentile_10) / range) * 100}%`,
          width: `${((result.percentile_75 - result.percentile_25) / range) * 100}%`,
        }}
      />
      {/* Median marker */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-primary"
        style={{ left: `${medianPos}%` }}
      />
      {/* Line marker */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-destructive"
        style={{ left: `${linePos}%` }}
      />
    </div>
  );
}

function SimResultCard({ result }: { result: SimulationResult }) {
  const [expanded, setExpanded] = useState(false);
  const bestSide = result.edge_over > result.edge_under ? "over" : "under";
  const bestEdge = bestSide === "over" ? result.edge_over : result.edge_under;
  const bestProb = bestSide === "over" ? result.prob_over : result.prob_under;

  return (
    <div className={cn("rounded-xl border p-3 space-y-2 transition-all", getEdgeBg(bestEdge))}>
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{result.player_name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-bold">
              {getStatLabel(result.stat_type)}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              Line: <span className="font-bold text-foreground">{result.line}</span>
            </span>
            <span className="text-[10px] text-muted-foreground">
              Proj: <span className={cn("font-bold", result.projected_value > result.line ? "text-cosmic-green" : "text-destructive")}>
                {result.projected_value.toFixed(1)}
              </span>
            </span>
          </div>
        </div>

        {/* Best edge badge */}
        <div className="text-right shrink-0 ml-2">
          <div className={cn("text-lg font-bold tabular-nums", getEdgeColor(bestEdge))}>
            {bestEdge > 0 ? "+" : ""}{bestEdge.toFixed(1)}%
          </div>
          <div className="flex items-center gap-0.5 justify-end">
            {bestSide === "over" ? (
              <TrendingUp className="h-3 w-3 text-cosmic-green" />
            ) : (
              <TrendingDown className="h-3 w-3 text-destructive" />
            )}
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">{bestSide}</span>
          </div>
        </div>
      </div>

      {/* Over/Under probabilities */}
      <div className="grid grid-cols-2 gap-2">
        <div className={cn("rounded-lg p-2 text-center", result.edge_over > 0 ? "bg-cosmic-green/5" : "bg-muted/20")}>
          <p className="text-[9px] font-semibold text-muted-foreground uppercase">Over {result.line}</p>
          <p className={cn("text-base font-bold tabular-nums", result.edge_over > 0 ? "text-cosmic-green" : "text-muted-foreground")}>
            {result.prob_over.toFixed(1)}%
          </p>
          <p className={cn("text-[9px] font-semibold tabular-nums", getEdgeColor(result.edge_over))}>
            Edge: {result.edge_over > 0 ? "+" : ""}{result.edge_over.toFixed(1)}%
          </p>
        </div>
        <div className={cn("rounded-lg p-2 text-center", result.edge_under > 0 ? "bg-primary/5" : "bg-muted/20")}>
          <p className="text-[9px] font-semibold text-muted-foreground uppercase">Under {result.line}</p>
          <p className={cn("text-base font-bold tabular-nums", result.edge_under > 0 ? "text-primary" : "text-muted-foreground")}>
            {result.prob_under.toFixed(1)}%
          </p>
          <p className={cn("text-[9px] font-semibold tabular-nums", getEdgeColor(result.edge_under))}>
            Edge: {result.edge_under > 0 ? "+" : ""}{result.edge_under.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Distribution bar */}
      <DistributionBar result={result} />
      <div className="flex justify-between text-[8px] text-muted-foreground/60 tabular-nums px-0.5">
        <span>P10: {result.percentile_10.toFixed(1)}</span>
        <span>P50: {result.percentile_50.toFixed(1)}</span>
        <span>P90: {result.percentile_90.toFixed(1)}</span>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full justify-center"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Less" : "Details"}
      </button>

      {expanded && (
        <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
          <div>
            <p className="font-semibold text-foreground/70">Implied Over</p>
            <p className="tabular-nums">{result.implied_prob_over.toFixed(1)}%</p>
          </div>
          <div>
            <p className="font-semibold text-foreground/70">Implied Under</p>
            <p className="tabular-nums">{result.implied_prob_under.toFixed(1)}%</p>
          </div>
          <div>
            <p className="font-semibold text-foreground/70">Fantasy Avg</p>
            <p className="tabular-nums">{result.fantasy_points_mean.toFixed(1)}</p>
          </div>
          <div>
            <p className="font-semibold text-foreground/70">Simulations</p>
            <p className="tabular-nums">{result.num_simulations.toLocaleString()}</p>
          </div>
          <div>
            <p className="font-semibold text-foreground/70">P25</p>
            <p className="tabular-nums">{result.percentile_25.toFixed(1)}</p>
          </div>
          <div>
            <p className="font-semibold text-foreground/70">P75</p>
            <p className="tabular-nums">{result.percentile_75.toFixed(1)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function MonteCarloSimTab({ selectedDate }: MonteCarloSimTabProps) {
  const [statFilter, setStatFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"edge" | "prob" | "name">("edge");

  // Fetch games for selected date
  const { data: games } = useQuery({
    queryKey: ["mc-games", selectedDate.toDateString()],
    queryFn: async () => {
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(selectedDate);
      end.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time, league")
        .eq("league", "NBA")
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString());
      return data || [];
    },
  });

  const gameIds = games?.map(g => g.id) || [];

  // Fetch player projections for these games
  const { data: projections } = useQuery({
    queryKey: ["mc-projections", gameIds],
    queryFn: async () => {
      if (gameIds.length === 0) return [];
      const { data } = await supabase
        .from("player_projections" as any)
        .select("*")
        .in("game_id", gameIds);
      return (data || []) as any[];
    },
    enabled: gameIds.length > 0,
  });

  // Fetch player props (lines) for these games
  const { data: propLines } = useQuery({
    queryKey: ["mc-prop-lines", gameIds],
    queryFn: async () => {
      if (gameIds.length === 0) return [];
      const { data } = await supabase
        .from("player_props")
        .select("player_name, market_key, line, over_price, under_price, game_id")
        .in("game_id", gameIds)
        .not("line", "is", null);
      return (data || []) as any[];
    },
    enabled: gameIds.length > 0,
  });

  // Run simulations client-side
  const simResults: SimulationResult[] = useMemo(() => {
    if (!projections || projections.length === 0 || !propLines || propLines.length === 0) return [];

    const projMap = new Map<string, any>();
    for (const p of projections) {
      projMap.set(`${p.game_id}::${p.player_name.toLowerCase()}`, p);
    }

    const results: SimulationResult[] = [];

    // Dedupe prop lines
    const seen = new Set<string>();
    for (const pl of propLines) {
      const statType = marketKeyToStatType(pl.market_key);
      if (!statType) continue;

      const dedupKey = `${pl.game_id}::${pl.player_name}::${statType}::${pl.line}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const proj = projMap.get(`${pl.game_id}::${pl.player_name.toLowerCase()}`);
      if (!proj) continue;

      const projection: PlayerProjection = {
        player_name: pl.player_name,
        projected_points: proj.projected_points ?? 0,
        projected_rebounds: proj.projected_rebounds ?? 0,
        projected_assists: proj.projected_assists ?? 0,
        projected_steals: proj.projected_steals ?? 0,
        projected_blocks: proj.projected_blocks ?? 0,
        projected_turnovers: proj.projected_turnovers ?? 0,
        std_points: proj.std_points ?? 6,
        std_rebounds: proj.std_rebounds ?? 3,
        std_assists: proj.std_assists ?? 2.5,
        std_steals: proj.std_steals ?? 0.8,
        std_blocks: proj.std_blocks ?? 0.7,
        std_turnovers: proj.std_turnovers ?? 1.0,
      };

      const propLineObj: PropLine = {
        stat_type: statType,
        line: pl.line,
        over_odds: pl.over_price,
        under_odds: pl.under_price,
      };

      results.push(runSimulation(projection, propLineObj, 10_000));
    }

    return results;
  }, [projections, propLines]);

  // Filter and sort
  const filteredResults = useMemo(() => {
    let filtered = simResults;
    if (statFilter !== "all") {
      filtered = filtered.filter(r => r.stat_type === statFilter);
    }
    filtered.sort((a, b) => {
      if (sortBy === "edge") {
        const aEdge = Math.max(a.edge_over, a.edge_under);
        const bEdge = Math.max(b.edge_over, b.edge_under);
        return bEdge - aEdge;
      }
      if (sortBy === "prob") {
        return Math.max(b.prob_over, b.prob_under) - Math.max(a.prob_over, a.prob_under);
      }
      return a.player_name.localeCompare(b.player_name);
    });
    return filtered;
  }, [simResults, statFilter, sortBy]);

  const availableStats = useMemo(() => {
    const s = new Set<string>();
    for (const r of simResults) s.add(r.stat_type);
    return Array.from(s).sort();
  }, [simResults]);

  const hasProjections = projections && projections.length > 0;

  return (
    <div className="space-y-4 px-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Dices className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-sm font-bold text-foreground">Monte Carlo Simulations</h2>
          <p className="text-[10px] text-muted-foreground">
            10,000 simulations per player • Box-Muller distribution
          </p>
        </div>
      </div>

      {!hasProjections ? (
        <div className="cosmic-card rounded-2xl p-8 text-center space-y-3">
          <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm font-medium text-foreground">No Player Projections Available</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Monte Carlo simulations require player projections to be loaded for today's games. 
            Projections include projected stats and standard deviations for each player.
          </p>
          <p className="text-[10px] text-muted-foreground/60">
            {games?.length ?? 0} NBA games found for this date • {propLines?.length ?? 0} prop lines available
          </p>
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-2">
            <div className="cosmic-card rounded-xl p-2.5 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{simResults.length}</p>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase">Sims Run</p>
            </div>
            <div className="cosmic-card rounded-xl p-2.5 text-center">
              <p className="text-lg font-bold text-cosmic-green tabular-nums">
                {simResults.filter(r => Math.max(r.edge_over, r.edge_under) > 5).length}
              </p>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase">Strong Edge</p>
            </div>
            <div className="cosmic-card rounded-xl p-2.5 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">
                {projections?.length ?? 0}
              </p>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase">Players</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            <button
              onClick={() => setStatFilter("all")}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-colors border",
                statFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted/50"
              )}
            >
              All Stats
            </button>
            {availableStats.map(stat => (
              <button
                key={stat}
                onClick={() => setStatFilter(stat)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-colors border",
                  statFilter === stat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted/50"
                )}
              >
                {getStatLabel(stat)}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex gap-1.5">
            {(["edge", "prob", "name"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[9px] font-semibold transition-colors",
                  sortBy === s ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s === "edge" ? "Best Edge" : s === "prob" ? "Highest Prob" : "A-Z"}
              </button>
            ))}
          </div>

          {/* Results */}
          {filteredResults.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No simulation results match the current filter.
            </p>
          ) : (
            <div className="space-y-2.5">
              {filteredResults.map((r, i) => (
                <SimResultCard key={`${r.player_name}-${r.stat_type}-${r.line}-${i}`} result={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
