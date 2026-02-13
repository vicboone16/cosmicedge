import { useState } from "react";
import { Plus } from "lucide-react";
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

interface CreateBetFormProps {
  userId: string;
}

export default function CreateBetForm({ userId }: CreateBetFormProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [gameId, setGameId] = useState("");
  const [marketType, setMarketType] = useState("moneyline");
  const [selection, setSelection] = useState("");
  const [side, setSide] = useState("");
  const [line, setLine] = useState("");
  const [odds, setOdds] = useState("");
  const [book, setBook] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [stakeUnit, setStakeUnit] = useState("units");
  const [confidence, setConfidence] = useState([50]);
  const [edgeScore, setEdgeScore] = useState([50]);
  const [whySummary, setWhySummary] = useState("");
  const [notes, setNotes] = useState("");

  const { data: games } = useQuery({
    queryKey: ["games-for-bet-form"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .gte("start_time", today)
        .order("start_time", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as GameRow[];
    },
  });

  const selectedGame = games?.find((g) => g.id === gameId);

  const resetForm = () => {
    setGameId("");
    setMarketType("moneyline");
    setSelection("");
    setSide("");
    setLine("");
    setOdds("");
    setBook("");
    setStakeAmount("");
    setStakeUnit("units");
    setConfidence([50]);
    setEdgeScore([50]);
    setWhySummary("");
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!gameId || !selection || !odds) {
      toast.error("Game, selection, and odds are required.");
      return;
    }
    const oddsNum = parseInt(odds, 10);
    if (isNaN(oddsNum)) {
      toast.error("Odds must be a valid integer (e.g. -110, +120).");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("bets").insert({
      user_id: userId,
      game_id: gameId,
      home_team: selectedGame?.home_team ?? null,
      away_team: selectedGame?.away_team ?? null,
      start_time: selectedGame?.start_time ?? null,
      market_type: marketType,
      selection,
      side: side || null,
      line: line ? parseFloat(line) : null,
      odds: oddsNum,
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
          <DialogTitle className="font-display">Create Bet</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Game Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs">Game *</Label>
            <Select value={gameId} onValueChange={setGameId}>
              <SelectTrigger><SelectValue placeholder="Select a game" /></SelectTrigger>
              <SelectContent>
                {games?.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.away_abbr} @ {g.home_abbr}
                  </SelectItem>
                ))}
                {(!games || games.length === 0) && (
                  <SelectItem value="none" disabled>No upcoming games</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Market Type */}
          <div className="space-y-1.5">
            <Label className="text-xs">Market Type</Label>
            <Select value={marketType} onValueChange={setMarketType}>
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
            <Input placeholder='e.g. "Lakers -3.5"' value={selection} onChange={(e) => setSelection(e.target.value)} />
          </div>

          {/* Side */}
          <div className="space-y-1.5">
            <Label className="text-xs">Side</Label>
            <Select value={side} onValueChange={setSide}>
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
              <Input type="number" step="0.5" placeholder="-3.5" value={line} onChange={(e) => setLine(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Odds (American) *</Label>
              <Input type="number" placeholder="-110" value={odds} onChange={(e) => setOdds(e.target.value)} />
            </div>
          </div>

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
            {submitting ? "Creating..." : "Create Bet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
