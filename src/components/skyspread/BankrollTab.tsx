import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Trophy, Target, Zap, Star, Users, DollarSign, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { americanToDecimal, getOutcome as getOutcomeShared } from "@/lib/betting-math";

type BetRow = Tables<"bets">;

interface BankrollTabProps {
  userId: string;
}

interface BankrollStats {
  totalBets: number;
  totalStaked: number;
  totalReturned: number;
  roi: number;
  winRate: number;
  wins: number;
  losses: number;
  pushes: number;
  avgOdds: number;
  bestStreak: number;
  currentStreak: number;
  byLeague: Record<string, { bets: number; staked: number; returned: number; roi: number; wins: number; losses: number }>;
  byMarket: Record<string, { bets: number; staked: number; returned: number; roi: number; wins: number; losses: number }>;
}

export function computeStats(bets: BetRow[]): BankrollStats {
  // Support both legacy status values ("won"/"lost"/"push") and trigger-settled ("settled" with result field)
  const settled = bets.filter(b => getOutcomeShared(b) !== null);

  // Use shared canonical outcome resolver
  const getOutcome = (b: BetRow): "won" | "lost" | "push" => {
    return getOutcomeShared(b) || "push";
  };
  let totalStaked = 0;
  let totalReturned = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let oddsSum = 0;
  let bestStreak = 0;
  let currentStreak = 0;
  let tempStreak = 0;

  const byLeague: BankrollStats["byLeague"] = {};
  const byMarket: BankrollStats["byMarket"] = {};

  // Sort by settled_at for streak calculation
  const sorted = [...settled].sort((a, b) =>
    new Date(a.settled_at || a.created_at).getTime() - new Date(b.settled_at || b.created_at).getTime()
  );

  for (const bet of sorted) {
    const stake = bet.stake_amount || bet.stake || 0;
    totalStaked += stake;
    oddsSum += bet.odds;

    const league = bet.sport || "Unknown";
    const market = bet.market_type || "Unknown";
    const outcome = getOutcome(bet);

    if (!byLeague[league]) byLeague[league] = { bets: 0, staked: 0, returned: 0, roi: 0, wins: 0, losses: 0 };
    if (!byMarket[market]) byMarket[market] = { bets: 0, staked: 0, returned: 0, roi: 0, wins: 0, losses: 0 };

    byLeague[league].bets++;
    byLeague[league].staked += stake;
    byMarket[market].bets++;
    byMarket[market].staked += stake;

    if (outcome === "won") {
      wins++;
      // Use payout if available (from trigger), otherwise calculate
      const returned = bet.payout ? bet.payout : stake * americanToDecimal(bet.odds);
      totalReturned += returned;
      byLeague[league].returned += returned;
      byLeague[league].wins++;
      byMarket[market].returned += returned;
      byMarket[market].wins++;
      tempStreak++;
      bestStreak = Math.max(bestStreak, tempStreak);
    } else if (outcome === "lost") {
      losses++;
      byLeague[league].losses++;
      byMarket[market].losses++;
      tempStreak = 0;
    } else {
      pushes++;
      totalReturned += stake;
      byLeague[league].returned += stake;
      byMarket[market].returned += stake;
    }
  }

  // Current streak (from end)
  currentStreak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (getOutcome(sorted[i]) === "won") currentStreak++;
    else break;
  }

  // Compute ROI for sub-groups
  for (const key of Object.keys(byLeague)) {
    const g = byLeague[key];
    g.roi = g.staked > 0 ? ((g.returned - g.staked) / g.staked) * 100 : 0;
  }
  for (const key of Object.keys(byMarket)) {
    const g = byMarket[key];
    g.roi = g.staked > 0 ? ((g.returned - g.staked) / g.staked) * 100 : 0;
  }

  return {
    totalBets: settled.length,
    totalStaked,
    totalReturned,
    roi: totalStaked > 0 ? ((totalReturned - totalStaked) / totalStaked) * 100 : 0,
    winRate: settled.length > 0 ? (wins / settled.length) * 100 : 0,
    wins,
    losses,
    pushes,
    avgOdds: settled.length > 0 ? Math.round(oddsSum / settled.length) : 0,
    bestStreak,
    currentStreak,
    byLeague,
    byMarket,
  };
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: typeof TrendingUp; color: string;
}) {
  return (
    <div className="cosmic-card rounded-xl p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", color)} />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("text-lg font-bold font-display tabular-nums", color)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function BreakdownRow({ label, stats }: {
  label: string; stats: { bets: number; roi: number; wins: number; losses: number };
}) {
  const isPositive = stats.roi >= 0;
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground">{stats.bets} bets · {stats.wins}W-{stats.losses}L</p>
      </div>
      <span className={cn(
        "text-sm font-bold tabular-nums",
        isPositive ? "text-cosmic-green" : "text-cosmic-red"
      )}>
        {isPositive ? "+" : ""}{stats.roi.toFixed(1)}%
      </span>
    </div>
  );
}

