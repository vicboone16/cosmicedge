import { useState, useMemo } from "react";
import { Sparkles, Plus, X, Search, Star, Zap, TrendingUp } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface PropLeg {
  id: string;
  playerName: string;
  market: string;
  marketLabel: string;
  line: number;
  side: "over" | "under";
  odds: number;
  astroScore: number | null;
  gameId: string | null;
  bookmaker: string;
}

interface PropBuilderDialogProps {
  userId: string;
}

function americanToDecimal(odds: number): number {
  if (odds > 0) return odds / 100 + 1;
  return 100 / Math.abs(odds) + 1;
}

// Simulated astro score based on player name hash + market (deterministic placeholder)
function computeAstroScore(playerName: string, market: string): number {
  let hash = 0;
  const str = playerName + market;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 10) + 1; // 1-10
}

function AstroScoreBadge({ score }: { score: number }) {
  const color = score >= 8
    ? "text-cosmic-gold bg-cosmic-gold/10 border-cosmic-gold/30"
    : score >= 5
      ? "text-cosmic-cyan bg-cosmic-cyan/10 border-cosmic-cyan/30"
      : "text-muted-foreground bg-secondary border-border";

  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
      color
    )}>
      <Sparkles className="h-2.5 w-2.5" />
      {score}
    </span>
  );
}

