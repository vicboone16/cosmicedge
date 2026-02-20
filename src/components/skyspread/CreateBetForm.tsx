import { useState, useMemo } from "react";
import { Plus, X, CalendarDays, DollarSign, Zap } from "lucide-react";
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

const MARKET_TYPES = [
  { value: "moneyline", label: "Moneyline" },
  { value: "spread", label: "Spread" },
  { value: "total", label: "Total" },
  { value: "team_total", label: "Team Total" },
  { value: "player_prop", label: "Player Prop" },
  { value: "first_half", label: "1st Half" },
  { value: "second_half", label: "2nd Half" },
  { value: "first_quarter", label: "1st Quarter" },
];

const SIDES = [
  { value: "home", label: "Home" },
  { value: "away", label: "Away" },
  { value: "over", label: "Over" },
  { value: "under", label: "Under" },
  { value: "player", label: "Player" },
];

interface BetLeg {
  gameId: string;
  marketType: string;
  selection: string;
  side: string;
  line: string;
  odds: string;
}

function emptyLeg(): BetLeg {
  return { gameId: "", marketType: "moneyline", selection: "", side: "", line: "", odds: "" };
}

interface CreateBetFormProps {
  userId: string;
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

  // Past 7 + future 7 days — use LOCAL date to avoid UTC-day mismatch
  const dateOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    // Get local date parts to build date strings correctly
    const localYear = now.getFullYear();
    const localMonth = now.getMonth();
    const localDay = now.getDate();
    const localToday = new Date(localYear, localMonth, localDay);
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
        // Use proper UTC boundaries: ±7 local days converted to UTC
        const now = new Date();
        const pastBound = subDays(now, 7);
        const futureBound = addDays(now, 7);
        query = query
          .gte("start_time", pastBound.toISOString())
          .lte("start_time", futureBound.toISOString())
          .limit(300);
      } else {
        // Convert local date boundaries to UTC for the query
        // e.g. "2026-02-19" → local midnight → UTC ISO string
        const localStart = new Date(selectedDate + "T00:00:00");
        const localEnd = new Date(selectedDate + "T23:59:59");
        query = query
          .gte("start_time", localStart.toISOString())
          .lte("start_time", localEnd.toISOString())
          .limit(500);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Deduplicate: keep one game per (home_abbr, away_abbr, local-date), prefer non-thesportsdb source
      const seen = new Map<string, GameRow>();
      for (const g of (data || []) as GameRow[]) {
        // Use local date string to group correctly by the user's calendar day
        const localDate = new Date(g.start_time).toLocaleDateString();
        const key = `${g.home_abbr}-${g.away_abbr}-${g.league}-${localDate}`;
        if (!seen.has(key)) {
          seen.set(key, g);
        } else {
          const existing = seen.get(key)!;
          if (existing.source === "thesportsdb" && g.source !== "thesportsdb") {
            seen.set(key, g);
          }
        }
      }
      return Array.from(seen.values()).sort((a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
    },
  });

  // In SGP mode, lock all legs to the same game
  const sgpGameId = sgpMode && legs.length > 0 ? legs[0].gameId : null;

  const updateLeg = (idx: number, patch: Partial<BetLeg>) => {
    setLegs(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, ...patch };
      // SGP: force same game
      if (sgpMode && idx > 0 && patch.gameId === undefined && sgpGameId) {
        updated.gameId = sgpGameId;
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
    setBook("");
    setStakeAmount("");
    setStakeUnit("$");
    setConfidence([50]);
    setEdgeScore([50]);
    setWhySummary("");
    setNotes("");
    setSelectedDate("all");
    setSgpMode(false);
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
      // Profit = stake * (decimal - 1)
      const dec = americanToDecimal(parlayOdds);
      return (stake * (dec - 1)).toFixed(2);
    } else {
      const odds = parseInt(legs[0]?.odds, 10);
      if (isNaN(odds)) return null;
      // Profit only: for -120 on $100 → $83.33, for +150 on $100 → $150
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
          start_time: game?.start_time ?? null, market_type: leg.marketType,
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
        start_time: game?.start_time ?? null, market_type: leg.marketType,
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
                // SGP: when first leg game changes, update all others
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

// ── Individual Leg Component ──
function LegForm({
  leg, legIndex, totalLegs, games, sgpMode, onUpdate, onRemove,
}: {
  leg: BetLeg; legIndex: number; totalLegs: number; games: GameRow[];
  sgpMode: boolean;
  onUpdate: (patch: Partial<BetLeg>) => void; onRemove: () => void;
}) {
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

      {/* Game Selector - hidden for SGP legs > 0 */}
      {(!sgpMode || legIndex === 0) && (
        <div className="space-y-1.5">
          <Label className="text-xs">Game *</Label>
          <Select value={leg.gameId} onValueChange={(v) => onUpdate({ gameId: v })}>
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
              {games.length === 0 && (
                <SelectItem value="none" disabled>No games found</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {sgpMode && legIndex > 0 && leg.gameId && (
        <p className="text-[10px] text-primary/70">
          🔒 Same game as Leg 1: {games.find(g => g.id === leg.gameId)?.away_abbr} @ {games.find(g => g.id === leg.gameId)?.home_abbr}
        </p>
      )}

      {/* Market Type */}
      <div className="space-y-1.5">
        <Label className="text-xs">Market Type</Label>
        <Select value={leg.marketType} onValueChange={(v) => onUpdate({ marketType: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MARKET_TYPES.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Selection */}
      <div className="space-y-1.5">
        <Label className="text-xs">Selection / Pick *</Label>
        <Input placeholder='e.g. "Lakers -3.5"' value={leg.selection} onChange={(e) => onUpdate({ selection: e.target.value })} />
      </div>

      {/* Side */}
      <div className="space-y-1.5">
        <Label className="text-xs">Side</Label>
        <Select value={leg.side} onValueChange={(v) => onUpdate({ side: v })}>
          <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
          <SelectContent>
            {SIDES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
