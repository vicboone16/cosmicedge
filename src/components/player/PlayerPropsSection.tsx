import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign } from "lucide-react";
import { PlayerPropCarousel, type CarouselProp } from "@/components/props/PlayerPropCarousel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getPropLabel } from "@/hooks/use-top-props";
import { cn } from "@/lib/utils";

interface PlayerPropsSectionProps {
  playerId: string;
  playerName: string;
  teamAbbr: string;
}

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return price > 0 ? `+${price}` : `${price}`;
}

export function PlayerPropsSection({ playerId, playerName, teamAbbr }: PlayerPropsSectionProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [skySpreadOpen, setSkySpreadOpen] = useState(false);
  const [selectedProp, setSelectedProp] = useState<CarouselProp | null>(null);
  const [side, setSide] = useState<"over" | "under">("over");
  const [stakeAmount, setStakeAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: nextGame } = useQuery({
    queryKey: ["player-props-next-game", teamAbbr],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 4 * 3600000).toISOString();
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time")
        .or(`home_abbr.eq.${teamAbbr},away_abbr.eq.${teamAbbr}`)
        .in("status", ["scheduled", "live", "in_progress"])
        .gte("start_time", cutoff)
        .order("start_time", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!teamAbbr,
  });

  const { data: props } = useQuery({
    queryKey: ["player-props-data", nextGame?.id, playerName],
    queryFn: async () => {
      if (!nextGame?.id) return [];
      const { data } = await supabase
        .from("player_props")
        .select("*")
        .eq("game_id", nextGame.id)
        .ilike("player_name", `%${playerName.split(" ").pop()}%`);

      const filtered = (data || []).filter((p: any) => {
        const pName = p.player_name?.toLowerCase() || "";
        const searchName = playerName.toLowerCase();
        return pName.includes(searchName) || searchName.includes(pName);
      });

      // Deduplicate by market_key, keep first
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const p of filtered) {
        if (!seen.has(p.market_key)) {
          seen.add(p.market_key);
          deduped.push(p);
        }
      }
      return deduped;
    },
    enabled: !!nextGame?.id && !!playerName,
  });

  const { data: gameOdds } = useQuery({
    queryKey: ["player-game-odds", nextGame?.id],
    queryFn: async () => {
      if (!nextGame?.id) return null;
      const { data } = await supabase
        .from("odds_snapshots")
        .select("market_type, line, home_price, away_price, bookmaker")
        .eq("game_id", nextGame.id)
        .order("captured_at", { ascending: false });
      return data || [];
    },
    enabled: !!nextGame?.id,
  });

  // Convert to CarouselProp format
  const carouselProps: CarouselProp[] = (props || [])
    .filter((p: any) => p.over_price != null && p.under_price != null)
    .map((p: any) => ({
      id: p.id,
      player_name: playerName,
      player_id: playerId,
      player_team: teamAbbr,
      prop_type: p.market_key,
      line: p.line,
      over_odds: p.over_price,
      under_odds: p.under_price,
      vendor: p.bookmaker,
      game_id: nextGame?.id,
    }));

  const handleAddToSkySpread = useCallback((prop: CarouselProp) => {
    setSelectedProp(prop);
    setSkySpreadOpen(true);
  }, []);

  const handleSubmit = async () => {
    if (!user || !selectedProp) return;
    setSubmitting(true);
    const odds = side === "over" ? selectedProp.over_odds : selectedProp.under_odds;
    const { error } = await supabase.from("bets").insert({
      user_id: user.id,
      game_id: selectedProp.game_id || nextGame?.id || "",
      market_type: "player_prop",
      selection: `${selectedProp.player_name} ${side.toUpperCase()} ${selectedProp.line} ${getPropLabel(selectedProp.prop_type)}`,
      side,
      line: selectedProp.line,
      odds: odds ?? -110,
      book: selectedProp.vendor || null,
      stake_amount: stakeAmount ? parseFloat(stakeAmount) : null,
      stake_unit: "$",
    });
    setSubmitting(false);
    if (error) toast.error("Failed to add"); else { toast.success("Added to SkySpread!"); setSkySpreadOpen(false); }
  };

  if (!nextGame) return null;
  if (carouselProps.length === 0 && (!gameOdds || gameOdds.length === 0)) return null;

  const isHome = nextGame.home_abbr === teamAbbr;
  const opponent = isHome ? nextGame.away_abbr : nextGame.home_abbr;
  const dateStr = new Date(nextGame.start_time).toLocaleDateString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  const latestSpread = gameOdds?.find((o) => o.market_type === "spread");
  const latestTotal = gameOdds?.find((o) => o.market_type === "total");
  const latestML = gameOdds?.find((o) => o.market_type === "moneyline");

  return (
    <section>
      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <DollarSign className="h-3.5 w-3.5" />
        Props & Odds
      </h3>

      {/* Game context */}
      <div className="cosmic-card rounded-xl p-3 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold">{isHome ? "vs" : "@"} {opponent}</span>
            <span className="text-[10px] text-muted-foreground ml-2">{dateStr}</span>
          </div>
          <div className="flex items-center gap-3">
            {latestSpread && (
              <div className="text-right">
                <p className="text-[8px] text-muted-foreground uppercase">Spread</p>
                <p className="text-[11px] font-semibold tabular-nums">
                  {isHome
                    ? (latestSpread.line != null ? (latestSpread.line > 0 ? "+" : "") + latestSpread.line : "—")
                    : (latestSpread.line != null ? ((-latestSpread.line) > 0 ? "+" : "") + (-latestSpread.line) : "—")}
                </p>
              </div>
            )}
            {latestTotal && (
              <div className="text-right">
                <p className="text-[8px] text-muted-foreground uppercase">Total</p>
                <p className="text-[11px] font-semibold tabular-nums">{latestTotal.line ?? "—"}</p>
              </div>
            )}
            {latestML && (
              <div className="text-right">
                <p className="text-[8px] text-muted-foreground uppercase">ML</p>
                <p className="text-[11px] font-semibold tabular-nums">
                  {formatPrice(isHome ? latestML.home_price : latestML.away_price)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Player Props Carousel */}
      {carouselProps.length > 0 ? (
        <PlayerPropCarousel
          playerName={playerName}
          playerId={playerId}
          team={teamAbbr}
          props={carouselProps}
          gameId={nextGame.id}
          onPlayerClick={(id, name) => navigate(`/player/${id}`)}
          onAddToSkySpread={handleAddToSkySpread}
        />
      ) : (
        <p className="text-[10px] text-muted-foreground text-center py-3">
          No player props available yet — lines will appear closer to game time.
        </p>
      )}

      {/* SkySpread Sheet */}
      <Sheet open={skySpreadOpen} onOpenChange={setSkySpreadOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[60vh]">
          <SheetHeader>
            <SheetTitle className="text-sm font-display">Add to SkySpread</SheetTitle>
          </SheetHeader>
          {selectedProp && (
            <div className="space-y-4 pt-4">
              <div className="cosmic-card rounded-xl p-3 space-y-1">
                <p className="text-xs font-semibold">{selectedProp.player_name}</p>
                <p className="text-[10px] text-muted-foreground uppercase">
                  {getPropLabel(selectedProp.prop_type)} · Line {selectedProp.line} · {selectedProp.vendor}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSide("over")}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-semibold transition-colors",
                    side === "over" ? "bg-cosmic-green/15 text-cosmic-green border border-cosmic-green/30" : "bg-secondary text-muted-foreground"
                  )}
                >
                  Over {formatPrice(selectedProp.over_odds)}
                </button>
                <button
                  onClick={() => setSide("under")}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-semibold transition-colors",
                    side === "under" ? "bg-cosmic-red/15 text-cosmic-red border border-cosmic-red/30" : "bg-secondary text-muted-foreground"
                  )}
                >
                  Under {formatPrice(selectedProp.under_odds)}
                </button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stake ($)</Label>
                <Input type="number" placeholder="0.00" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} className="h-9" />
              </div>
              <Button onClick={handleSubmit} disabled={submitting || !user} className="w-full" size="sm">
                <Plus className="h-3.5 w-3.5 mr-1" />
                {submitting ? "Adding…" : "Add to SkySpread"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