export default function PropBuilderDialog({ userId }: PropBuilderDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [legs, setLegs] = useState<PropLeg[]>([]);
  const [stakeAmount, setStakeAmount] = useState("");
  const [book, setBook] = useState("");
  const [confidence, setConfidence] = useState([50]);
  const [submitting, setSubmitting] = useState(false);

  // Fetch available props
  const { data: availableProps } = useQuery({
    queryKey: ["prop-builder-props", search],
    queryFn: async () => {
      let query = supabase
        .from("player_props")
        .select("*")
        .not("over_price", "is", null)
        .not("under_price", "is", null)
        .order("captured_at", { ascending: false })
        .limit(100);

      if (search.trim()) {
        query = query.ilike("player_name", `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const addProp = (prop: any, side: "over" | "under") => {
    const odds = side === "over" ? (prop.over_price || -110) : (prop.under_price || -110);
    const astroScore = computeAstroScore(prop.player_name, prop.market_key);

    const newLeg: PropLeg = {
      id: `${prop.id}-${side}`,
      playerName: prop.player_name,
      market: prop.market_key,
      marketLabel: prop.market_label || prop.market_key,
      line: prop.line || 0,
      side,
      odds,
      astroScore,
      gameId: prop.game_id,
      bookmaker: prop.bookmaker,
    };

    // Prevent duplicates
    if (legs.some(l => l.id === newLeg.id)) {
      toast.error("Already added");
      return;
    }

    setLegs(prev => [...prev, newLeg]);
  };

  const removeLeg = (id: string) => {
    setLegs(prev => prev.filter(l => l.id !== id));
  };

  const addManualLeg = () => {
    setLegs(prev => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        playerName: "",
        market: "player_points",
        marketLabel: "Points",
        line: 0,
        side: "over",
        odds: -110,
        astroScore: null,
        gameId: null,
        bookmaker: "",
      },
    ]);
  };

  const updateManualLeg = (id: string, patch: Partial<PropLeg>) => {
    setLegs(prev =>
      prev.map(l => {
        if (l.id !== id) return l;
        const updated = { ...l, ...patch };
        // Recompute astro score if player/market changed
        if (patch.playerName || patch.market) {
          updated.astroScore = computeAstroScore(
            updated.playerName || l.playerName,
            updated.market || l.market
          );
        }
        return updated;
      })
    );
  };

  const combinedOdds = useMemo(() => {
    if (legs.length < 2) return null;
    const decimals = legs.map(l => americanToDecimal(l.odds));
    const combined = decimals.reduce((acc, d) => acc * d, 1);
    if (combined >= 2) return Math.round((combined - 1) * 100);
    return Math.round(-100 / (combined - 1));
  }, [legs]);

  const compositeAstroScore = useMemo(() => {
    const scores = legs.map(l => l.astroScore).filter((s): s is number => s !== null);
    if (scores.length === 0) return null;
    return +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  }, [legs]);

  const projectedWin = useMemo(() => {
    const stake = parseFloat(stakeAmount);
    if (!stake || isNaN(stake) || !combinedOdds) return null;
    const dec = americanToDecimal(combinedOdds);
    return (stake * dec).toFixed(2);
  }, [stakeAmount, combinedOdds]);

  const handleSubmit = async () => {
    if (legs.length < 2) {
      toast.error("Add at least 2 legs to build a parlay");
      return;
    }
    for (const leg of legs) {
      if (!leg.playerName) {
        toast.error("All legs need a player name");
        return;
      }
    }

    setSubmitting(true);

    // Find a game_id for each leg, or use the first available
    const parlayId = `sgp_${Date.now()}`;

    const inserts = legs.map((leg, i) => ({
      user_id: userId,
      game_id: leg.gameId || legs.find(l => l.gameId)?.gameId || "",
      market_type: "player_prop",
      selection: `${leg.playerName} ${leg.side.toUpperCase()} ${leg.line} ${leg.marketLabel}`,
      side: leg.side,
      line: leg.line,
      odds: leg.odds,
      book: book || leg.bookmaker || null,
      stake_amount: stakeAmount ? parseFloat(stakeAmount) : null,
      stake_unit: "$",
      confidence: confidence[0],
      edge_score: leg.astroScore ? leg.astroScore * 10 : null,
      notes: `${parlayId} | Prop Parlay Leg ${i + 1}/${legs.length}${combinedOdds ? ` | Combined: ${combinedOdds > 0 ? "+" : ""}${combinedOdds}` : ""}${compositeAstroScore ? ` | Astro: ${compositeAstroScore}/10` : ""}`,
    }));

    const { error } = await supabase.from("bets").insert(inserts);
    setSubmitting(false);

    if (error) {
      toast.error("Failed: " + error.message);
    } else {
      toast.success(`Prop parlay (${legs.length} legs) created!`);
      setLegs([]);
      setStakeAmount("");
      setBook("");
      setConfidence([50]);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["skyspread-bets"] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="h-8 px-3 rounded-full bg-cosmic-indigo/15 text-cosmic-indigo text-xs font-semibold flex items-center gap-1.5 hover:bg-cosmic-indigo/25 transition-colors">
          <Sparkles className="h-3.5 w-3.5" />
          Prop Builder
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cosmic-indigo" />
            Prop Builder
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Search to add from existing props */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <Search className="h-3 w-3" /> Find Props
            </Label>
            <Input
              placeholder="Search player name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Available Props List */}
          {search.trim() && availableProps && availableProps.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
              {availableProps.slice(0, 20).map((prop) => {
                const astro = computeAstroScore(prop.player_name, prop.market_key);
                return (
                  <div key={prop.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{prop.player_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {prop.market_label || prop.market_key} · {prop.line}
                      </p>
                    </div>
                    <AstroScoreBadge score={astro} />
                    <div className="flex gap-1">
                      <button
                        onClick={() => addProp(prop, "over")}
                        className="text-[10px] px-2 py-1 rounded bg-cosmic-green/10 text-cosmic-green font-semibold hover:bg-cosmic-green/20 transition-colors"
                      >
                        O {prop.over_price && (prop.over_price > 0 ? `+${prop.over_price}` : prop.over_price)}
                      </button>
                      <button
                        onClick={() => addProp(prop, "under")}
                        className="text-[10px] px-2 py-1 rounded bg-cosmic-red/10 text-cosmic-red font-semibold hover:bg-cosmic-red/20 transition-colors"
                      >
                        U {prop.under_price && (prop.under_price > 0 ? `+${prop.under_price}` : prop.under_price)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected Legs */}
          {legs.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Parlay Legs ({legs.length})
              </h3>
              {legs.map((leg) => (
                <div key={leg.id} className="cosmic-card rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {leg.astroScore && <AstroScoreBadge score={leg.astroScore} />}
                      {leg.playerName ? (
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{leg.playerName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {leg.side.toUpperCase()} {leg.line} {leg.marketLabel} · {leg.odds > 0 ? "+" : ""}{leg.odds}
                          </p>
                        </div>
                      ) : (
                        /* Manual entry fields */
                        <div className="flex-1 space-y-2">
                          <Input
                            placeholder="Player name"
                            value={leg.playerName}
                            onChange={(e) => updateManualLeg(leg.id, { playerName: e.target.value })}
                            className="h-7 text-xs"
                          />
                          <div className="grid grid-cols-3 gap-1">
                            <Select value={leg.market} onValueChange={(v) => updateManualLeg(leg.id, { market: v, marketLabel: v })}>
                              <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["Points", "Rebounds", "Assists", "Threes", "PRA", "Steals", "Blocks"].map(m => (
                                  <SelectItem key={m} value={m.toLowerCase()}>{m}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              placeholder="Line"
                              value={leg.line || ""}
                              onChange={(e) => updateManualLeg(leg.id, { line: parseFloat(e.target.value) || 0 })}
                              className="h-7 text-[10px]"
                            />
                            <Input
                              type="number"
                              placeholder="Odds"
                              value={leg.odds || ""}
                              onChange={(e) => updateManualLeg(leg.id, { odds: parseInt(e.target.value) || -110 })}
                              className="h-7 text-[10px]"
                            />
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => updateManualLeg(leg.id, { side: "over" })}
                              className={cn("text-[10px] px-2 py-0.5 rounded font-semibold transition-colors",
                                leg.side === "over" ? "bg-cosmic-green/15 text-cosmic-green" : "bg-secondary text-muted-foreground"
                              )}
                            >Over</button>
                            <button
                              onClick={() => updateManualLeg(leg.id, { side: "under" })}
                              className={cn("text-[10px] px-2 py-0.5 rounded font-semibold transition-colors",
                                leg.side === "under" ? "bg-cosmic-red/15 text-cosmic-red" : "bg-secondary text-muted-foreground"
                              )}
                            >Under</button>
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeLeg(leg.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-2"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Manual Leg */}
          <Button variant="outline" size="sm" onClick={addManualLeg} className="w-full text-xs">
            <Plus className="h-3 w-3 mr-1" /> Add Manual Leg
          </Button>

          {/* Composite Summary */}
          {legs.length >= 2 && (
            <div className="cosmic-card rounded-xl p-3 space-y-2 border-primary/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground">Combined Odds</p>
                  <p className="text-sm font-bold font-display text-primary tabular-nums">
                    {combinedOdds && (combinedOdds > 0 ? "+" : "")}{combinedOdds}
                  </p>
                </div>
                {compositeAstroScore !== null && (
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Astro Score</p>
                    <div className="flex items-center gap-1 justify-end">
                      <Sparkles className={cn(
                        "h-3.5 w-3.5",
                        compositeAstroScore >= 7 ? "text-cosmic-gold" : compositeAstroScore >= 4 ? "text-cosmic-cyan" : "text-muted-foreground"
                      )} />
                      <span className={cn(
                        "text-sm font-bold tabular-nums",
                        compositeAstroScore >= 7 ? "text-cosmic-gold" : compositeAstroScore >= 4 ? "text-cosmic-cyan" : "text-muted-foreground"
                      )}>
                        {compositeAstroScore}/10
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Astro Confidence Bar */}
              {compositeAstroScore !== null && (
                <div className="space-y-1">
                  <div className="h-2 bg-border rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        compositeAstroScore >= 7 ? "bg-cosmic-gold" : compositeAstroScore >= 4 ? "bg-cosmic-cyan" : "bg-muted-foreground"
                      )}
                      style={{ width: `${compositeAstroScore * 10}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {compositeAstroScore >= 8 ? "🔥 Strong cosmic alignment"
                      : compositeAstroScore >= 6 ? "✨ Favorable conditions"
                        : compositeAstroScore >= 4 ? "☁️ Neutral energy"
                          : "⚠️ Challenging transits"}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Stake & Book */}
          {legs.length >= 2 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Stake ($)</Label>
                  <Input type="number" placeholder="25.00" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Book</Label>
                  <Input placeholder="Sportsbook" value={book} onChange={(e) => setBook(e.target.value)} />
                </div>
              </div>

              {stakeAmount && projectedWin && (
                <div className="bg-primary/10 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Stake</p>
                    <p className="text-sm font-bold tabular-nums">${stakeAmount}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Projected Win</p>
                    <p className="text-sm font-bold text-cosmic-green tabular-nums">${projectedWin}</p>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Confidence</Label>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{confidence[0]}</span>
                </div>
                <Slider min={0} max={100} step={1} value={confidence} onValueChange={setConfidence} />
              </div>

              <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                {submitting ? "Creating..." : `Create ${legs.length}-Leg Prop Parlay`}
              </Button>
            </>
          )}

          {legs.length === 0 && !search.trim() && (
            <div className="text-center py-8">
              <Sparkles className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Search for props or add legs manually</p>
              <p className="text-[10px] text-muted-foreground mt-1">Each leg gets an Astro Score based on planetary alignments</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
