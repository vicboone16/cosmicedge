import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Star, Filter, ArrowUpDown, CheckSquare, Square, Zap, TrendingUp, AlertTriangle, ChevronDown, ChevronUp, Pin, PinOff, Trash2, CheckCircle, RefreshCw, Wallet } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import CreateBetForm from "@/components/skyspread/CreateBetForm";
import PropBuilderDialog from "@/components/skyspread/PropBuilderDialog";
import BankrollTab from "@/components/skyspread/BankrollTab";
import { TrackedPropsWidget } from "@/components/tracking/TrackedProps";
import { toast } from "@/hooks/use-toast";

type BetRow = Tables<"bets">;
type LiveBoardItem = Tables<"live_board_items">;
type SnapshotRow = Tables<"game_state_snapshots">;

interface LiveBetItem extends LiveBoardItem {
  bet: BetRow;
  snapshot?: SnapshotRow | null;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-cosmic-cyan/15 text-cosmic-cyan",
  live: "bg-cosmic-green/15 text-cosmic-green",
  won: "bg-cosmic-green/20 text-cosmic-green",
  lost: "bg-cosmic-red/15 text-cosmic-red",
  push: "bg-cosmic-gold/15 text-cosmic-gold",
  void: "bg-muted text-muted-foreground",
};

