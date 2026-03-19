import { Trophy, CheckCircle, XCircle, MinusCircle, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

function americanToDecimal(odds: number): number {
  if (odds > 0) return odds / 100 + 1;
  return 100 / Math.abs(odds) + 1;
}

type BetRow = Tables<"bets">;

const RESULT_ICONS: Record<string, typeof CheckCircle> = {
  won: CheckCircle,
  lost: XCircle,
  push: MinusCircle,
};
const RESULT_COLORS: Record<string, string> = {
  won: "text-cosmic-green",
  lost: "text-cosmic-red",
  push: "text-cosmic-gold",
};

const Results = () => {
  const { user } = useAuth();

  const { data: bets, isLoading } = useQuery({
    queryKey: ["results-bets", user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Include both legacy statuses AND trigger-settled bets
      const { data, error } = await supabase
        .from("bets")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["won", "lost", "push", "settled"])
        .order("settled_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BetRow[];
    },
    enabled: !!user,
  });

  // Normalize outcome: support both legacy status and trigger-settled bets
  const getOutcome = (b: BetRow): "won" | "lost" | "push" | null => {
    if (b.status === "won" || b.status === "lost" || b.status === "push") return b.status as any;
    if (b.status === "settled") {
      if (b.result === "win") return "won";
      if (b.result === "loss") return "lost";
      if (b.result === "push") return "push";
    }
    return null;
  };

  const settledBets = bets?.filter(b => getOutcome(b) !== null) || [];
  const won = settledBets.filter(b => getOutcome(b) === "won").length;
  const lost = settledBets.filter(b => getOutcome(b) === "lost").length;
  const pushed = settledBets.filter(b => getOutcome(b) === "push").length;
  const total = won + lost + pushed;
  const winRate = total > 0 ? ((won / (won + lost)) * 100).toFixed(1) : "—";

  // ROI calculation — canonical formula: (totalReturned - totalStaked) / totalStaked * 100
  const totalStaked = settledBets.reduce((sum, b) => sum + (b.stake_amount ?? b.stake ?? 0), 0);
  const totalReturned = settledBets.reduce((sum, b) => {
    const stake = b.stake_amount ?? b.stake ?? 0;
    const outcome = getOutcome(b);
    if (outcome === "won") return sum + (b.payout ?? stake * americanToDecimal(b.odds));
    if (outcome === "push") return sum + stake;
    return sum;
  }, 0);
  const roi = totalStaked > 0 ? (((totalReturned - totalStaked) / totalStaked) * 100).toFixed(1) : "—";

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <Trophy className="h-8 w-8 text-cosmic-gold mb-3" />
        <p className="text-sm text-muted-foreground">Please log in to view results.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-5 w-5 text-cosmic-gold" />
          <h1 className="text-xl font-bold font-display tracking-tight">Results</h1>
        </div>
        <p className="text-xs text-muted-foreground">Bet history & settlement tracking</p>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Won", val: won, color: "text-cosmic-green" },
            { label: "Lost", val: lost, color: "text-cosmic-red" },
            { label: "Push", val: pushed, color: "text-cosmic-gold" },
            { label: "Win %", val: winRate, color: "text-primary" },
          ].map(s => (
            <div key={s.label} className="cosmic-card rounded-xl p-3 text-center">
              <p className={cn("text-lg font-bold font-display tabular-nums", s.color)}>{s.val}</p>
              <p className="text-[9px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ROI card */}
        <div className="celestial-gradient rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Return on Investment</span>
          </div>
          <span className={cn(
            "text-lg font-bold font-display tabular-nums",
            Number(roi) > 0 ? "text-cosmic-green" : Number(roi) < 0 ? "text-cosmic-red" : "text-foreground"
          )}>
            {roi !== "—" ? `${Number(roi) > 0 ? "+" : ""}${roi}%` : "—"}
          </span>
        </div>

        {/* Bet history */}
        {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Loading results...</p>}

        {!isLoading && settledBets.length === 0 && (
          <div className="text-center py-12">
            <Trophy className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No settled bets yet</p>
          </div>
        )}

        <div className="space-y-2">
          {settledBets.map(bet => {
            const outcome = getOutcome(bet) || "push";
            const ResultIcon = RESULT_ICONS[outcome] || MinusCircle;
            const resultColor = RESULT_COLORS[outcome] || "text-muted-foreground";

            return (
              <div key={bet.id} className="cosmic-card rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-foreground truncate flex-1">
                    {bet.away_team && bet.home_team ? `${bet.away_team} @ ${bet.home_team}` : bet.selection}
                  </p>
                  <div className={cn("flex items-center gap-1", resultColor)}>
                    <ResultIcon className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase">{outcome}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
                  <span className="text-cosmic-indigo font-medium">{bet.market_type}</span>
                  <span>·</span>
                  <span>{bet.selection}</span>
                  {bet.odds != null && <span>({bet.odds > 0 ? "+" : ""}{bet.odds})</span>}
                </div>

                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  {bet.stake_amount && <span>Staked: {bet.stake_amount} {bet.stake_unit}</span>}
                  {bet.payout != null && outcome === "won" && (
                    <span className="text-cosmic-green font-semibold">Payout: +{bet.payout}</span>
                  )}
                  {bet.settled_at && <span>Settled: {format(new Date(bet.settled_at), "MMM d")}</span>}
                </div>

                {bet.result_notes && (
                  <p className="text-[10px] text-muted-foreground italic mt-1.5">"{bet.result_notes}"</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Results;
