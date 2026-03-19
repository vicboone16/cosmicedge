/**
 * Canonical betting performance calculator.
 * Single source of truth for ROI, win rate, and record across all surfaces.
 * Used by: Results, Analytics, BankrollTab, UserProfilePage, Leaderboard.
 */
import type { Tables } from "@/integrations/supabase/types";

type BetRow = Tables<"bets">;

export function americanToDecimal(odds: number): number {
  if (odds > 0) return odds / 100 + 1;
  return 100 / Math.abs(odds) + 1;
}

/** Normalize outcome from both legacy status values and trigger-settled bets. */
export function getOutcome(b: Pick<BetRow, "status" | "result">): "won" | "lost" | "push" | null {
  if (b.status === "won" || b.status === "lost" || b.status === "push") return b.status as any;
  if (b.status === "settled") {
    if (b.result === "win") return "won";
    if (b.result === "loss") return "lost";
    if (b.result === "push") return "push";
  }
  return null;
}

/** Filter bets to only settled ones (with a resolvable outcome). */
export function filterSettled<T extends Pick<BetRow, "status" | "result">>(bets: T[]): T[] {
  return bets.filter(b => getOutcome(b) !== null);
}

export interface PerformanceSummary {
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  totalStaked: number;
  totalReturned: number;
  roi: number;
  winRate: number;
}

/** Compute canonical performance summary from a list of bets. */
export function computePerformance(bets: Pick<BetRow, "status" | "result" | "stake_amount" | "stake" | "payout" | "odds">[]): PerformanceSummary {
  const settled = filterSettled(bets);
  let totalStaked = 0;
  let totalReturned = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;

  for (const b of settled) {
    const stake = b.stake_amount ?? b.stake ?? 0;
    totalStaked += stake;
    const outcome = getOutcome(b);
    if (outcome === "won") {
      wins++;
      totalReturned += b.payout ?? stake * americanToDecimal(b.odds);
    } else if (outcome === "lost") {
      losses++;
    } else {
      pushes++;
      totalReturned += stake;
    }
  }

  const total = wins + losses + pushes;
  const roi = totalStaked > 0 ? ((totalReturned - totalStaked) / totalStaked) * 100 : 0;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;

  return { total, wins, losses, pushes, totalStaked, totalReturned, roi, winRate };
}
