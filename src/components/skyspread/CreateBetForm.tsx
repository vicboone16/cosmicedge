import { useState } from "react";
import { Plus, X, CalendarDays } from "lucide-react";
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
import { format, addDays } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type GameRow = Tables<"games">;

const MARKET_TYPES = [
  { value: "moneyline", label: "Moneyline" },
  { value: "spread", label: "Spread" },
  { value: "total", label: "Total" },
  { value: "team_total", label: "Team Total" },
  { value: "player_prop", label: "Player Prop" },
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

export default function CreateBetForm({ userId }: CreateBetFormProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Date picker state
  const [selectedDate, setSelectedDate] = useState<string>("all");

  // Multi-leg (parlay) state
  const [legs, setLegs] = useState<BetLeg[]>([emptyLeg()]);
  const isParlay = legs.length > 1;

  // Shared fields
  const [book, setBook] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [stakeUnit, setStakeUnit] = useState("units");
  const [confidence, setConfidence] = useState([50]);
  const [edgeScore, setEdgeScore] = useState([50]);
  const [whySummary, setWhySummary] = useState("");
  const [notes, setNotes] = useState("");

  // Build date options for the next 7 days
  const dateOptions = Array.from({ length: 8 }, (_, i) => {
    const d = addDays(new Date(), i);
    return { value: format(d, "yyyy-MM-dd"), label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : format(d, "EEE, MMM d") };
  });

  const { data: games } = useQuery({
    queryKey: ["games-for-bet-form", selectedDate],
    queryFn: async () => {
      let query = supabase.from("games").select("*").order("start_time", { ascending: true });

      if (selectedDate === "all") {
        const today = new Date().toISOString().slice(0, 10);
        query = query.gte("start_time", today).limit(100);
      } else {
        const nextDay = format(addDays(new Date(selectedDate + "T00:00:00"), 1), "yyyy-MM-dd");
        query = query.gte("start_time", selectedDate).lt("start_time", nextDay);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as GameRow[];
    },
  });

  const updateLeg = (idx: number, patch: Partial<BetLeg>) => {
    setLegs(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const addLeg = () => setLegs(prev => [...prev, emptyLeg()]);

  const removeLeg = (idx: number) => {
    if (legs.length <= 1) return;
    setLegs(prev => prev.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setLegs([emptyLeg()]);
    setBook("");
    setStakeAmount("");
    setStakeUnit("units");
    setConfidence([50]);
    setEdgeScore([50]);
    setWhySummary("");
    setNotes("");
    setSelectedDate("all");
  };

  const calculateParlayOdds = (): number | null => {
    const oddsValues = legs.map(l => parseInt(l.odds, 10)).filter(o => !isNaN(o));
    if (oddsValues.length < 2) return null;
    // Convert to decimal, multiply, convert back to American
    const decimalOdds = oddsValues.map(o => o > 0 ? (o / 100) + 1 : (100 / Math.abs(o)) + 1);
    const combinedDecimal = decimalOdds.reduce((acc, d) => acc * d, 1);
    if (combinedDecimal >= 2) return Math.round((combinedDecimal - 1) * 100);
    return Math.round(-100 / (combinedDecimal - 1));
  };

  const handleSubmit = async () => {
    // Validate all legs
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
      // Create each leg as a separate bet linked by notes
      const parlayId = `parlay_${Date.now()}`;
      const parlayOdds = calculateParlayOdds();
      const inserts = legs.map((leg, i) => {
        const game = games?.find(g => g.id === leg.gameId);
        return {
          user_id: userId,
          game_id: leg.gameId,
          home_team: game?.home_team ?? null,
          away_team: game?.away_team ?? null,
          start_time: game?.start_time ?? null,
          market_type: leg.marketType,
          selection: leg.selection,
          side: leg.side || null,
          line: leg.line ? parseFloat(leg.line) : null,
          odds: parseInt(leg.odds, 10),
          book: book || null,
          stake_amount: stakeAmount ? parseFloat(stakeAmount) : null,
          stake_unit: stakeUnit,
          confidence: confidence[0],
          edge_score: edgeScore[0],
          why_summary: whySummary || null,
          notes: `${parlayId} | Leg ${i + 1}/${legs.length}${parlayOdds ? ` | Parlay odds: ${parlayOdds > 0 ? "+" : ""}${parlayOdds}` : ""}${notes ? ` | ${notes}` : ""}`,
        };
      });

      const { error } = await supabase.from("bets").insert(inserts);
      setSubmitting(false);
      if (error) {
        toast.error("Failed to create parlay: " + error.message);
      } else {
        toast.success(`${legs.length}-leg parlay created!`);
        resetForm();
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: ["skyspread-bets"] });
      }
    } else {
      // Single bet
      const leg = legs[0];
      const game = games?.find(g => g.id === leg.gameId);
      const { error } = await supabase.from("bets").insert({
        user_id: userId,
        game_id: leg.gameId,
        home_team: game?.home_team ?? null,
        away_team: game?.away_team ?? null,
        start_time: game?.start_time ?? null,
        market_type: leg.marketType,
        selection: leg.selection,
        side: leg.side || null,
        line: leg.line ? parseFloat(leg.line) : null,
        odds: parseInt(leg.odds, 10),
        book: book || null,
        stake_amount: stakeAmount ? parseFloat(stakeAmount) : null,
        stake_unit: stakeUnit,
        confidence: confidence[0],
        edge_score: edgeScore[0],
        why_summary: whySummary || null,
        notes: notes || null,
      });
      setSubmitting(false);
      if (error) {
        toast.error("Failed to create bet: " + error.message);
      } else {
        toast.success("Bet created!");
        resetForm();
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: ["skyspread-bets"] });
      }
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
            {isParlay ? `Create Parlay (${legs.length} legs)` : "Create Bet"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Date Filter */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> Day
            </Label>
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger><SelectValue placeholder="All upcoming" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All upcoming</SelectItem>
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
              games={games || []}
              onUpdate={(patch) => updateLeg(idx, patch)}
              onRemove={() => removeLeg(idx)}
            />
          ))}

          {/* Add Leg Button */}
          <Button variant="outline" size="sm" onClick={addLeg} className="w-full text-xs">
            <Plus className="h-3 w-3 mr-1" /> Add Leg (Parlay)
          </Button>

          {/* Parlay odds preview */}
          {isParlay && calculateParlayOdds() && (
            <div className="cosmic-card rounded-lg p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Combined Parlay Odds</p>
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
              <Label className="text-xs">Stake Amount</Label>
              <Input type="number" placeholder="1" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Stake Unit</Label>
              <Select value={stakeUnit} onValueChange={setStakeUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="units">Units</SelectItem>
                  <SelectItem value="$">$</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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
            {submitting ? "Creating..." : isParlay ? `Create ${legs.length}-Leg Parlay` : "Create Bet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Individual Leg Component ──
function LegForm({
  leg,
  legIndex,
  totalLegs,
  games,
  onUpdate,
  onRemove,
}: {
  leg: BetLeg;
  legIndex: number;
  totalLegs: number;
  games: GameRow[];
  onUpdate: (patch: Partial<BetLeg>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 cosmic-card rounded-xl p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">
          {totalLegs > 1 ? `Leg ${legIndex + 1}` : "Pick"}
        </span>
        {totalLegs > 1 && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Game Selector */}
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
                  {format(new Date(g.start_time), "h:mm a")}
                </span>
              </SelectItem>
            ))}
            {games.length === 0 && (
              <SelectItem value="none" disabled>No games found</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

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
