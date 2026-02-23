import { useState, useMemo, useEffect } from "react";
import { Plus, X, CalendarDays, DollarSign, Zap, User, Trophy } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, addDays, subDays } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type GameRow = Tables<"games">;

/* ─── Option Constants ─── */

const BET_CATEGORIES = [
  { value: "game", label: "Game Bet", icon: Trophy },
  { value: "player_prop", label: "Player Prop", icon: User },
];

const GAME_MARKET_TYPES = [
  { value: "moneyline", label: "Moneyline" },
  { value: "spread", label: "Spread" },
  { value: "total", label: "Total (O/U)" },
  { value: "team_total", label: "Team Total" },
  { value: "other", label: "Other" },
];

const PERIOD_OPTIONS = [
  { value: "full", label: "Full Game" },
  { value: "1H", label: "1st Half" },
  { value: "2H", label: "2nd Half" },
  { value: "1Q", label: "1st Quarter" },
  { value: "2Q", label: "2nd Quarter" },
  { value: "3Q", label: "3rd Quarter" },
  { value: "4Q", label: "4th Quarter" },
  { value: "1P", label: "1st Period" },
  { value: "2P", label: "2nd Period" },
  { value: "3P", label: "3rd Period" },
];

const SIDES_GAME = [
  { value: "home", label: "Home" },
  { value: "away", label: "Away" },
  { value: "over", label: "Over" },
  { value: "under", label: "Under" },
];

const PROP_STAT_TYPES = [
  { value: "points", label: "Points" },
  { value: "rebounds", label: "Rebounds" },
  { value: "assists", label: "Assists" },
  { value: "threes", label: "3-Pointers Made" },
  { value: "blocks", label: "Blocks" },
  { value: "steals", label: "Steals" },
  { value: "turnovers", label: "Turnovers" },
  { value: "points_rebounds_assists", label: "PTS+REB+AST" },
  { value: "double_double", label: "Double-Double" },
  { value: "passing_yards", label: "Passing Yards" },
  { value: "rushing_yards", label: "Rushing Yards" },
  { value: "receiving_yards", label: "Receiving Yards" },
  { value: "passing_tds", label: "Passing TDs" },
  { value: "receptions", label: "Receptions" },
  { value: "goals", label: "Goals" },
  { value: "saves", label: "Saves" },
  { value: "shots_on_goal", label: "Shots on Goal" },
  { value: "strikeouts", label: "Strikeouts" },
  { value: "hits", label: "Hits" },
  { value: "home_runs", label: "Home Runs" },
  { value: "total_bases", label: "Total Bases" },
  { value: "other", label: "Other" },
];

interface BetLeg {
  gameId: string;
  category: "game" | "player_prop";
  marketType: string;
  period: string;
  selection: string;
  side: string;
  playerId: string;
  playerName: string;
  propType: string;
  line: string;
  odds: string;
}

function emptyLeg(): BetLeg {
  return {
    gameId: "", category: "game", marketType: "moneyline", period: "full",
    selection: "", side: "", playerId: "", playerName: "", propType: "",
    line: "", odds: "",
  };
}

interface CreateBetFormProps {
  userId: string;
  prefill?: {
    player?: string;
    market?: string;
    line?: string;
    odds?: string;
    gameId?: string;
    side?: string;
    period?: string;
  } | null;
  onPrefillConsumed?: () => void;
}

function americanToDecimal(odds: number): number {
  if (odds > 0) return (odds / 100) + 1;
  return (100 / Math.abs(odds)) + 1;
}