const EDGE_TIER_COLORS: Record<string, string> = {
  elite: "text-cosmic-gold",
  high: "text-cosmic-green",
  medium: "text-cosmic-cyan",
  low: "text-muted-foreground",
};

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="h-1.5 bg-border rounded-full overflow-hidden flex-1">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min((value / max) * 100, 100)}%` }} />
    </div>
  );
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
    const homeLeading = (snapshot.home_score ?? 0) > (snapshot.away_score ?? 0);
    const betOnHome = bet.side?.toLowerCase() === "home" || bet.home_team?.toLowerCase().includes(bet.selection?.toLowerCase().split(" ")[0] ?? "");
    const teamLeading = betOnHome ? homeLeading : !homeLeading;
    return teamLeading
      ? { label: "On Track", color: "text-cosmic-green", icon: TrendingUp }
      : { label: "Sweating", color: "text-cosmic-gold", icon: TrendingUp };
  }
  return { label: "Pregame", color: "text-cosmic-cyan", icon: Star };
}

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
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">
          {bet.away_team && bet.home_team ? `${bet.away_team} @ ${bet.home_team}` : bet.selection}
        </p>
        <div className={cn("flex items-center gap-1 text-[10px] font-semibold", tracking.color)}>
          <TrackIcon className="h-3 w-3" />
          {tracking.label}
        </div>
      </div>

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

      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-cosmic-indigo font-medium">{bet.market_type}</span>
        <span className="text-xs text-foreground font-medium">{bet.selection}</span>
        {bet.line != null && <span className="text-[10px] text-muted-foreground">{bet.line > 0 ? "+" : ""}{bet.line}</span>}
        {bet.odds != null && <span className="text-[10px] text-muted-foreground">({bet.odds > 0 ? "+" : ""}{bet.odds})</span>}
      </div>

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

const SkySpreadPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [activeTab, setActiveTab] = useState<"ledger" | "bankroll">("ledger");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("confidence");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showLive, setShowLive] = useState(true);

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

  const triggerScoreRefresh = async () => {
    try {
      await supabase.functions.invoke("fetch-live-scores");
    } catch (e) {
      console.warn("Score refresh failed:", e);
    }
  };

  // Live board items
  const { data: liveItems } = useQuery({
    queryKey: ["live-board", userId],
    queryFn: async () => {
      if (!userId) return [];
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
      const { data: bets } = await supabase.from("bets").select("*").in("id", betIds);
      const gameIds = [...new Set(bets?.map(b => b.game_id).filter(Boolean) || [])];
      let snapshots: SnapshotRow[] = [];
      if (gameIds.length > 0) {
        const { data: snapshotData } = await supabase
          .from("game_state_snapshots")
          .select("*")
          .in("game_id", gameIds)
          .order("captured_at", { ascending: false });
        if (snapshotData) {
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
      return false;
    },
  });

  // Bets
  const { data: bets, isLoading, refetch } = useQuery({
    queryKey: ["skyspread-bets", userId, statusFilter],
    queryFn: async () => {
      if (!userId) return [];
      let query = supabase.from("bets").select("*").eq("user_id", userId);
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BetRow[];
    },
    enabled: !!userId,
  });

  const sortedBets = [...(bets || [])].sort((a, b) => {
    if (sortBy === "confidence") return (b.confidence ?? 0) - (a.confidence ?? 0);
    if (sortBy === "edge_score") return (b.edge_score ?? 0) - (a.edge_score ?? 0);
    if (sortBy === "start_time") return new Date(a.start_time || a.created_at).getTime() - new Date(b.start_time || b.created_at).getTime();
    return 0;
  });

  const openCount = bets?.filter(b => b.status === "open").length || 0;
  const liveCount = bets?.filter(b => b.status === "live").length || 0;
  const settledToday = bets?.filter(b => b.settled_at && new Date(b.settled_at).toDateString() === new Date().toDateString()).length || 0;
  const bestEdge = bets?.reduce((max, b) => Math.max(max, b.edge_score ?? 0), 0) || 0;
  const riskiest = bets?.reduce((max, b) => {
    const v = typeof b.volatility === "string" ? (b.volatility === "High" ? 90 : b.volatility === "Med" ? 60 : 30) : 50;
    return Math.max(max, v);
  }, 0) || 0;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddToLiveBoard = useCallback(async () => {
    if (!userId || selectedIds.size === 0) return;
    const inserts = Array.from(selectedIds).map(bet_id => ({
      user_id: userId,
      bet_id,
    }));
    const { error } = await supabase.from("live_board_items").upsert(inserts, { onConflict: "user_id,bet_id" });
    if (!error) {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["live-board"] });
      toast({ title: "Added to Live Board" });
    }
  }, [userId, selectedIds, queryClient]);

  const handleRemoveLive = async (itemId: string) => {
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
        <Star className="h-8 w-8 text-primary mb-3" />
        <p className="text-sm text-muted-foreground text-center mb-3">Log in to access SkySpread.</p>
        <button onClick={() => navigate("/auth")} className="text-xs text-primary hover:underline">
          Go to Login →
        </button>
      </div>
    );
  }

  const liveItemCount = liveItems?.length || 0;
  const hasLiveGames = liveItems?.some(i => i.bet.status === "live" || i.snapshot?.status === "live");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-12 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold font-display">SkySpread</h1>
            <p className="text-xs text-muted-foreground">Where the line meets the sky.</p>
          </div>
          <div className="flex items-center gap-2">
            <PropBuilderDialog userId={userId} />
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
            <CreateBetForm userId={userId} />
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 mt-3">
          <button
            onClick={() => setActiveTab("ledger")}
            className={cn(
              "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
              activeTab === "ledger" ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"
            )}
          >
            <Star className="h-3 w-3" /> Ledger
          </button>
          <button
            onClick={() => setActiveTab("bankroll")}
            className={cn(
              "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
              activeTab === "bankroll" ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"
            )}
          >
            <Wallet className="h-3 w-3" /> Bankroll
          </button>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {activeTab === "bankroll" ? (
          <BankrollTab userId={userId} />
        ) : (
          <>
        {/* Live Board Header Section */}
        {liveItemCount > 0 && (
          <section>
            <button
              onClick={() => setShowLive(!showLive)}
              className="w-full flex items-center justify-between py-1 group"
            >
              <h3 className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-cosmic-green" />
                <span className="text-foreground">Live Board</span>
                {hasLiveGames && <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse" />}
                <span className="text-muted-foreground ml-1">({liveItemCount})</span>
              </h3>
              {showLive ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              )}
            </button>

            {showLive && (
              <div className="space-y-2 mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                {liveItems?.map(item => (
                  <LiveCard key={item.id} item={item} onRemove={handleRemoveLive} onTogglePin={handleTogglePin} />
                ))}
                <TrackedPropsWidget />
              </div>
            )}
          </section>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {["all", "open", "live", "won", "lost", "push", "void"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full transition-colors whitespace-nowrap",
                statusFilter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
          {["confidence", "edge_score", "start_time"].map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded transition-colors",
                sortBy === s ? "text-primary font-semibold" : "text-muted-foreground"
              )}
            >
              {s === "edge_score" ? "Edge" : s === "start_time" ? "Time" : "Confidence"}
            </button>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: "Open", val: openCount, color: "text-cosmic-cyan" },
            { label: "Live", val: liveCount, color: "text-cosmic-green" },
            { label: "Settled", val: settledToday, color: "text-foreground" },
            { label: "Best Edge", val: bestEdge, color: "text-cosmic-gold" },
            { label: "Riskiest", val: riskiest, color: "text-cosmic-red" },
          ].map(s => (
            <div key={s.label} className="cosmic-card rounded-xl p-2 text-center">
              <p className={cn("text-sm font-bold font-display tabular-nums", s.color)}>{s.val}</p>
              <p className="text-[9px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Bet List */}
        {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Loading bets...</p>}

        {!isLoading && sortedBets.length === 0 && (
          <div className="text-center py-12">
            <p className="text-lg mb-1">✦</p>
            <p className="text-sm text-muted-foreground">No bets found</p>
            <p className="text-[10px] text-muted-foreground mt-1">Place your first bet to see it here</p>
          </div>
        )}

        <div className="space-y-2">
          {sortedBets.map(bet => {
            const isSelected = selectedIds.has(bet.id);
            const isExpanded = expandedId === bet.id;
            const volNum = typeof bet.volatility === "string"
              ? (bet.volatility === "High" ? 85 : bet.volatility === "Med" ? 55 : 25)
              : 50;

            return (
              <div key={bet.id} className={cn(
                "cosmic-card rounded-xl overflow-hidden transition-all",
                isSelected && "border-primary/40 cosmic-glow"
              )}>
                <div className="p-3">
                  <div className="flex items-start gap-2">
                    <button onClick={() => toggleSelect(bet.id)} className="mt-0.5 text-muted-foreground hover:text-primary transition-colors">
                      {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {bet.away_team && bet.home_team ? `${bet.away_team} @ ${bet.home_team}` : bet.selection}
                        </p>
                        <span className={cn("text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full", STATUS_COLORS[bet.status || "open"])}>
                          {bet.status || "open"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-cosmic-indigo font-medium">{bet.market_type}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-xs text-foreground font-medium truncate">{bet.selection}</span>
                        {bet.line != null && <span className="text-[10px] text-muted-foreground">{bet.line > 0 ? "+" : ""}{bet.line}</span>}
                        {bet.odds != null && <span className="text-[10px] text-muted-foreground">{bet.odds > 0 ? "+" : ""}{bet.odds}</span>}
                      </div>

                      {(bet.stake_amount || bet.stake) && (
                        <p className="text-[10px] text-muted-foreground mb-2">
                          Stake: {bet.stake_amount ?? bet.stake} {bet.stake_unit || "units"}
                          {bet.to_win_amount ? ` · To win: ${bet.to_win_amount}` : ""}
                        </p>
                      )}

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground w-12">Conf</span>
                          <ScoreBar value={bet.confidence ?? 50} color="bg-cosmic-cyan" />
                          <span className="text-[9px] text-muted-foreground tabular-nums w-6 text-right">{bet.confidence ?? 50}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground w-12">Edge</span>
                          <ScoreBar value={bet.edge_score ?? 50} color="bg-cosmic-gold" />
                          <span className="text-[9px] text-muted-foreground tabular-nums w-6 text-right">{bet.edge_score ?? 50}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground w-12">Vol</span>
                          <ScoreBar value={volNum} color="bg-cosmic-red" />
                          <span className="text-[9px] text-muted-foreground tabular-nums w-6 text-right">{bet.volatility || volNum}</span>
                        </div>
                      </div>

                      {bet.edge_tier && (
                        <span className={cn("text-[10px] font-semibold uppercase mt-1 inline-block", EDGE_TIER_COLORS[bet.edge_tier])}>
                          {bet.edge_tier} edge
                        </span>
                      )}
                    </div>

                    <button onClick={() => setExpandedId(isExpanded ? null : bet.id)} className="text-muted-foreground hover:text-foreground">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border/50 space-y-2 pl-6">
                      {bet.why_summary && (
                        <div>
                          <p className="text-[10px] font-semibold text-cosmic-indigo uppercase tracking-wider">Why</p>
                          <p className="text-xs text-muted-foreground">{bet.why_summary}</p>
                        </div>
                      )}
                      {bet.notes && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</p>
                          <p className="text-xs text-muted-foreground">{bet.notes}</p>
                        </div>
                      )}
                      {bet.start_time && (
                        <p className="text-[10px] text-muted-foreground">
                          Start: {format(new Date(bet.start_time), "MMM d, h:mm a")}
                        </p>
                      )}
                      {bet.book && (
                        <p className="text-[10px] text-muted-foreground">Book: {bet.book}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </>
        )}
      </div>

      {/* Selection Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-50 px-4 pb-2">
          <div className="max-w-lg mx-auto cosmic-card rounded-xl p-3 flex items-center justify-between cosmic-glow">
            <span className="text-xs text-foreground font-medium">{selectedIds.size} selected</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Clear
              </button>
              <button
                onClick={handleAddToLiveBoard}
                className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5"
              >
                <Zap className="h-3.5 w-3.5" />
                Add to Live Board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkySpreadPage;