export default function BankrollTab({ userId }: BankrollTabProps) {
  const qc = useQueryClient();

  // Fetch starting bankroll from profile
  const { data: profile } = useQuery({
    queryKey: ["profile-bankroll", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("starting_bankroll")
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
  });

  const [editingBankroll, setEditingBankroll] = useState(false);
  const [bankrollInput, setBankrollInput] = useState("");

  const startingBankroll = profile?.starting_bankroll ?? 0;

  const saveBankrollMutation = useMutation({
    mutationFn: async (amount: number) => {
      const { error } = await supabase
        .from("profiles")
        .update({ starting_bankroll: amount } as any)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-bankroll"] });
      setEditingBankroll(false);
      toast({ title: "Starting bankroll updated" });
    },
  });

  // Fetch all user bets
  const { data: bets } = useQuery({
    queryKey: ["bankroll-bets", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bets")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BetRow[];
    },
  });

  // Fetch friend leaderboard
  const { data: leaderboard } = useQuery({
    queryKey: ["bankroll-leaderboard", userId],
    queryFn: async () => {
      // Get accepted friends
      const { data: friendships } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq("status", "accepted");

      if (!friendships?.length) return [];

      const friendIds = friendships.map(f =>
        f.requester_id === userId ? f.addressee_id : f.requester_id
      );
      // Include self
      const allIds = [userId, ...friendIds];

      // Get profiles
      const { data: profiles } = await supabase
        .rpc("get_public_profiles", { user_ids: allIds }) as any;

      // Get settled bets for all (only users who share picks)
      const sharingIds = (profiles || [])
        .filter(p => p.share_picks || p.user_id === userId)
        .map(p => p.user_id);

      if (!sharingIds.length) return [];

      // Include both legacy and trigger-settled statuses
      const { data: allBets } = await supabase
        .from("bets")
        .select("user_id, status, result, odds, stake_amount, stake, payout, settled_at, created_at, sport, market_type")
        .in("user_id", sharingIds)
        .in("status", ["won", "lost", "push", "settled"]);

      // Group by user
      const userBets: Record<string, BetRow[]> = {};
      for (const bet of (allBets || []) as BetRow[]) {
        if (!userBets[bet.user_id]) userBets[bet.user_id] = [];
        userBets[bet.user_id].push(bet);
      }

      return sharingIds.map(uid => {
        const profile = profiles?.find(p => p.user_id === uid);
        const bets = userBets[uid] || [];
        const stats = computeStats(bets);
        return {
          userId: uid,
          name: profile?.display_name || "Unknown",
          avatar: profile?.avatar_url,
          isMe: uid === userId,
          ...stats,
        };
      }).sort((a, b) => b.roi - a.roi);
    },
  });

  const stats = useMemo(() => computeStats(bets || []), [bets]);

  const profitLoss = stats.totalReturned - stats.totalStaked;
  const isProfit = profitLoss >= 0;
  const currentBankroll = startingBankroll + profitLoss;

  return (
    <div className="space-y-4">
      {/* Starting Bankroll */}
      <div className="cosmic-card rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-cosmic-gold" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Starting Bankroll</span>
          </div>
          {!editingBankroll ? (
            <button
              onClick={() => { setEditingBankroll(true); setBankrollInput(String(startingBankroll)); }}
              className="text-sm font-bold text-foreground hover:text-primary transition-colors tabular-nums"
            >
              ${startingBankroll.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold text-muted-foreground">$</span>
              <input
                type="number"
                value={bankrollInput}
                onChange={e => setBankrollInput(e.target.value)}
                className="w-24 bg-secondary/50 border border-border/50 rounded px-2 py-0.5 text-sm font-bold tabular-nums text-right"
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") saveBankrollMutation.mutate(parseFloat(bankrollInput) || 0); }}
              />
              <button
                onClick={() => saveBankrollMutation.mutate(parseFloat(bankrollInput) || 0)}
                className="p-1 rounded hover:bg-primary/20 text-primary transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
        {startingBankroll > 0 && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
            <span className="text-[10px] text-muted-foreground">Current Bankroll</span>
            <span className={cn("text-sm font-bold tabular-nums", currentBankroll >= startingBankroll ? "text-cosmic-green" : "text-cosmic-red")}>
              ${currentBankroll.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="ROI"
          value={`${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%`}
          sub={`${stats.totalBets} settled bets`}
          icon={isProfit ? TrendingUp : TrendingDown}
          color={isProfit ? "text-cosmic-green" : "text-cosmic-red"}
        />
        <StatCard
          label="P&L"
          value={`${isProfit ? "+" : ""}$${Math.abs(profitLoss).toFixed(2)}`}
          sub={`$${stats.totalStaked.toFixed(2)} staked`}
          icon={isProfit ? TrendingUp : TrendingDown}
          color={isProfit ? "text-cosmic-green" : "text-cosmic-red"}
        />
        <StatCard
          label="Win Rate"
          value={`${stats.winRate.toFixed(0)}%`}
          sub={`${stats.wins}W · ${stats.losses}L · ${stats.pushes}P`}
          icon={Target}
          color="text-cosmic-cyan"
        />
        <StatCard
          label="Streak"
          value={`${stats.currentStreak}W`}
          sub={`Best: ${stats.bestStreak}W · Avg: ${stats.avgOdds > 0 ? "+" : ""}${stats.avgOdds}`}
          icon={Zap}
          color="text-cosmic-gold"
        />
      </div>

      {/* By League */}
      {Object.keys(stats.byLeague).length > 0 && (
        <div className="cosmic-card rounded-xl p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Star className="h-3 w-3 text-cosmic-indigo" />
            By League
          </h3>
          {Object.entries(stats.byLeague)
            .sort(([, a], [, b]) => b.bets - a.bets)
            .map(([league, s]) => (
              <BreakdownRow key={league} label={league} stats={s} />
            ))}
        </div>
      )}

      {/* By Market Type */}
      {Object.keys(stats.byMarket).length > 0 && (
        <div className="cosmic-card rounded-xl p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Target className="h-3 w-3 text-cosmic-cyan" />
            By Market
          </h3>
          {Object.entries(stats.byMarket)
            .sort(([, a], [, b]) => b.bets - a.bets)
            .map(([market, s]) => (
              <BreakdownRow key={market} label={market} stats={s} />
            ))}
        </div>
      )}

      {/* Friend Leaderboard */}
      {leaderboard && leaderboard.length > 0 && (
        <div className="cosmic-card rounded-xl p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Users className="h-3 w-3 text-cosmic-gold" />
            Leaderboard
          </h3>
          <div className="space-y-2">
            {leaderboard.map((entry, idx) => (
              <div
                key={entry.userId}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg transition-colors",
                  entry.isMe && "bg-primary/5 border border-primary/20",
                  idx === 0 && "bg-cosmic-gold/5"
                )}
              >
                <span className={cn(
                  "text-sm font-bold tabular-nums w-6 text-center",
                  idx === 0 ? "text-cosmic-gold" : idx === 1 ? "text-muted-foreground" : "text-muted-foreground/60"
                )}>
                  {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`}
                </span>
                <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                  {entry.avatar ? (
                    <img src={entry.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {entry.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {entry.name} {entry.isMe && <span className="text-[10px] text-primary">(you)</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {entry.totalBets} bets · {entry.winRate.toFixed(0)}% WR
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "text-sm font-bold tabular-nums",
                    entry.roi >= 0 ? "text-cosmic-green" : "text-cosmic-red"
                  )}>
                    {entry.roi >= 0 ? "+" : ""}{entry.roi.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">ROI</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.totalBets === 0 && (
        <div className="text-center py-12">
          <Trophy className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No settled bets yet</p>
          <p className="text-[10px] text-muted-foreground mt-1">Settle some bets to see your bankroll stats</p>
        </div>
      )}
    </div>
  );
}
