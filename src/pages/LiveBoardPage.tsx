import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Pin, PinOff, Trash2, Star, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type BetRow = Tables<"bets">;
type LiveBoardItem = Tables<"live_board_items">;

interface LiveBetItem extends LiveBoardItem {
  bet: BetRow;
}

function getTrackingStatus(bet: BetRow): { label: string; color: string; icon: typeof TrendingUp } {
  const status = bet.status || "open";
  if (status === "won") return { label: "Won ✓", color: "text-cosmic-green", icon: CheckCircle };
  if (status === "lost") return { label: "Lost", color: "text-cosmic-red", icon: AlertTriangle };
  if (status === "live") {
    const edge = bet.edge_score ?? 50;
    if (edge >= 70) return { label: "On Track", color: "text-cosmic-green", icon: TrendingUp };
    if (edge >= 40) return { label: "Sweating", color: "text-cosmic-gold", icon: TrendingUp };
    return { label: "Danger", color: "text-cosmic-red", icon: AlertTriangle };
  }
  return { label: "Pregame", color: "text-cosmic-cyan", icon: Star };
}

const LiveBoardPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const { data: liveItems, isLoading } = useQuery({
    queryKey: ["live-board", userId],
    queryFn: async () => {
      if (!userId) return [];
      // Fetch live board items with their bets
      const { data: items, error } = await supabase
        .from("live_board_items")
        .select("*")
        .eq("user_id", userId)
        .order("is_pinned", { ascending: false })
        .order("order_index", { ascending: true });
      if (error) throw error;
      if (!items?.length) return [];

      const betIds = items.map(i => i.bet_id);
      const { data: bets } = await supabase
        .from("bets")
        .select("*")
        .in("id", betIds);

      return items.map(item => ({
        ...item,
        bet: bets?.find(b => b.id === item.bet_id) as BetRow,
      })).filter(i => i.bet) as LiveBetItem[];
    },
    enabled: !!userId,
    refetchInterval: (query) => {
      // Refresh faster when there are live bets
      const items = query.state.data as LiveBetItem[] | undefined;
      const hasLive = items?.some(i => i.bet.status === "live");
      if (hasLive) return 15_000; // 15s for live
      const hasPregame = items?.some(i => i.bet.status === "open");
      if (hasPregame) return 5 * 60_000; // 5min for pregame
      return false; // no refresh if all settled
    },
  });

  const handleRemove = async (itemId: string) => {
    await supabase.from("live_board_items").delete().eq("id", itemId);
    queryClient.invalidateQueries({ queryKey: ["live-board"] });
  };

  const handleTogglePin = async (item: LiveBoardItem) => {
    await supabase.from("live_board_items").update({ is_pinned: !item.is_pinned }).eq("id", item.id);
    queryClient.invalidateQueries({ queryKey: ["live-board"] });
  };

  if (!userId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <Zap className="h-8 w-8 text-primary mb-3" />
        <p className="text-sm text-muted-foreground text-center">Please log in to access Live Board.</p>
      </div>
    );
  }

  const pinnedItems = liveItems?.filter(i => i.is_pinned) || [];
  const unpinnedItems = liveItems?.filter(i => !i.is_pinned) || [];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-12 pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold font-display">Live Board</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Live tracking initiated…</p>
        {liveItems && liveItems.length > 0 && (
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] text-cosmic-green font-semibold">
              {liveItems.filter(i => i.bet.status === "live").length} LIVE
            </span>
            <span className="text-[10px] text-cosmic-cyan font-medium">
              {liveItems.filter(i => i.bet.status === "open").length} Pregame
            </span>
            <span className="text-[10px] text-muted-foreground">
              {liveItems.filter(i => ["won", "lost", "push"].includes(i.bet.status || "")).length} Settled
            </span>
          </div>
        )}
      </header>

      <div className="px-4 py-4 space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Loading board...</p>}

        {!isLoading && (!liveItems || liveItems.length === 0) && (
          <div className="text-center py-12">
            <Zap className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No bets on the Live Board</p>
            <button onClick={() => navigate("/skyspread")} className="text-xs text-primary hover:underline mt-2">
              Go to SkySpread to add bets →
            </button>
          </div>
        )}

        {/* Pinned */}
        {pinnedItems.length > 0 && (
          <section>
            <h3 className="text-[10px] font-semibold text-cosmic-gold uppercase tracking-widest mb-2 flex items-center gap-1">
              <Pin className="h-3 w-3" /> Pinned
            </h3>
            <div className="space-y-2">
              {pinnedItems.map(item => (
                <LiveCard key={item.id} item={item} onRemove={handleRemove} onTogglePin={handleTogglePin} />
              ))}
            </div>
          </section>
        )}

        {/* Unpinned */}
        {unpinnedItems.length > 0 && (
          <section>
            {pinnedItems.length > 0 && (
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Tracking</h3>
            )}
            <div className="space-y-2">
              {unpinnedItems.map(item => (
                <LiveCard key={item.id} item={item} onRemove={handleRemove} onTogglePin={handleTogglePin} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

function LiveCard({ item, onRemove, onTogglePin }: {
  item: LiveBetItem;
  onRemove: (id: string) => void;
  onTogglePin: (item: LiveBoardItem) => void;
}) {
  const bet = item.bet;
  const tracking = getTrackingStatus(bet);
  const TrackIcon = tracking.icon;

  return (
    <div className={cn(
      "cosmic-card rounded-xl p-3",
      item.is_pinned && "border-cosmic-gold/30",
      bet.status === "live" && "border-l-2 border-l-cosmic-green"
    )}>
      {/* Header: game + tracking status */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">
          {bet.away_team && bet.home_team ? `${bet.away_team} @ ${bet.home_team}` : bet.selection}
        </p>
        <div className={cn("flex items-center gap-1 text-[10px] font-semibold", tracking.color)}>
          <TrackIcon className="h-3 w-3" />
          {tracking.label}
        </div>
      </div>

      {/* Live score / status */}
      {bet.status === "live" && (
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse-glow" />
            <span className="text-[10px] text-cosmic-green font-semibold uppercase">Live</span>
          </span>
          {bet.start_time && (
            <span className="text-[10px] text-muted-foreground">
              Started {format(new Date(bet.start_time), "h:mm a")}
            </span>
          )}
        </div>
      )}

      {/* Bet details */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-cosmic-indigo font-medium">{bet.market_type}</span>
        <span className="text-xs text-foreground font-medium">{bet.selection}</span>
        {bet.line != null && <span className="text-[10px] text-muted-foreground">{bet.line > 0 ? "+" : ""}{bet.line}</span>}
        {bet.odds != null && <span className="text-[10px] text-muted-foreground">({bet.odds > 0 ? "+" : ""}{bet.odds})</span>}
      </div>

      {/* Score indicators */}
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">Conf</span>
          <span className="text-[10px] font-semibold text-cosmic-cyan tabular-nums">{bet.confidence ?? 50}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">Edge</span>
          <span className="text-[10px] font-semibold text-cosmic-gold tabular-nums">{bet.edge_score ?? 50}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">Vol</span>
          <span className="text-[10px] font-semibold text-cosmic-red tabular-nums">{bet.volatility || "50"}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
        <button
          onClick={() => onTogglePin(item)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-cosmic-gold transition-colors"
        >
          {item.is_pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {item.is_pinned ? "Unpin" : "Pin"}
        </button>
        <button
          onClick={() => onRemove(item.id)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors ml-auto"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </button>
      </div>
    </div>
  );
}

export default LiveBoardPage;