export default function CreateBetForm({ userId }: CreateBetFormProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string>("all");
  const [legs, setLegs] = useState<BetLeg[]>([emptyLeg()]);
  const [sgpMode, setSgpMode] = useState(false);
  const isParlay = legs.length > 1;

  const [book, setBook] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [stakeUnit, setStakeUnit] = useState("$");
  const [confidence, setConfidence] = useState([50]);
  const [edgeScore, setEdgeScore] = useState([50]);
  const [whySummary, setWhySummary] = useState("");
  const [notes, setNotes] = useState("");

  const dateOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let i = -7; i <= 7; i++) {
      const d = addDays(localToday, i);
      const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : i === -1 ? "Yesterday" : format(d, "EEE, MMM d");
      opts.push({ value: format(d, "yyyy-MM-dd"), label });
    }
    return opts;
  }, []);

  const { data: games } = useQuery({
    queryKey: ["games-for-bet-form", selectedDate],
    queryFn: async () => {
      let query = supabase.from("games").select("*").order("start_time", { ascending: true });
      if (selectedDate === "all") {
        const now = new Date();
        query = query
          .gte("start_time", subDays(now, 7).toISOString())
          .lte("start_time", addDays(now, 7).toISOString())
          .limit(300);
      } else {
        const localStart = new Date(selectedDate + "T00:00:00");
        const localEnd = new Date(selectedDate + "T23:59:59");
        query = query
          .gte("start_time", localStart.toISOString())
          .lte("start_time", localEnd.toISOString())
          .limit(500);
      }
      const { data, error } = await query;
      if (error) throw error;
      const seen = new Map<string, GameRow>();
      for (const g of (data || []) as GameRow[]) {
        const localDate = new Date(g.start_time).toLocaleDateString();
        const key = `${g.home_abbr}-${g.away_abbr}-${g.league}-${localDate}`;
        if (!seen.has(key)) { seen.set(key, g); }
        else { const ex = seen.get(key)!; if (ex.source === "thesportsdb" && g.source !== "thesportsdb") seen.set(key, g); }
      }
      return Array.from(seen.values()).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    },
  });

  const sgpGameId = sgpMode && legs.length > 0 ? legs[0].gameId : null;

  const updateLeg = (idx: number, patch: Partial<BetLeg>) => {
    setLegs(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, ...patch };
      if (sgpMode && idx > 0 && patch.gameId === undefined && sgpGameId) {
        updated.gameId = sgpGameId;
      }
      // Auto-build selection text
      if (patch.category || patch.marketType || patch.side || patch.period || patch.playerName || patch.propType) {
        const g = games?.find(g => g.id === (patch.gameId || updated.gameId));
        if (updated.category === "player_prop" && updated.playerName) {
          const propLabel = PROP_STAT_TYPES.find(p => p.value === updated.propType)?.label || updated.propType;
          updated.selection = `${updated.playerName} ${propLabel} ${updated.side === "over" ? "Over" : updated.side === "under" ? "Under" : ""} ${updated.line}`.trim();
        } else if (g) {
          const teamLabel = updated.side === "home" ? g.home_abbr : updated.side === "away" ? g.away_abbr : updated.side === "over" ? "Over" : updated.side === "under" ? "Under" : "";
          const marketLabel = GAME_MARKET_TYPES.find(m => m.value === updated.marketType)?.label || updated.marketType;
          const periodLabel = updated.period !== "full" ? ` (${PERIOD_OPTIONS.find(p => p.value === updated.period)?.label || updated.period})` : "";
          updated.selection = `${teamLabel} ${marketLabel}${periodLabel} ${updated.line}`.trim();
        }
      }
      return updated;
    }));
  };

  const addLeg = () => {
    const newLeg = emptyLeg();
    if (sgpMode && sgpGameId) newLeg.gameId = sgpGameId;
    setLegs(prev => [...prev, newLeg]);
  };

  const removeLeg = (idx: number) => {
    if (legs.length <= 1) return;
    setLegs(prev => prev.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setLegs([emptyLeg()]);
    setBook(""); setStakeAmount(""); setStakeUnit("$");
    setConfidence([50]); setEdgeScore([50]);
    setWhySummary(""); setNotes(""); setSelectedDate("all"); setSgpMode(false);
  };

  const calculateParlayOdds = (): number | null => {
    const oddsValues = legs.map(l => parseInt(l.odds, 10)).filter(o => !isNaN(o));
    if (oddsValues.length < 2) return null;
    const decimalOdds = oddsValues.map(americanToDecimal);
    const combinedDecimal = decimalOdds.reduce((acc, d) => acc * d, 1);
    if (combinedDecimal >= 2) return Math.round((combinedDecimal - 1) * 100);
    return Math.round(-100 / (combinedDecimal - 1));
  };

  const projectedWin = useMemo(() => {
    const stake = parseFloat(stakeAmount);
    if (!stake || isNaN(stake)) return null;
    if (isParlay) {
      const parlayOdds = calculateParlayOdds();
      if (!parlayOdds) return null;
      const dec = americanToDecimal(parlayOdds);
      return (stake * (dec - 1)).toFixed(2);
    } else {
      const odds = parseInt(legs[0]?.odds, 10);
      if (isNaN(odds)) return null;
      if (odds > 0) return (stake * odds / 100).toFixed(2);
      return (stake * 100 / Math.abs(odds)).toFixed(2);
    }
  }, [stakeAmount, legs, isParlay]);

  const handleSubmit = async () => {
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (!leg.gameId || !leg.selection || !leg.odds) {
        toast.error(`Leg ${i + 1}: Game, selection, and odds are required.`);
        return;
      }
      if (isNaN(parseInt(leg.odds, 10))) {
        toast.error(`Leg ${i + 1}: Odds must be a valid integer.`);
        return;
      }
    }

    setSubmitting(true);

    if (isParlay) {
      const parlayId = `parlay_${Date.now()}`;
      const parlayOdds = calculateParlayOdds();
      const inserts = legs.map((leg, i) => {
        const game = games?.find(g => g.id === leg.gameId);
        return {
          user_id: userId, game_id: leg.gameId,
          home_team: game?.home_team ?? null, away_team: game?.away_team ?? null,
          start_time: game?.start_time ?? null,
          market_type: leg.category === "player_prop" ? "player_prop" : leg.marketType,
          selection: leg.selection, side: leg.side || null,
          line: leg.line ? parseFloat(leg.line) : null,
          odds: parseInt(leg.odds, 10), book: book || null,
          stake_amount: stakeAmount ? parseFloat(stakeAmount) : null,
          stake_unit: stakeUnit, confidence: confidence[0], edge_score: edgeScore[0],
          why_summary: whySummary || null,
          notes: `${parlayId} | ${sgpMode ? "SGP" : "Parlay"} Leg ${i + 1}/${legs.length}${parlayOdds ? ` | Combined: ${parlayOdds > 0 ? "+" : ""}${parlayOdds}` : ""}${notes ? ` | ${notes}` : ""}`,
        };
      });
      const { error } = await supabase.from("bets").insert(inserts);
      setSubmitting(false);
      if (error) { toast.error("Failed: " + error.message); }
      else { toast.success(`${sgpMode ? "SGP" : "Parlay"} (${legs.length} legs) created!`); resetForm(); setOpen(false); queryClient.invalidateQueries({ queryKey: ["skyspread-bets"] }); }
    } else {
      const leg = legs[0];
      const game = games?.find(g => g.id === leg.gameId);
      const toWin = projectedWin ? parseFloat(projectedWin) : null;
      const { error } = await supabase.from("bets").insert({
        user_id: userId, game_id: leg.gameId,
        home_team: game?.home_team ?? null, away_team: game?.away_team ?? null,
        start_time: game?.start_time ?? null,
        market_type: leg.category === "player_prop" ? "player_prop" : leg.marketType,
        selection: leg.selection, side: leg.side || null,
        line: leg.line ? parseFloat(leg.line) : null,
        odds: parseInt(leg.odds, 10), book: book || null,
        stake_amount: stakeAmount ? parseFloat(stakeAmount) : null,
        to_win_amount: toWin,
        stake_unit: stakeUnit, confidence: confidence[0], edge_score: edgeScore[0],
        why_summary: whySummary || null, notes: notes || null,
      });
      setSubmitting(false);
      if (error) { toast.error("Failed: " + error.message); }
      else { toast.success("Bet created!"); resetForm(); setOpen(false); queryClient.invalidateQueries({ queryKey: ["skyspread-bets"] }); }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {sgpMode ? "Same Game Parlay" : isParlay ? `Create Parlay (${legs.length} legs)` : "Create Bet"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* SGP Toggle */}
          <div className="flex gap-2">
            <button onClick={() => setSgpMode(false)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!sgpMode ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground"}`}>
              Standard
            </button>
            <button onClick={() => { setSgpMode(true); if (legs.length < 2) addLeg(); }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${sgpMode ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground"}`}>
              <Zap className="h-3 w-3" /> SGP
            </button>
          </div>

          {/* Date Filter */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Day</Label>
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger><SelectValue placeholder="All games" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All games (±7 days)</SelectItem>
                {dateOptions.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Legs */}
          {legs.map((leg, idx) => (
            <LegForm
              key={idx}
              leg={leg}
              legIndex={idx}
              totalLegs={legs.length}
              games={sgpMode && idx > 0 && sgpGameId ? (games || []).filter(g => g.id === sgpGameId) : (games || [])}
              sgpMode={sgpMode}
              onUpdate={(patch) => {
                updateLeg(idx, patch);
                if (sgpMode && idx === 0 && patch.gameId) {
                  setLegs(prev => prev.map((l, i) => i === 0 ? { ...l, ...patch } : { ...l, gameId: patch.gameId! }));
                }
              }}
              onRemove={() => removeLeg(idx)}
            />
          ))}

          {/* Add Leg Button */}
          <Button variant="outline" size="sm" onClick={addLeg} className="w-full text-xs">
            <Plus className="h-3 w-3 mr-1" /> Add Leg {sgpMode ? "(SGP)" : "(Parlay)"}
          </Button>

          {/* Parlay odds preview */}
          {isParlay && calculateParlayOdds() && (
            <div className="cosmic-card rounded-lg p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Combined {sgpMode ? "SGP" : "Parlay"} Odds</p>
              <p className="text-sm font-bold font-display text-primary tabular-nums">
                {calculateParlayOdds()! > 0 ? "+" : ""}{calculateParlayOdds()}
              </p>
            </div>
          )}

          {/* Book */}
          <div className="space-y-1.5">
            <Label className="text-xs">Book</Label>
            <Input placeholder="Sportsbook name" value={book} onChange={(e) => setBook(e.target.value)} />
          </div>

          {/* Stake */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><DollarSign className="h-3 w-3" /> Stake</Label>
              <Input type="number" placeholder="25.00" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unit</Label>
              <Select value={stakeUnit} onValueChange={setStakeUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="$">$</SelectItem>
                  <SelectItem value="units">Units</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Projected Win Summary Bar */}
          {(stakeAmount && projectedWin) && (
            <div className="bg-primary/10 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground">Stake</p>
                <p className="text-sm font-bold tabular-nums">{stakeUnit === "$" ? "$" : ""}{stakeAmount}{stakeUnit !== "$" ? ` ${stakeUnit}` : ""}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Projected Win</p>
                <p className="text-sm font-bold text-cosmic-green tabular-nums">{stakeUnit === "$" ? "$" : ""}{projectedWin}</p>
              </div>
            </div>
          )}

          {/* Confidence slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Confidence</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">{confidence[0]}</span>
            </div>
            <Slider min={0} max={100} step={1} value={confidence} onValueChange={setConfidence} />
          </div>

          {/* Edge Score slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Edge Score</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">{edgeScore[0]}</span>
            </div>
            <Slider min={0} max={100} step={1} value={edgeScore} onValueChange={setEdgeScore} />
          </div>

          {/* Why Summary */}
          <div className="space-y-1.5">
            <Label className="text-xs">Why Summary</Label>
            <Textarea placeholder="Short explanation..." value={whySummary} onChange={(e) => setWhySummary(e.target.value)} rows={2} />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea placeholder="Additional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <Button onClick={handleSubmit} disabled={submitting} className="w-full">
            {submitting ? "Creating..." : sgpMode ? `Create SGP (${legs.length} legs)` : isParlay ? `Create ${legs.length}-Leg Parlay` : "Create Bet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Individual Leg Component with Cascading Dropdowns ─── */

function LegForm({
  leg, legIndex, totalLegs, games, sgpMode, onUpdate, onRemove,
}: {
  leg: BetLeg; legIndex: number; totalLegs: number; games: GameRow[];
  sgpMode: boolean;
  onUpdate: (patch: Partial<BetLeg>) => void; onRemove: () => void;
}) {
  const selectedGame = games.find(g => g.id === leg.gameId);

  // Fetch players for the selected game (from players table by team)
  const { data: gamePlayers } = useQuery({
    queryKey: ["leg-players", leg.gameId, selectedGame?.home_abbr, selectedGame?.away_abbr],
    queryFn: async () => {
      if (!selectedGame) return [];
      const { data, error } = await supabase
        .from("players")
        .select("id, name, team, position")
        .in("team", [selectedGame.home_abbr, selectedGame.away_abbr])
        .eq("status", "active")
        .order("name")
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGame && leg.category === "player_prop",
  });

  // Fetch available SGO odds for auto-fill
  const { data: sgoOdds } = useQuery({
    queryKey: ["sgo-odds-for-leg", leg.gameId],
    queryFn: async () => {
      if (!leg.gameId) return [];
      const { data, error } = await supabase
        .from("sgo_market_odds")
        .select("*")
        .eq("game_id", leg.gameId)
        .eq("bookmaker", "consensus")
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!leg.gameId,
  });

  // Auto-fill odds from SGO when market selections change
  useEffect(() => {
    if (!sgoOdds?.length || !leg.gameId) return;

    if (leg.category === "game" && leg.marketType && leg.side && leg.period) {
      const betTypeMap: Record<string, string> = { moneyline: "ml", spread: "sp", total: "ou", team_total: "ou" };
      const bt = betTypeMap[leg.marketType] || leg.marketType;
      const match = sgoOdds.find(o =>
        o.bet_type === bt && o.side === leg.side && o.period === (leg.period === "full" ? "full" : leg.period) && !o.is_player_prop
      );
      if (match) {
        onUpdate({
          odds: match.odds?.toString() || "",
          line: match.line?.toString() || "",
        });
      }
    }
  }, [leg.marketType, leg.side, leg.period, leg.category, sgoOdds]);

  // Period options filtered by league
  const leaguePeriods = useMemo(() => {
    if (!selectedGame) return PERIOD_OPTIONS;
    const league = selectedGame.league;
    if (league === "NHL") return PERIOD_OPTIONS.filter(p => ["full", "1P", "2P", "3P"].includes(p.value));
    if (league === "MLB") return [{ value: "full", label: "Full Game" }];
    if (league === "NFL" || league === "NBA") return PERIOD_OPTIONS.filter(p => !["1P", "2P", "3P"].includes(p.value));
    return PERIOD_OPTIONS;
  }, [selectedGame]);

  return (
    <div className="space-y-3 cosmic-card rounded-xl p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">
          {totalLegs > 1 ? `${sgpMode ? "SGP " : ""}Leg ${legIndex + 1}` : "Pick"}
        </span>
        {totalLegs > 1 && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Step 1: Bet Category — Game or Player Prop */}
      <div className="flex gap-2">
        {BET_CATEGORIES.map(cat => (
          <button key={cat.value}
            onClick={() => onUpdate({ category: cat.value as BetLeg["category"], marketType: cat.value === "player_prop" ? "player_prop" : "moneyline", side: "", playerName: "", propType: "", selection: "" })}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-colors flex items-center justify-center gap-1 ${
              leg.category === cat.value ? "bg-accent text-accent-foreground" : "bg-secondary/40 text-muted-foreground hover:bg-secondary"
            }`}>
            <cat.icon className="h-3 w-3" />
            {cat.label}
          </button>
        ))}
      </div>

      {/* Step 2: Game Selector */}
      {(!sgpMode || legIndex === 0) && (
        <div className="space-y-1.5">
          <Label className="text-xs">Game *</Label>
          <Select value={leg.gameId} onValueChange={(v) => onUpdate({ gameId: v, side: "", playerName: "", propType: "", selection: "" })}>
            <SelectTrigger><SelectValue placeholder="Select a game" /></SelectTrigger>
            <SelectContent>
              {games.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  <span className="text-[10px] text-muted-foreground mr-1">[{g.league}]</span>
                  {g.away_abbr} @ {g.home_abbr}
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {format(new Date(g.start_time), "M/d h:mm a")}
                  </span>
                </SelectItem>
              ))}
              {games.length === 0 && <SelectItem value="none" disabled>No games found</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      )}

      {sgpMode && legIndex > 0 && leg.gameId && (
        <p className="text-[10px] text-primary/70">
          🔒 Same game as Leg 1: {games.find(g => g.id === leg.gameId)?.away_abbr} @ {games.find(g => g.id === leg.gameId)?.home_abbr}
        </p>
      )}

      {/* GAME BET FLOW */}
      {leg.category === "game" && leg.gameId && (
        <>
          {/* Step 3: Period */}
          <div className="space-y-1.5">
            <Label className="text-xs">Period</Label>
            <Select value={leg.period} onValueChange={(v) => onUpdate({ period: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {leaguePeriods.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Step 4: Market Type */}
          <div className="space-y-1.5">
            <Label className="text-xs">Market Type</Label>
            <Select value={leg.marketType} onValueChange={(v) => onUpdate({ marketType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GAME_MARKET_TYPES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Step 5: Side */}
          <div className="space-y-1.5">
            <Label className="text-xs">Side</Label>
            <Select value={leg.side} onValueChange={(v) => onUpdate({ side: v })}>
              <SelectTrigger><SelectValue placeholder="Select side" /></SelectTrigger>
              <SelectContent>
                {leg.marketType === "moneyline" || leg.marketType === "spread" || leg.marketType === "team_total" ? (
                  <>
                    <SelectItem value="home">{selectedGame?.home_abbr || "Home"}</SelectItem>
                    <SelectItem value="away">{selectedGame?.away_abbr || "Away"}</SelectItem>
                  </>
                ) : leg.marketType === "total" ? (
                  <>
                    <SelectItem value="over">Over</SelectItem>
                    <SelectItem value="under">Under</SelectItem>
                  </>
                ) : (
                  SIDES_GAME.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)
                )}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* PLAYER PROP FLOW */}
      {leg.category === "player_prop" && leg.gameId && (
        <>
          {/* Step 3: Player */}
          <div className="space-y-1.5">
            <Label className="text-xs">Player *</Label>
            <Select value={leg.playerName || ""} onValueChange={(v) => {
              const player = gamePlayers?.find(p => p.name === v);
              onUpdate({ playerName: v, playerId: player?.id || "", propType: "", side: "", selection: "" });
            }}>
              <SelectTrigger><SelectValue placeholder="Select player" /></SelectTrigger>
              <SelectContent>
                {selectedGame && (
                  <>
                    <SelectItem value="" disabled className="text-[10px] text-muted-foreground font-semibold">— {selectedGame.home_abbr} —</SelectItem>
                    {(gamePlayers || []).filter(p => p.team === selectedGame.home_abbr).map(p => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name} <span className="text-[10px] text-muted-foreground ml-1">{p.position}</span>
                      </SelectItem>
                    ))}
                    <SelectItem value="" disabled className="text-[10px] text-muted-foreground font-semibold">— {selectedGame.away_abbr} —</SelectItem>
                    {(gamePlayers || []).filter(p => p.team === selectedGame.away_abbr).map(p => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name} <span className="text-[10px] text-muted-foreground ml-1">{p.position}</span>
                      </SelectItem>
                    ))}
                  </>
                )}
                {(!gamePlayers || gamePlayers.length === 0) && (
                  <SelectItem value="none" disabled>No players found</SelectItem>
                )}
              </SelectContent>
            </Select>
            {/* Manual player name input as fallback */}
            {(!gamePlayers || gamePlayers.length === 0) && (
              <Input placeholder="Type player name" value={leg.playerName} onChange={(e) => onUpdate({ playerName: e.target.value })} className="mt-1" />
            )}
          </div>

          {/* Step 4: Prop Type */}
          {leg.playerName && (
            <div className="space-y-1.5">
              <Label className="text-xs">Prop Type</Label>
              <Select value={leg.propType} onValueChange={(v) => onUpdate({ propType: v })}>
                <SelectTrigger><SelectValue placeholder="Select prop" /></SelectTrigger>
                <SelectContent>
                  {PROP_STAT_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Step 5: Over/Under */}
          {leg.propType && (
            <div className="space-y-1.5">
              <Label className="text-xs">Side</Label>
              <Select value={leg.side} onValueChange={(v) => onUpdate({ side: v })}>
                <SelectTrigger><SelectValue placeholder="Over / Under" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="over">Over</SelectItem>
                  <SelectItem value="under">Under</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      {/* Selection preview (auto-generated, editable) */}
      <div className="space-y-1.5">
        <Label className="text-xs">Selection / Pick *</Label>
        <Input
          placeholder={leg.category === "player_prop" ? 'e.g. "LeBron James PTS Over 27.5"' : 'e.g. "Lakers -3.5"'}
          value={leg.selection} onChange={(e) => onUpdate({ selection: e.target.value })}
        />
      </div>

      {/* Line + Odds row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Line</Label>
          <Input type="number" step="0.5" placeholder="-3.5" value={leg.line} onChange={(e) => onUpdate({ line: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Odds (American) *</Label>
          <Input type="number" placeholder="-110" value={leg.odds} onChange={(e) => onUpdate({ odds: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
