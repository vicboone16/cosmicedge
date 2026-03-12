import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveOverlayPlayerNames } from "@/lib/resolve-player-names";
import { cn } from "@/lib/utils";
import { Zap, TrendingUp, TrendingDown, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPropLabel, getEdgeTier, type TopProp } from "@/hooks/use-top-props";
import { usePropDrawer } from "@/hooks/use-prop-drawer";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { PlayerPropCarousel, type CarouselProp } from "@/components/props/PlayerPropCarousel";

interface Props {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  isLive?: boolean;
}

interface RawLiveProp {
  id: string;
  player_name: string;
  player_id: string;
  prop_type: string;
  line_value: number;
  over_odds: number | null;
  under_odds: number | null;
  vendor: string;
}

/** A group: best line + alt lines for a player+stat combo */
interface PropGroup {
  playerName: string;
  playerId: string;
  propType: string;
  best: RawLiveProp;
  alts: RawLiveProp[];
}

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/** Pick the "best" prop from a set of lines: best = highest absolute over_odds (most plus-money) */
function pickBest(props: RawLiveProp[]): { best: RawLiveProp; alts: RawLiveProp[] } {
  // Sort by over_odds descending (best value first), fallback to lowest line
  const sorted = [...props].sort((a, b) => {
    const oa = a.over_odds ?? -999;
    const ob = b.over_odds ?? -999;
    if (ob !== oa) return ob - oa;
    return a.line_value - b.line_value;
  });
  return { best: sorted[0], alts: sorted.slice(1) };
}

// ─── Add-to-SkySpread Sheet ───
interface AddToSkySpreadSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prop: RawLiveProp | null;
  gameId: string;
}

