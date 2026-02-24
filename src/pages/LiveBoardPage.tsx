import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Pin, PinOff, Trash2, Star, TrendingUp, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";

import { toast } from "@/hooks/use-toast";

type BetRow = Tables<"bets">;
type LiveBoardItem = Tables<"live_board_items">;
type SnapshotRow = Tables<"game_state_snapshots">;

interface LiveBetItem extends LiveBoardItem {
  bet: BetRow;
  snapshot?: SnapshotRow | null;
}

function getTrackingStatus(bet: BetRow, snapshot?: SnapshotRow | null): { label: string; color: string; icon: typeof TrendingUp } {
  const status = snapshot?.status || bet.status || "open";
  if (status === "final" || bet.status === "won") return { label: "Won ✓", color: "text-cosmic-green", icon: CheckCircle };
  if (bet.status === "lost") return { label: "Lost", color: "text-cosmic-red", icon: AlertTriangle };
  if (status === "live" || bet.status === "live") {
    if (!snapshot) {
      const edge = bet.edge_score ?? 50;
      if (edge >= 70) return { label: "On Track", color: "text-cosmic-green", icon: TrendingUp };
      if (edge >= 40) return { label: "Sweating", color: "text-cosmic-gold", icon: TrendingUp };
      return { label: "Danger", color: "text-cosmic-red", icon: AlertTriangle };
    }
    // Derive from live score vs bet
    const totalScore = (snapshot.home_score ?? 0) + (snapshot.away_score ?? 0);
    const qNum = parseInt(snapshot.quarter ?? "1");
    const elapsed = Math.min(qNum / 4, 1);
    if (bet.market_type === "total" && bet.line) {
      const pace = elapsed > 0 ? totalScore / elapsed : 0;
      const side = bet.side?.toLowerCase();
      if (side === "over") {
        return pace >= bet.line
          ? { label: "On Track", color: "text-cosmic-green", icon: TrendingUp }
          : pace >= bet.line * 0.85
            ? { label: "Sweating", color: "text-cosmic-gold", icon: TrendingUp }
            : { label: "Danger", color: "text-cosmic-red", icon: AlertTriangle };
      }
      if (side === "under") {
        return pace <= bet.line
          ? { label: "On Track", color: "text-cosmic-green", icon: TrendingUp }
          : pace <= bet.line * 1.15
            ? { label: "Sweating", color: "text-cosmic-gold", icon: TrendingUp }
            : { label: "Danger", color: "text-cosmic-red", icon: AlertTriangle };
      }
    }
    // Spread / moneyline: check if picked team is leading
    const homeLeading = (snapshot.home_score ?? 0) > (snapshot.away_score ?? 0);
    const betOnHome = bet.side?.toLowerCase() === "home" || bet.home_team?.toLowerCase().includes(bet.selection?.toLowerCase().split(" ")[0] ?? "");
    const teamLeading = betOnHome ? homeLeading : !homeLeading;
    return teamLeading
      ? { label: "On Track", color: "text-cosmic-green", icon: TrendingUp }
      : { label: "Sweating", color: "text-cosmic-gold", icon: TrendingUp };
  }
  return { label: "Pregame", color: "text-cosmic-cyan", icon: Star };
}

const LiveBoardPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [refreshing, setRefreshing] = useState(false);

  // Subscribe to realtime score updates
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("live-scores")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_state_snapshots" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["live-board"] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, queryClient]);

  // Trigger edge function to refresh snapshots
  const triggerScoreRefresh = async () => {
    try {
      await supabase.functions.invoke("fetch-live-scores");
    } catch (e) {
      console.warn("Score refresh failed:", e);
    }
  };

  const { data: liveItems, isLoading } = useQuery({
    queryKey: ["live-board", userId],
    queryFn: async () => {
      if (!userId) return [];

      // Trigger score refresh in background
      triggerScoreRefresh();

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

      // Get unique game_ids to fetch latest snapshots
      const gameIds = [...new Set(bets?.map(b => b.game_id).filter(Boolean) || [])];
      let snapshots: SnapshotRow[] = [];
      if (gameIds.length > 0) {
        // Get the latest snapshot per game_id
        const { data: snapshotData } = await supabase
          .from("game_state_snapshots")
          .select("*")
          .in("game_id", gameIds)
          .order("captured_at", { ascending: false });
        if (snapshotData) {
          // Dedupe: keep only the latest per game_id
          const seen = new Set<string>();
          snapshots = snapshotData.filter(s => {
            if (seen.has(s.game_id)) return false;
            seen.add(s.game_id);
            return true;
          });
        }
      }

      return items.map(item => {
        const bet = bets?.find(b => b.id === item.bet_id) as BetRow;
        const snapshot = bet ? snapshots.find(s => s.game_id === bet.game_id) ?? null : null;
        return { ...item, bet, snapshot };
      }).filter(i => i.bet) as LiveBetItem[];
    },
    enabled: !!userId,
    refetchInterval: (query) => {
      const items = query.state.data as LiveBetItem[] | undefined;
      const hasLive = items?.some(i => i.bet.status === "live" || i.snapshot?.status === "live");
      if (hasLive) return 15_000;
      const hasPregame = items?.some(i => i.bet.status === "open");
      if (hasPregame) return 5 * 60_000;
      return false;
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
        <p className="text-sm text-muted-foreground text-center mb-3">Log in to access Live Board.</p>
        <button onClick={() => navigate("/auth")} className="text-xs text-primary hover:underline">
          Go to Login →
        </button>
      </div>
    );
  }

  const pinnedItems = liveItems?.filter(i => i.is_pinned) || [];
  const unpinnedItems = liveItems?.filter(i => !i.is_pinned) || [];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-12 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold font-display">Live Board</h1>
          </div>
          <button
            onClick={async () => {
              setRefreshing(true);
              await triggerScoreRefresh();
              queryClient.invalidateQueries({ queryKey: ["live-board"] });
              toast({ title: "Scores refreshed" });
              setTimeout(() => setRefreshing(false), 1000);
            }}
            disabled={refreshing}
            className="p-2 rounded-lg bg-secondary hover:bg-accent transition-colors disabled:opacity-50"
            aria-label="Refresh scores"
          >
            <RefreshCw className={cn("h-4 w-4 text-muted-foreground", refreshing && "animate-spin")} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Real-time tracking • auto-updates</p>
        {liveItems && liveItems.length > 0 && (
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] text-cosmic-green font-semibold">
              {liveItems.filter(i => i.bet.status === "live" || i.snapshot?.status === "live").length} LIVE
            </span>
            <span className="text-[10px] text-cosmic-cyan font-medium">
              {liveItems.filter(i => i.bet.status === "open" && i.snapshot?.status !== "live").length} Pregame
            </span>
            <span className="text-[10px] text-muted-foreground">
              {liveItems.filter(i => ["won", "lost", "push"].includes(i.bet.status || "") || i.snapshot?.status === "final").length} Settled
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
  const snapshot = item.snapshot;
  const tracking = getTrackingStatus(bet, snapshot);
  const TrackIcon = tracking.icon;
  const isLive = snapshot?.status === "live" || bet.status === "live";

  return (
    <div className={cn(
      "cosmic-card rounded-xl p-3",
      item.is_pinned && "border-cosmic-gold/30",
      isLive && "border-l-2 border-l-cosmic-green"
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

      {/* Live score display from snapshot */}
      {isLive && snapshot && (
        <div className="bg-secondary/50 rounded-lg p-2 mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse" />
            <span className="text-[10px] text-cosmic-green font-semibold uppercase">Live</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground">{bet.away_team || "Away"}</p>
              <p className="text-sm font-bold text-foreground tabular-nums">{snapshot.away_score ?? "–"}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground">Q{snapshot.quarter || "?"}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">{snapshot.clock || ""}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground">{bet.home_team || "Home"}</p>
              <p className="text-sm font-bold text-foreground tabular-nums">{snapshot.home_score ?? "–"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Pregame / non-snapshot live */}
      {!snapshot && isLive && (
        <div className="flex items-center gap-2 mb-2">
          <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse" />
          <span className="text-[10px] text-cosmic-green font-semibold uppercase">Live</span>
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
