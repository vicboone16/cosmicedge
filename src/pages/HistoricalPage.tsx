import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { History, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, RefreshCw, Trophy, Star, Users, Target, FlaskConical, Save, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-admin";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { format, addDays, subDays } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { getPlanetaryHourAt } from "@/lib/planetary-hours";

function formatPrice(p: number | null): string {
  if (p == null) return "—";
  return p > 0 ? `+${p}` : `${p}`;
}

// League-specific season definitions (month is 0-indexed)
const LEAGUE_SEASONS: Record<string, { label: string; start: Date; end: Date }[]> = {
  NBA: [
    { label: "2024-25", start: new Date(2024, 9, 22), end: new Date(2025, 5, 30) },  // Oct 22 – Jun 30
    { label: "2025-26", start: new Date(2025, 9, 21), end: new Date(2026, 5, 30) },
  ],
  NHL: [
    { label: "2024-25", start: new Date(2024, 9, 4), end: new Date(2025, 5, 30) },   // Oct 4 – Jun 30
    { label: "2025-26", start: new Date(2025, 9, 7), end: new Date(2026, 5, 30) },
  ],
  MLB: [
    { label: "2024", start: new Date(2024, 2, 20), end: new Date(2024, 10, 5) },     // Mar 20 – Nov 5
    { label: "2025", start: new Date(2025, 2, 27), end: new Date(2025, 10, 5) },
  ],
  NFL: [
    { label: "2024-25", start: new Date(2024, 8, 5), end: new Date(2025, 1, 15) },   // Sep 5 – Feb 15
    { label: "2025-26", start: new Date(2025, 8, 4), end: new Date(2026, 1, 15) },
  ],
};

function getSeasonsForLeague(lg: string) {
  return LEAGUE_SEASONS[lg] || LEAGUE_SEASONS.NBA;
}

const MODEL_WEIGHT_DEFS = [
  // Team models (all leagues)
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
  // Player models (NBA-specific)
  { key: "game_score", label: "Game Score", default: 5, nbaOnly: true, group: "Player" },
  { key: "usage", label: "Usage Rate", default: 0, nbaOnly: true, group: "Player" },
  { key: "ppp", label: "Points/Possession", default: 0, nbaOnly: true, group: "Player" },
  { key: "points_per_shot", label: "Points/Shot", default: 0, nbaOnly: true, group: "Player" },
  { key: "plus_minus", label: "+/- Avg", default: 5, nbaOnly: true, group: "Player" },
];

const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  MODEL_WEIGHT_DEFS.map(d => [d.key, d.default])
);