function AddToSkySpreadSheet({ open, onOpenChange, prop, gameId }: AddToSkySpreadSheetProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [side, setSide] = useState<"over" | "under">("over");
  const [stakeAmount, setStakeAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const odds = side === "over" ? prop?.over_odds : prop?.under_odds;

  const handleSubmit = async () => {
    if (!user || !prop) return;
    setSubmitting(true);
    const { error } = await supabase.from("bets").insert({
      user_id: user.id,
      game_id: gameId,
      market_type: "player_prop",
      selection: `${prop.player_name} ${side.toUpperCase()} ${prop.line_value} ${getPropLabel(prop.prop_type)}`,
      side,
      line: prop.line_value,
      odds: odds ?? -110,
      book: prop.vendor || null,
      stake_amount: stakeAmount ? parseFloat(stakeAmount) : null,
      stake_unit: "$",
    });
    setSubmitting(false);
    if (error) {
      toast.error("Failed to add bet");
    } else {
      toast.success("Added to SkySpread!");
      onOpenChange(false);
    }
  };

  const handleGoToSkySpread = () => {
    if (!prop) return;
    navigate(
      `/skyspread?prefill=true&player=${encodeURIComponent(prop.player_name)}&market=${encodeURIComponent(prop.prop_type)}&line=${prop.line_value}&odds=${odds ?? ""}&game_id=${gameId}`
    );
    onOpenChange(false);
  };

  if (!prop) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh]">
        <SheetHeader>
          <SheetTitle className="text-sm font-display">Add to SkySpread</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 pt-4">
          {/* Prop summary */}
          <div className="cosmic-card rounded-xl p-3 space-y-1">
            <p className="text-xs font-semibold text-foreground">{prop.player_name}</p>
            <p className="text-[10px] text-muted-foreground uppercase">
              {getPropLabel(prop.prop_type)} · Line {prop.line_value} · {prop.vendor}
            </p>
            <div className="flex gap-2 text-xs tabular-nums mt-2">
              <span className="text-cosmic-green font-semibold">O {formatOdds(prop.over_odds)}</span>
              <span className="text-cosmic-red font-semibold">U {formatOdds(prop.under_odds)}</span>
            </div>
          </div>

          {/* Side picker */}
          <div className="flex gap-2">
            <button
              onClick={() => setSide("over")}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-semibold transition-colors",
                side === "over"
                  ? "bg-cosmic-green/15 text-cosmic-green border border-cosmic-green/30"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              Over {formatOdds(prop.over_odds)}
            </button>
            <button
              onClick={() => setSide("under")}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-semibold transition-colors",
                side === "under"
                  ? "bg-cosmic-red/15 text-cosmic-red border border-cosmic-red/30"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              Under {formatOdds(prop.under_odds)}
            </button>
          </div>

          {/* Stake */}
          <div className="space-y-1">
            <Label className="text-xs">Stake ($)</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={handleSubmit}
              disabled={submitting || !user}
              className="flex-1"
              size="sm"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {submitting ? "Adding…" : "Quick Add"}
            </Button>
            <Button
              variant="outline"
              onClick={handleGoToSkySpread}
              size="sm"
              className="flex-1"
            >
              Open in SkySpread
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// PropGroupRow kept for overlay model view alt-lines (not used in carousel fallback)


// ─── Main Component ───
export function LivePropsTab({ gameId, homeAbbr, awayAbbr, isLive }: Props) {
  const navigate = useNavigate();
  const { openProp } = usePropDrawer();
  const [skySpreadOpen, setSkySpreadOpen] = useState(false);
  const [selectedProp, setSelectedProp] = useState<RawLiveProp | null>(null);

  // Primary: overlay with model predictions
  const { data: overlays, isLoading: overlayLoading } = useQuery({
    queryKey: ["live-props-tab", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("np_v_prop_overlay" as any)
        .select("*")
        .eq("game_id", gameId)
        .order("edge_score_v11", { ascending: false, nullsFirst: false } as any)
        .order("edge_score", { ascending: false })
        .limit(50);
      return (data || []) as unknown as TopProp[];
    },
    staleTime: 30_000,
    refetchInterval: isLive ? 30_000 : false,
  });

  // Fallback: raw live props when no model predictions exist
  const needsFallback = !overlayLoading && (!overlays || overlays.length === 0);
  const { data: rawProps, isLoading: rawLoading } = useQuery({
    queryKey: ["live-props-raw", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nba_player_props_live" as any)
        .select("id,player_name,player_id,prop_type,line_value,over_odds,under_odds,vendor")
        .eq("game_key", gameId)
        .eq("market_type", "over_under")
        .order("prop_type", { ascending: true });

      const rows = (data || []) as unknown as RawLiveProp[];

      // Resolve "Player XXXX" names from bdl_player_cache
      const needsResolve = rows.filter(r => r.player_name?.startsWith("Player "));
      if (needsResolve.length > 0) {
        const bdlIds = [...new Set(needsResolve.map(r => r.player_id))];
        const { data: cached } = await supabase
          .from("bdl_player_cache" as any)
          .select("bdl_id,first_name,last_name")
          .in("bdl_id", bdlIds);
        const nameMap = new Map(
          (cached || []).map((c: any) => [
            c.bdl_id,
            [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null,
          ])
        );
        for (const r of rows) {
          if (r.player_name?.startsWith("Player ") && nameMap.has(r.player_id)) {
            const resolved = nameMap.get(r.player_id);
            if (resolved) r.player_name = resolved;
          }
        }
      }

      return rows;
    },
    enabled: needsFallback,
    staleTime: 30_000,
    refetchInterval: isLive ? 30_000 : false,
  });

  const isLoading = overlayLoading || (needsFallback && rawLoading);

  // Group raw props: player -> propType -> best + alts
  const playerGroups = useMemo(() => {
    if (!rawProps) return new Map<string, PropGroup[]>();
    // Group by player_id + prop_type
    const byPlayerStat = new Map<string, RawLiveProp[]>();
    for (const p of rawProps) {
      const key = `${p.player_id}|${p.prop_type}`;
      if (!byPlayerStat.has(key)) byPlayerStat.set(key, []);
      byPlayerStat.get(key)!.push(p);
    }
    // Build groups per player
    const perPlayer = new Map<string, PropGroup[]>();
    for (const [, props] of byPlayerStat) {
      const first = props[0];
      const rawName = first.player_name;
      const name = (!rawName || /^Player \d+$/.test(rawName) || /^\d+$/.test(rawName))
        ? "Unknown Player"
        : rawName;
      const { best, alts } = pickBest(props);
      const group: PropGroup = { playerName: name, playerId: first.player_id, propType: first.prop_type, best, alts };
      if (!perPlayer.has(name)) perPlayer.set(name, []);
      perPlayer.get(name)!.push(group);
    }
    return perPlayer;
  }, [rawProps]);

  const handleAddToSkySpread = useCallback((prop: RawLiveProp | CarouselProp) => {
    // Normalize to RawLiveProp for the sheet
    const raw: RawLiveProp = 'line_value' in prop ? prop as RawLiveProp : {
      id: prop.id,
      player_name: prop.player_name,
      player_id: prop.player_id,
      prop_type: prop.prop_type,
      line_value: prop.line ?? 0,
      over_odds: prop.over_odds,
      under_odds: prop.under_odds,
      vendor: prop.vendor || "",
    };
    setSelectedProp(raw);
    setSkySpreadOpen(true);
  }, []);

  const handlePlayerClick = useCallback(async (playerId: string, playerName: string) => {
    // Try to find player in our players table
    const { data } = await supabase.rpc("search_players_unaccent", {
      search_query: playerName,
      max_results: 1,
    });
    if (data && data.length > 0) {
      navigate(`/player/${(data[0] as any).player_id}`);
    }
  }, [navigate]);

  const { hotEdges, trendAlerts, newEdges } = useMemo(() => {
    if (!overlays) return { hotEdges: [], trendAlerts: [], newEdges: [] };
    const sorted = [...overlays];
    return {
      hotEdges: sorted.slice(0, 6),
      trendAlerts: sorted.filter(o => o.streak != null && (o.streak ?? 0) >= 3).slice(0, 5),
      newEdges: sorted.filter(o => (o.edge_score_v11 ?? o.edge_score) >= 60).slice(0, 5),
    };
  }, [overlays]);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <Zap className="h-6 w-6 text-primary mx-auto mb-2 animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading live prop intelligence...</p>
      </div>
    );
  }

  // If we have overlay data, show the model-based view
  if (overlays && overlays.length > 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {isLive && (
            <span className="flex items-center gap-1 text-cosmic-green font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse-glow" />
              Live
            </span>
          )}
          <span>Real-time projections and live prop edges</span>
          <span className="ml-auto tabular-nums">{overlays.length} props tracked</span>
        </div>

        {hotEdges.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-cosmic-gold" />
              Hot Live Edges
            </h3>
            <div className="space-y-2">
              {hotEdges.map(prop => (
                <LivePropCard key={prop.id} prop={prop} />
              ))}
            </div>
          </section>
        )}

        {trendAlerts.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              Live Trend Alerts
            </h3>
            <div className="space-y-1.5">
              {trendAlerts.map(prop => {
                const propLabel = getPropLabel(prop.prop_type);
                return (
                  <button key={prop.id} onClick={() => openProp(prop)} className="w-full cosmic-card rounded-lg px-3 py-2 flex items-center justify-between hover:border-primary/30 transition-colors text-left">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-semibold text-foreground truncate">{prop.player_name}</span>
                      <span className="text-[9px] text-muted-foreground uppercase">{propLabel}</span>
                    </div>
                    <span className="text-[10px] text-cosmic-green font-semibold shrink-0">
                      {prop.streak}× streak
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {newEdges.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              Edge Detected
            </h3>
            <div className="space-y-1.5">
              {newEdges.map(prop => {
                const propLabel = getPropLabel(prop.prop_type);
                const diff = prop.mu - (prop.line ?? 0);
                const sign = diff >= 0 ? "+" : "";
                return (
                  <button key={prop.id} onClick={() => openProp(prop)} className="w-full cosmic-card rounded-lg px-3 py-2 flex items-center justify-between hover:border-primary/30 transition-colors text-left">
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold text-foreground">
                        {prop.player_name?.split(" ").pop()} {propLabel} line {prop.line}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        model {prop.mu?.toFixed(1)} ({sign}{diff.toFixed(1)})
                      </span>
                    </div>
                    <Badge variant="outline" className={cn("text-[8px] px-1.5 py-0 h-3.5 font-bold", getEdgeTier(prop.edge_score_v11 ?? prop.edge_score).className)}>
                      {(prop.edge_score_v11 ?? prop.edge_score).toFixed(0)}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  // Fallback: show raw live props grouped by player as horizontal carousels
  if (playerGroups.size > 0) {
    const totalProps = rawProps?.length ?? 0;

    // Convert grouped props to CarouselProp format per player
    const playerCarousels = [...playerGroups.entries()].map(([playerName, groups]) => {
      const playerId = groups[0]?.playerId;
      const carouselProps: CarouselProp[] = groups.map(g => ({
        id: g.best.id,
        player_name: playerName,
        player_id: g.playerId,
        prop_type: g.propType,
        line: g.best.line_value,
        over_odds: g.best.over_odds,
        under_odds: g.best.under_odds,
        vendor: g.best.vendor,
        game_id: gameId,
      }));
      return { playerName, playerId, carouselProps };
    });

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {isLive && (
            <span className="flex items-center gap-1 text-cosmic-green font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse-glow" />
              Live
            </span>
          )}
          <span>Live market lines from sportsbooks</span>
          <span className="ml-auto tabular-nums">{totalProps} props</span>
        </div>

        {playerCarousels.map(({ playerName, playerId, carouselProps }) => (
          <PlayerPropCarousel
            key={playerName}
            playerName={playerName}
            playerId={playerId}
            props={carouselProps}
            gameId={gameId}
            onPlayerClick={handlePlayerClick}
            onAddToSkySpread={handleAddToSkySpread}
          />
        ))}

        <AddToSkySpreadSheet
          open={skySpreadOpen}
          onOpenChange={setSkySpreadOpen}
          prop={selectedProp}
          gameId={gameId}
        />
      </div>
    );
  }

  // No data at all
  return (
    <div className="text-center py-12 space-y-2">
      <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto" />
      <p className="text-sm font-semibold text-foreground">No strong live edges yet</p>
      <p className="text-xs text-muted-foreground">Check back when the game is active for real-time prop intelligence</p>
    </div>
  );
}

function LivePropCard({ prop }: { prop: TopProp }) {
  const { openProp } = usePropDrawer();
  const edgeScore = prop.edge_score_v11 ?? prop.edge_score;
  const tier = getEdgeTier(edgeScore);
  const isOver = prop.side === "over" || prop.side == null;
  const propLabel = getPropLabel(prop.prop_type);

  return (
    <button
      onClick={() => openProp(prop)}
      className={cn(
        "w-full cosmic-card rounded-xl p-3 space-y-2 text-left hover:border-primary/30 transition-colors",
        edgeScore >= 70 && "border-cosmic-green/30 shadow-[0_0_12px_-4px] shadow-cosmic-green/20"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-foreground truncate block">{prop.player_name}</span>
          <span className="text-[10px] text-muted-foreground">{prop.player_team}</span>
        </div>
        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 font-bold", tier.className)}>
          {edgeScore.toFixed(0)} {tier.label}
        </Badge>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">{propLabel}</span>
          <span className="text-sm font-bold tabular-nums">{prop.line != null ? Number(prop.line) : "—"}</span>
          <span className="text-[10px] text-muted-foreground">→</span>
          <span className="text-sm font-bold tabular-nums text-foreground">{prop.mu?.toFixed(1)}</span>
        </div>
        <span className={cn(
          "text-xs font-semibold flex items-center gap-0.5",
          isOver ? "text-cosmic-green" : "text-cosmic-red"
        )}>
          {isOver ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {isOver ? "Over" : "Under"}
          <span className="text-muted-foreground ml-1 tabular-nums">{formatOdds(prop.odds)}</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", tier.className.includes("green") ? "bg-cosmic-green" : tier.className.includes("primary") ? "bg-primary" : "bg-muted-foreground")}
            style={{ width: `${Math.min(100, edgeScore)}%` }}
          />
        </div>
        <span className="text-[9px] text-muted-foreground tabular-nums">{edgeScore.toFixed(0)}/100</span>
      </div>

      {prop.one_liner && (
        <p className="text-[10px] text-muted-foreground italic">{prop.one_liner}</p>
      )}

      <div className="flex gap-1 flex-wrap">
        {prop.streak != null && prop.streak >= 3 && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold bg-cosmic-green/10 text-cosmic-green">Over Heater</span>
        )}
        {prop.hit_l10 != null && prop.hit_l10 >= 0.7 && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold bg-primary/10 text-primary">Momentum</span>
        )}
        {edgeScore >= 65 && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold bg-blue-400/10 text-blue-400">Strong Signal</span>
        )}
      </div>
    </button>
  );
}
