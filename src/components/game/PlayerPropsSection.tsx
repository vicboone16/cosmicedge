import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { assertGameKeyUUID } from "@/lib/game-key-guard";
import { PlayerPropCarousel, type CarouselProp } from "@/components/props/PlayerPropCarousel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getPropLabel } from "@/hooks/use-top-props";

interface PlayerPropsProps {
  gameId: string;
}

interface PropRow {
  id: string;
  player_name: string;
  player_id?: string;
  market_key: string;
  market_label: string | null;
  bookmaker: string;
  line: number | null;
  over_price: number | null;
  under_price: number | null;
}

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return price > 0 ? `+${price}` : `${price}`;
}

export function PlayerPropsSection({ gameId }: PlayerPropsProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [skySpreadOpen, setSkySpreadOpen] = useState(false);
  const [selectedProp, setSelectedProp] = useState<CarouselProp | null>(null);
  const [side, setSide] = useState<"over" | "under">("over");
  const [stakeAmount, setStakeAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: props, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["player-props", gameId],
    queryFn: async () => {
      assertGameKeyUUID(gameId, "PlayerPropsSection");
      // Tier 1: BDL nba_player_props_live
      const { data: bdlProps } = await (supabase as any)
        .from("nba_player_props_live")
        .select("*")
        .eq("game_key", gameId)
        .eq("market_type", "over_under")
        .order("updated_at", { ascending: false })
        .order("player_name", { ascending: true });

      if (bdlProps && bdlProps.length > 0) {
        const rows = (bdlProps as any[]).map((p: any) => ({
          id: `bdl-${p.id}`,
          player_name: p.player_name || "Unknown",
          player_id: String(p.player_id || ""),
          market_key: p.prop_type,
          market_label: null,
          bookmaker: p.vendor,
          line: p.line_value,
          over_price: p.over_odds,
          under_price: p.under_odds,
        })) as PropRow[];

        // Resolve "Player XXXX" names
        const needsResolve = rows.filter(r => r.player_name?.startsWith("Player "));
        if (needsResolve.length > 0) {
          const bdlIds = [...new Set(needsResolve.map(r => r.player_id).filter(Boolean))];
          const { data: cached } = await (supabase as any)
            .from("bdl_player_cache")
            .select("bdl_id,first_name,last_name")
            .in("bdl_id", bdlIds);
          const nameMap = new Map<string, string | null>(
            (cached || []).map((c: any) => [
              String(c.bdl_id),
              [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null,
            ] as [string, string | null])
          );
          for (const r of rows) {
            if (r.player_name?.startsWith("Player ") && r.player_id && nameMap.has(r.player_id)) {
              const resolved = nameMap.get(r.player_id);
              if (resolved) r.player_name = resolved;
            }
          }
        }

        return rows;
      }

      // Tier 2: Legacy player_props
      const { data, error } = await supabase
        .from("player_props")
        .select("*")
        .eq("game_id", gameId)
        .not("over_price", "is", null)
        .not("under_price", "is", null)
        .order("player_name", { ascending: true })
        .order("market_key", { ascending: true });
      if (error) throw error;

      if (data && data.length > 0) return data as PropRow[];

      // Tier 3: Auto-trigger fetch if empty
      fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-player-props?game_id=${gameId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      ).catch(() => {});

      return [] as PropRow[];
    },
    refetchInterval: (query) => {
      const rows = (query.state.data as PropRow[] | undefined)?.length ?? 0;
      return rows === 0 ? 30_000 : 15_000;
    },
  });

  const handleRefresh = async () => {
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-player-props?game_id=${gameId}&league=NBA`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
    } catch {}
    refetch();
  };

  // Group by player → deduplicate by market_key → build CarouselProp[]
  const playerCarousels = useMemo(() => {
    if (!props || props.length === 0) return [];
    const byPlayer = new Map<string, Map<string, PropRow>>();
    for (const p of props) {
      const name = (!p.player_name || /^\d+$/.test(p.player_name)) ? "Unknown Player" : p.player_name;
      if (!byPlayer.has(name)) byPlayer.set(name, new Map());
      const markets = byPlayer.get(name)!;
      if (!markets.has(p.market_key)) markets.set(p.market_key, p);
    }

    const result: { playerName: string; playerId: string; props: CarouselProp[] }[] = [];
    for (const [playerName, markets] of byPlayer) {
      const first = [...markets.values()][0];
      const carouselProps: CarouselProp[] = [...markets.values()].map(p => ({
        id: p.id,
        player_name: playerName,
        player_id: p.player_id || first?.player_id || "",
        prop_type: p.market_key,
        line: p.line,
        over_odds: p.over_price,
        under_odds: p.under_price,
        vendor: p.bookmaker,
        game_id: gameId,
      }));
      result.push({ playerName, playerId: first?.player_id || "", props: carouselProps });
    }
    return result;
  }, [props, gameId]);

  const filteredCarousels = useMemo(() => {
    if (!search) return playerCarousels;
    const q = search.toLowerCase();
    return playerCarousels.filter(c => c.playerName.toLowerCase().includes(q));
  }, [playerCarousels, search]);

  const handleAddToSkySpread = useCallback((prop: CarouselProp) => {
    setSelectedProp(prop);
    setSkySpreadOpen(true);
  }, []);

  const handlePlayerClick = useCallback(async (playerId: string, playerName: string) => {
    const { data } = await supabase.rpc("search_players_unaccent", {
      search_query: playerName,
      max_results: 1,
    });
    if (data && data.length > 0) {
      navigate(`/player/${(data[0] as any).player_id}`);
    }
  }, [navigate]);

  const handleSubmit = async () => {
    if (!user || !selectedProp) return;
    setSubmitting(true);
    const odds = side === "over" ? selectedProp.over_odds : selectedProp.under_odds;
    const { error } = await supabase.from("bets").insert({
      user_id: user.id,
      game_id: selectedProp.game_id || gameId,
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

  if (isLoading) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" />
          Player Props
        </h3>
        <div className="cosmic-card rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Loading props...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" />
          Player Props
        </h3>
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players..." className="pl-8 h-8 text-xs" />
      </div>

      {filteredCarousels.length === 0 ? (
        <div className="cosmic-card rounded-xl p-6 text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            {(props || []).length === 0
              ? "No player props available yet. Props typically appear closer to game time."
              : "No matching players."}
          </p>
          {(props || []).length === 0 && (
            <button onClick={handleRefresh} disabled={isFetching} className="text-xs text-primary hover:underline">
              {isFetching ? "Fetching..." : "Fetch latest props"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCarousels.map(({ playerName, playerId, props: cProps }) => (
            <PlayerPropCarousel
              key={playerName}
              playerName={playerName}
              playerId={playerId}
              props={cProps}
              gameId={gameId}
              onPlayerClick={handlePlayerClick}
              onAddToSkySpread={handleAddToSkySpread}
            />
          ))}
        </div>
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