export default function HistoricalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const [league, setLeague] = useState("NBA");
  const [selectedDate, setSelectedDate] = useState(subDays(new Date(), 1));
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [marketType, setMarketType] = useState("moneyline");
  const [playerSearch, setPlayerSearch] = useState("");
  const [btStart, setBtStart] = useState("");
  const [btEnd, setBtEnd] = useState("");
  const [btResult, setBtResult] = useState<any>(null);
  const [btWeights, setBtWeights] = useState<Record<string, number>>({ ...DEFAULT_WEIGHTS });
  const [presetName, setPresetName] = useState("");
  const [flatBet, setFlatBet] = useState(100);
  const [btLeagues, setBtLeagues] = useState<string[]>(["NBA"]);

  // Load saved presets
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
    enabled: !!user && isAdmin,
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
    // Prefer weights_json if available, fall back to legacy columns
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

      const leaguesToRun = btLeagues.length > 0 ? btLeagues : [league];
      const allResults: any[] = [];

      for (const lg of leaguesToRun) {
        const resp = await supabase.functions.invoke("quant-engine", {
          body: { mode: "backtest", league: lg, date_start: btStart, date_end: btEnd, custom_weights: btWeights, flat_bet: flatBet },
        });
        if (resp.error) throw new Error(resp.error.message);
        allResults.push({ league: lg, ...resp.data.backtest });
      }

      // Merge results across leagues
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

        // Merge strength
        for (const [k, v] of Object.entries(r.strength_breakdown || {})) {
          const d = v as any;
          if (!merged.strength_breakdown[k]) merged.strength_breakdown[k] = { total: 0, correct: 0 };
          merged.strength_breakdown[k].total += d.total;
          merged.strength_breakdown[k].correct += d.correct;
        }

        // Merge layers
        for (const [k, v] of Object.entries(r.layer_breakdown || {})) {
          const d = v as any;
          if (!merged.layer_breakdown[k]) merged.layer_breakdown[k] = { total: 0, correct: 0 };
          merged.layer_breakdown[k].total += d.total;
          merged.layer_breakdown[k].correct += d.correct;
        }

        // Merge by_market
        for (const [k, v] of Object.entries(r.by_market || {})) {
          const d = v as any;
          if (!merged.by_market[k]) merged.by_market[k] = { total: 0, correct: 0, total_wagered: 0, net_profit: 0 };
          merged.by_market[k].total += d.total;
          merged.by_market[k].correct += d.correct;
          merged.by_market[k].total_wagered += d.total_wagered;
          merged.by_market[k].net_profit += d.net_profit;
        }

        // ROI
        merged.roi_simulation.total_wagered += r.roi_simulation?.total_wagered || 0;
        merged.roi_simulation.net_profit += r.roi_simulation?.net_profit || 0;

        // Per-league breakdown
        merged.by_league[r.league] = {
          total_picked: r.total_picked, correct_picks: r.correct_picks,
          accuracy: r.accuracy, roi: r.roi_simulation?.roi || 0,
        };
      }

      merged.accuracy = merged.total_picked > 0 ? +(merged.correct_picks / merged.total_picked * 100).toFixed(1) : 0;
      merged.roi_simulation.roi = merged.roi_simulation.total_wagered > 0
        ? +(merged.roi_simulation.net_profit / merged.roi_simulation.total_wagered * 100).toFixed(1) : 0;

      // Compute derived fields for merged sub-objects
      for (const v of Object.values(merged.strength_breakdown)) {
        const d = v as any;
        d.accuracy = d.total > 0 ? +(d.correct / d.total * 100).toFixed(1) : 0;
      }
      for (const v of Object.values(merged.layer_breakdown)) {
        const d = v as any;
        d.accuracy = d.total > 0 ? +(d.correct / d.total * 100).toFixed(1) : 0;
      }
      for (const v of Object.values(merged.by_market)) {
        const d = v as any;
        d.win_pct = d.total > 0 ? +(d.correct / d.total * 100).toFixed(1) : 0;
        d.roi = d.total_wagered > 0 ? +(d.net_profit / d.total_wagered * 100).toFixed(1) : 0;
      }

      return merged;
    },
    onSuccess: (data) => {
      setBtResult(data);
      toast({ title: "Backtest complete", description: `${data.total_picked} games analyzed across ${btLeagues.length} league(s)` });
    },
    onError: (err: any) => {
      toast({ title: "Backtest failed", description: err.message, variant: "destructive" });
    },
  });

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Use local date boundaries (midnight-to-midnight local time) converted to ISO for UTC comparison
  const localStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
  const localEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59, 999);

  // ── Tab 1: Past games ──
  const { data: pastGames } = useQuery({
    queryKey: ["past-games", league, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("games")
        .select("*")
        .eq("league", league)
        .gte("start_time", localStart.toISOString())
        .lte("start_time", localEnd.toISOString())
        .order("start_time");
      return data || [];
    },
  });

  // Fetch quarter/period scores for past games
  const { data: gameQuarters } = useQuery({
    queryKey: ["hist-game-quarters", pastGames?.map(g => g.id).join(",")],
    queryFn: async () => {
      const gameIds = pastGames?.map(g => g.id) || [];
      if (gameIds.length === 0) return {};
      const { data } = await supabase
        .from("game_quarters")
        .select("game_id, quarter, home_score, away_score")
        .in("game_id", gameIds)
        .order("quarter", { ascending: true });
      // Group by game_id
      const map: Record<string, { quarter: number; home_score: number | null; away_score: number | null }[]> = {};
      for (const row of data || []) {
        if (!map[row.game_id]) map[row.game_id] = [];
        map[row.game_id].push(row);
      }
      return map;
    },
    enabled: (pastGames?.length || 0) > 0,
  });

  // ── Tab 2: Historical odds ──
  const { data: historicalOdds, refetch, isFetching } = useQuery({
    queryKey: ["historical-odds", league, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("historical_odds")
        .select("*")
        .eq("league", league)
        .eq("snapshot_date", dateStr)
        .order("home_team")
        .order("market_type");
      return data || [];
    },
  });

  // ── Tab 2: Line movement ──
  const { data: liveSnapshots } = useQuery({
    queryKey: ["odds-snapshots", selectedGameId, marketType],
    queryFn: async () => {
      if (!selectedGameId) return [];
      const { data } = await supabase
        .from("odds_snapshots")
        .select("*")
        .eq("game_id", selectedGameId)
        .eq("market_type", marketType)
        .order("captured_at", { ascending: true });
      return data || [];
    },
    enabled: !!selectedGameId,
  });

  // ── Tab 4: Player stats ──
  const { data: playerStats } = useQuery({
    queryKey: ["hist-player-stats", league, dateStr, playerSearch],
    queryFn: async () => {
      const gameIds = pastGames?.map(g => g.id) || [];
      if (gameIds.length === 0) return [];
      let query = supabase
        .from("player_game_stats")
        .select("*, players!player_game_stats_player_id_fkey(name, team, birth_date)")
        .in("game_id", gameIds)
        .order("points", { ascending: false })
        .limit(50);
      return (await query).data || [];
    },
    enabled: (pastGames?.length || 0) > 0,
  });

  // ── Tab 5: Market outcomes ──
  const marketOutcomes = useMemo(() => {
    if (!pastGames || !historicalOdds) return [];
    return pastGames.map(g => {
      const odds = historicalOdds.filter(o => o.game_id === g.id);
      const mlOdds = odds.filter(o => o.market_type === "moneyline");
      const spreadOdds = odds.filter(o => o.market_type === "spread");
      const totalOdds = odds.filter(o => o.market_type === "total");

      const homeWon = g.home_score != null && g.away_score != null && g.home_score > g.away_score;
      const totalScore = (g.home_score || 0) + (g.away_score || 0);
      const avgSpreadLine = spreadOdds.length > 0 
        ? spreadOdds.reduce((s, o) => s + (o.line || 0), 0) / spreadOdds.length 
        : null;
      const avgTotalLine = totalOdds.length > 0
        ? totalOdds.reduce((s, o) => s + (o.line || 0), 0) / totalOdds.length
        : null;

      const homeCoveredATS = avgSpreadLine != null && g.home_score != null && g.away_score != null
        ? (g.home_score + avgSpreadLine) > g.away_score
        : null;
      const wentOver = avgTotalLine != null ? totalScore > avgTotalLine : null;

      return { game: g, homeWon, totalScore, avgSpreadLine, avgTotalLine, homeCoveredATS, wentOver };
    });
  }, [pastGames, historicalOdds]);

  // Closing lines for Tab 2
  const closingLines = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const row of historicalOdds || []) {
      const key = `${row.home_team} vs ${row.away_team}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    const results: any[] = [];
    for (const [key, rows] of map) {
      const ml = rows.filter(r => r.market_type === "moneyline");
      const sp = rows.filter(r => r.market_type === "spread");
      const tot = rows.filter(r => r.market_type === "total");
      const avg = (arr: (number | null)[]) => {
        const valid = arr.filter((v): v is number => v != null);
        return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
      };
      results.push({
        key, homeTeam: rows[0].home_team, awayTeam: rows[0].away_team, gameId: rows[0].game_id,
        moneyline: { home: avg(ml.map(r => r.home_price)), away: avg(ml.map(r => r.away_price)) },
        spread: { line: avg(sp.map(r => r.line)), home: avg(sp.map(r => r.home_price)), away: avg(sp.map(r => r.away_price)) },
        total: { line: avg(tot.map(r => r.line)), over: avg(tot.map(r => r.home_price)), under: avg(tot.map(r => r.away_price)) },
        bookmakerCount: new Set(rows.map(r => r.bookmaker)).size,
      });
    }
    return results;
  }, [historicalOdds]);

  const chartData = useMemo(() => {
    if (!liveSnapshots?.length) return [];
    const timeMap = new Map<string, { prices: number[]; lines: number[] }>();
    for (const snap of liveSnapshots) {
      const t = new Date(snap.captured_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (!timeMap.has(t)) timeMap.set(t, { prices: [], lines: [] });
      const entry = timeMap.get(t)!;
      if (snap.home_price != null) entry.prices.push(snap.home_price);
      if (snap.line != null) entry.lines.push(snap.line);
    }
    return Array.from(timeMap.entries()).map(([time, data]) => ({
      time,
      price: data.prices.length > 0 ? Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length) : null,
      line: data.lines.length > 0 ? +(data.lines.reduce((a, b) => a + b, 0) / data.lines.length).toFixed(1) : null,
    }));
  }, [liveSnapshots]);

  const handleFetchHistorical = async () => {
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-historical-odds?league=${league}&date=${dateStr}T12:00:00Z`,
        { method: "GET", headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
    } catch (e) { console.warn(e); }
    refetch();
  };

  const filteredPlayerStats = useMemo(() => {
    if (!playerSearch) return playerStats || [];
    const q = playerSearch.toLowerCase();
    return (playerStats || []).filter((s: any) => s.players?.name?.toLowerCase().includes(q) || s.team_abbr?.toLowerCase().includes(q));
  }, [playerStats, playerSearch]);

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-bold font-display flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Historical
          </h1>
          <button onClick={handleFetchHistorical} disabled={isFetching}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary">
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            Fetch
          </button>
        </div>

        {/* Season selector (league-aware) */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Season:</span>
          {getSeasonsForLeague(league).map(s => {
            const isActive = selectedDate >= s.start && selectedDate <= s.end;
            return (
              <button key={s.label} onClick={() => { setSelectedDate(s.start); setSelectedGameId(null); }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
                }`}>{s.label}</button>
            );
          })}
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setSelectedDate(d => subDays(d, 1))} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <input
            type="date"
            value={format(selectedDate, "yyyy-MM-dd")}
            onChange={(e) => { if (e.target.value) setSelectedDate(new Date(e.target.value + "T12:00:00")); }}
            className="bg-transparent text-xs text-muted-foreground border border-border/50 rounded px-2 py-0.5"
          />
          <button onClick={() => setSelectedDate(d => addDays(d, 1))} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* League chips */}
        <div className="flex gap-1.5">
          {["NBA", "NHL", "MLB", "NFL"].map((lg) => (
            <button key={lg} onClick={() => {
              setLeague(lg);
              setSelectedGameId(null);
              // Jump to the matching season start for the new league
              const seasons = getSeasonsForLeague(lg);
              const current = seasons.find(s => selectedDate >= s.start && selectedDate <= s.end);
              if (!current) setSelectedDate(seasons[0].start);
            }}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                league === lg ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}>{lg}</button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4">
        <Tabs defaultValue="results" className="w-full">
          <TabsList className={`w-full grid h-8 ${isAdmin ? "grid-cols-6" : "grid-cols-5"}`}>
            <TabsTrigger value="results" className="text-[9px] px-1"><Trophy className="h-3 w-3 mr-0.5" />Results</TabsTrigger>
            <TabsTrigger value="odds" className="text-[9px] px-1"><TrendingUp className="h-3 w-3 mr-0.5" />Odds</TabsTrigger>
            <TabsTrigger value="astro" className="text-[9px] px-1"><Star className="h-3 w-3 mr-0.5" />Astro</TabsTrigger>
            <TabsTrigger value="players" className="text-[9px] px-1"><Users className="h-3 w-3 mr-0.5" />Stats</TabsTrigger>
            <TabsTrigger value="markets" className="text-[9px] px-1"><Target className="h-3 w-3 mr-0.5" />ATS</TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="backtest" className="text-[9px] px-1"><FlaskConical className="h-3 w-3 mr-0.5" />Backtest</TabsTrigger>
            )}
          </TabsList>

          {/* Tab 1: Game Results */}
          <TabsContent value="results" className="space-y-1 mt-3">
            {pastGames?.length ? pastGames.map(g => {
              const awayWon = g.away_score != null && g.home_score != null && g.away_score > g.home_score;
              const homeWon = g.away_score != null && g.home_score != null && g.home_score > g.away_score;
              return (
                <button key={g.id} onClick={() => navigate(`/game/${g.id}`)} className="cosmic-card rounded-lg w-full text-left transition-all hover:border-primary/30 active:scale-[0.98] overflow-hidden">
                  {/* Away row */}
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs font-bold text-primary w-8">{g.away_abbr}</span>
                      <span className={cn("text-sm font-medium truncate", awayWon ? "text-foreground" : "text-muted-foreground")}>
                        {g.away_team.split(" ").pop()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {g.away_score != null && (
                        <div className="flex items-center gap-1">
                          <span className={cn("text-lg font-bold tabular-nums font-display", awayWon ? "text-foreground" : "text-muted-foreground")}>
                            {g.away_score}
                          </span>
                          {awayWon && <span className="text-cosmic-gold text-[10px]">◀</span>}
                        </div>
                      )}
                      {g.status === "final" && g.away_score == null && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    {/* Status badge - only on top row */}
                    <span className={cn(
                      "text-[9px] font-semibold ml-3 w-10 text-right",
                      g.status === "final" ? "text-muted-foreground" : "text-cosmic-green"
                    )}>
                      {g.status === "final" ? "Final" : g.status?.toUpperCase()}
                    </span>
                  </div>
                  {/* Home row */}
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs font-bold text-primary w-8">{g.home_abbr}</span>
                      <span className={cn("text-sm font-medium truncate", homeWon ? "text-foreground" : "text-muted-foreground")}>
                        {g.home_team.split(" ").pop()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {g.home_score != null && (
                        <div className="flex items-center gap-1">
                          <span className={cn("text-lg font-bold tabular-nums font-display", homeWon ? "text-foreground" : "text-muted-foreground")}>
                            {g.home_score}
                          </span>
                          {homeWon && <span className="text-cosmic-gold text-[10px]">◀</span>}
                        </div>
                      )}
                    </div>
                    <span className="w-10 ml-3" />
                  </div>
                </button>
              );
            }) : closingLines.length > 0 ? closingLines.map(cl => (
              <div key={cl.key} className="cosmic-card rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-foreground">{cl.awayTeam} @ {cl.homeTeam}</p>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-secondary text-muted-foreground">ODDS ONLY</span>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                  <span>ML: {formatPrice(cl.moneyline.home)} / {formatPrice(cl.moneyline.away)}</span>
                  {cl.spread.line != null && <span>Spread: {cl.spread.line}</span>}
                  {cl.total.line != null && <span>O/U: {cl.total.line}</span>}
                </div>
              </div>
            )) : (
              <div className="cosmic-card rounded-xl p-8 text-center">
                <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">No games found for this date</p>
                <p className="text-xs text-muted-foreground mt-1">Try clicking "Fetch" or navigate to a date with games</p>
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Historical Odds & Line Movement */}
          <TabsContent value="odds" className="space-y-3 mt-3">
            {closingLines.length === 0 ? (
              <div className="cosmic-card rounded-xl p-8 text-center space-y-2">
                <History className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-medium">No historical odds data</p>
                <p className="text-xs text-muted-foreground">Click "Fetch" to pull data</p>
              </div>
            ) : (
              <>
                {closingLines.map(cl => (
                  <button key={cl.key} onClick={() => setSelectedGameId(cl.gameId)}
                    className={`cosmic-card rounded-xl p-3 w-full text-left transition-colors ${selectedGameId === cl.gameId ? "ring-1 ring-primary" : "hover:bg-secondary/20"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold">{cl.awayTeam} @ {cl.homeTeam}</p>
                      <span className="text-[9px] text-muted-foreground">{cl.bookmakerCount} books</span>
                    </div>
                    <div className="flex gap-3">
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">ML</p>
                        <p className="text-xs font-bold tabular-nums">{formatPrice(cl.moneyline.home)} / {formatPrice(cl.moneyline.away)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Spread</p>
                        <p className="text-xs font-bold tabular-nums">{cl.spread.line ?? "—"} ({formatPrice(cl.spread.home)})</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Total</p>
                        <p className="text-xs font-bold tabular-nums">{cl.total.line != null ? `O/U ${cl.total.line}` : "—"}</p>
                      </div>
                    </div>
                  </button>
                ))}

                {selectedGameId && (
                  <div className="cosmic-card rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest">Line Movement</h3>
                      <Select value={marketType} onValueChange={setMarketType}>
                        <SelectTrigger className="w-[110px] h-7 text-[10px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="moneyline">Moneyline</SelectItem>
                          <SelectItem value="spread">Spread</SelectItem>
                          <SelectItem value="total">Total</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {chartData.length > 1 ? (
                      <div className="h-48">
                        <ResponsiveContainer>
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="time" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "11px" }} />
                            {marketType === "moneyline" ? (
                              <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                            ) : (
                              <Line type="monotone" dataKey="line" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-6">Not enough snapshots to chart line movement.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Tab 3: Historical Astrology */}
          <TabsContent value="astro" className="space-y-2 mt-3">
            {(() => {
              // Use pastGames if available, otherwise derive from closingLines
              const astroGames = pastGames?.length ? pastGames.map(g => ({
                key: g.id,
                away: g.away_abbr,
                home: g.home_abbr,
                startTime: g.start_time,
                lat: g.venue_lat ?? 40.7,
                lng: g.venue_lng,
                score: g.home_score != null ? `${g.away_score}-${g.home_score} · ${(g.home_score || 0) + (g.away_score || 0)} total` : null,
              })) : closingLines.map(cl => ({
                key: cl.key,
                away: cl.awayTeam,
                home: cl.homeTeam,
                startTime: (historicalOdds?.find(o => o.home_team === cl.homeTeam)?.start_time) || selectedDate.toISOString(),
                lat: 40.7,
                lng: null as number | null,
                score: null as string | null,
              }));

              if (astroGames.length === 0) return (
                <div className="cosmic-card rounded-xl p-8 text-center">
                  <Star className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-medium">No games to analyze</p>
                  <p className="text-xs text-muted-foreground mt-1">Try clicking "Fetch" to load historical odds data</p>
                </div>
              );

              return astroGames.map(g => {
                const ph = getPlanetaryHourAt(new Date(g.startTime), g.lat);
                return (
                  <div key={g.key} className="cosmic-card rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">{g.away} @ {g.home}</p>
                      <span className="text-[10px] text-muted-foreground">{format(new Date(g.startTime), "h:mm a")}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {ph && (
                        <div className="flex items-center gap-1">
                          <span className="text-sm">{ph.symbol}</span>
                          <div>
                            <p className="text-[10px] font-medium">{ph.planet} Hour</p>
                            <p className="text-[9px] text-muted-foreground">{ph.isDay ? "Day" : "Night"} chart</p>
                          </div>
                        </div>
                      )}
                      <div className="text-[9px] text-muted-foreground">
                        {g.lat && g.lng ? (
                          <span>📍 {g.lat.toFixed(2)}°N, {Math.abs(g.lng).toFixed(2)}°W</span>
                        ) : "No coordinates"}
                      </div>
                    </div>
                    {g.score && (
                      <p className="text-[10px] text-muted-foreground">Final: {g.score}</p>
                    )}
                  </div>
                );
              });
            })()}
          </TabsContent>

          {/* Tab 4: Historical Player Stats */}
          <TabsContent value="players" className="space-y-2 mt-3">
            <Input placeholder="Search player or team..." value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} className="h-8 text-xs mb-2" />
            {filteredPlayerStats.length === 0 ? (
              <div className="cosmic-card rounded-xl p-8 text-center">
                <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm font-medium">No player stats found</p>
              </div>
            ) : filteredPlayerStats.slice(0, 30).map((s: any) => (
              <div key={s.id} className="cosmic-card rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-xs font-semibold">{s.players?.name || "Unknown"}</p>
                    <p className="text-[9px] text-muted-foreground">{s.team_abbr}{s.players?.birth_date ? ` · 🎂 ${s.players.birth_date}` : ""}</p>
                  </div>
                  <span className="text-sm font-bold text-primary tabular-nums">{s.points ?? 0} PTS</span>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span>{s.rebounds ?? 0} REB</span>
                  <span>{s.assists ?? 0} AST</span>
                  <span>{s.steals ?? 0} STL</span>
                  <span>{s.blocks ?? 0} BLK</span>
                  <span>{s.turnovers ?? 0} TO</span>
                  {s.minutes && <span>{s.minutes} MIN</span>}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* Tab 5: Team Market Outcomes */}
          <TabsContent value="markets" className="space-y-2 mt-3">
            {marketOutcomes.length === 0 ? (
              <div className="cosmic-card rounded-xl p-8 text-center">
                <Target className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm font-medium">No market outcome data</p>
              </div>
            ) : marketOutcomes.map(({ game: g, homeWon, totalScore, avgSpreadLine, avgTotalLine, homeCoveredATS, wentOver }) => (
              <div key={g.id} className="cosmic-card rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">{g.away_abbr} @ {g.home_abbr}</p>
                  {g.home_score != null && (
                    <span className="text-xs font-bold tabular-nums">{g.away_score}-{g.home_score}</span>
                  )}
                </div>
                <div className="flex gap-3 text-[10px]">
                  {homeWon !== undefined && (
                    <span className={homeWon ? "text-cosmic-green font-bold" : "text-cosmic-red font-bold"}>
                      ML: {homeWon ? g.home_abbr : g.away_abbr}
                    </span>
                  )}
                  {homeCoveredATS != null && avgSpreadLine != null && (
                    <span className={homeCoveredATS ? "text-cosmic-green" : "text-cosmic-red"}>
                      ATS: {homeCoveredATS ? g.home_abbr : g.away_abbr} ({avgSpreadLine > 0 ? "+" : ""}{avgSpreadLine.toFixed(1)})
                    </span>
                  )}
                  {wentOver != null && avgTotalLine != null && (
                    <span className={wentOver ? "text-cosmic-green" : "text-cosmic-red"}>
                      O/U: {wentOver ? "OVER" : "UNDER"} ({avgTotalLine.toFixed(1)}) · {totalScore}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* Tab 6: Backtest (Admin Only) */}
          {isAdmin && (
          <TabsContent value="backtest" className="space-y-3 mt-3">
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
                      <button key={lg} onClick={() => {
                        setBtLeagues(prev => isSelected ? prev.filter(l => l !== lg) : [...prev, lg]);
                      }}
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
                <Input
                  type="number"
                  min={1}
                  value={flatBet}
                  onChange={e => setFlatBet(Math.max(1, parseInt(e.target.value) || 100))}
                  className="h-7 text-xs w-28"
                />
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
                          <Slider
                            value={[btWeights[def.key] ?? def.default]}
                            onValueChange={([v]) => setBtWeights(prev => ({ ...prev, [def.key]: v }))}
                            min={0} max={50} step={1}
                            className="w-full"
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
                <button
                  onClick={() => setBtWeights({ ...DEFAULT_WEIGHTS })}
                  className="text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Reset to defaults
                </button>
              </div>

              {/* Preset Save/Load */}
              <div className="space-y-2 pt-2 border-t border-border/30">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Presets</h4>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Preset name..."
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                    className="h-7 text-[10px] flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] px-2"
                    onClick={() => savePresetMutation.mutate()}
                    disabled={!presetName.trim() || savePresetMutation.isPending}
                  >
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
                            {p.weights_json && Object.keys(p.weights_json).length > 0
                              ? `(${Object.keys(p.weights_json).length} models)`
                              : `(${p.home_away_splits}/${p.schedule_fatigue}/${p.recent_form}/${p.h2h_history})`}
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

              <Button onClick={() => backtestMutation.mutate()} disabled={!btStart || !btEnd || btLeagues.length === 0 || backtestMutation.isPending}
                className="w-full text-xs" size="sm">
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
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                                  isProfitable ? "bg-cosmic-green/20 text-cosmic-green" : "bg-cosmic-red/20 text-cosmic-red"
                                }`}>
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

                {/* Comparison Chart: This Model vs Pro vs Casual */}
                {btResult.roi_simulation && (
                  <div className="cosmic-card rounded-xl p-4 space-y-3">
                    <div>
                      <h4 className="text-xs font-semibold">
                        {btResult.roi_simulation.roi >= 7 ? "🏆 This Model Wins Across the Board" :
                         btResult.roi_simulation.roi >= 4 ? "🏆 This Model Matches the Pros" :
                         btResult.roi_simulation.roi >= 0 ? "📊 This Model is Profitable" :
                         "📉 Model Needs Tuning"}
                      </h4>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {btResult.roi_simulation.roi >= 7
                          ? `All bet types are profitable with the highest ROI of ${Math.max(...Object.values(btResult.by_market || {}).map((m: any) => m.roi || 0))}%. This model demonstrates consistent winning performance across every bet type.`
                          : btResult.roi_simulation.roi >= 4
                          ? `With a ${btResult.roi_simulation.roi}% ROI, this model performs on par with professional bettors and well above the average casual bettor (-5%).`
                          : btResult.roi_simulation.roi >= 0
                          ? `With a ${btResult.roi_simulation.roi}% ROI, this model is profitable but has room for improvement. Adjust weights to optimize.`
                          : `This model returned ${btResult.roi_simulation.roi}% ROI. Consider adjusting model weights to improve performance.`}
                      </p>
                    </div>
                    <div className="space-y-2 pt-2">
                      {/* This Model bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium w-24 text-right">This Model</span>
                        <div className="flex-1 h-4 bg-secondary/30 rounded-full overflow-hidden relative">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(2, (btResult.roi_simulation.roi + 10) * 3))}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-bold tabular-nums w-14 text-right ${
                          btResult.roi_simulation.roi >= 0 ? "text-cosmic-green" : "text-cosmic-red"
                        }`}>
                          {btResult.roi_simulation.roi > 0 ? "+" : ""}{btResult.roi_simulation.roi}%
                        </span>
                      </div>
                      {/* Pro Bettor bar (fixed 4-7%) */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium w-24 text-right text-muted-foreground">Pro Bettor</span>
                        <div className="flex-1 h-4 bg-secondary/30 rounded-full overflow-hidden relative">
                          <div className="h-full bg-muted-foreground/50 rounded-full" style={{ width: `${(5.5 + 10) * 3}%` }} />
                        </div>
                        <span className="text-[10px] font-medium tabular-nums w-14 text-right text-muted-foreground">4–7%</span>
                      </div>
                      {/* Casual Bettor bar (fixed -5%) */}
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

                {/* Per-League Breakdown (multi-league only) */}
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
          </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
