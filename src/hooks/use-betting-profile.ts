import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface UserBettingProfile {
  id: string;
  user_id: string;
  risk_tolerance: string;
  betting_archetype: string;
  preferred_bet_types: string[];
  preferred_market_types: string[];
  preferred_slip_size: number;
  avg_live_bet_frequency: number;
  avg_pregame_bet_frequency: number;
  same_game_stack_tendency: number;
  correlation_tolerance: number;
  tilt_risk_score: number;
  hedging_tendency: number;
  high_volatility_tendency: number;
  over_under_bias: number;
  live_vs_pregame_ratio: number;
  best_performing_markets: string[];
  worst_performing_markets: string[];
  strongest_edge_zones: string[];
  weakest_leak_zones: string[];
  strongest_stat_types: string[];
  recurring_mistakes: string[];
  overexposure_habits: string[];
  strongest_slip_structures: string[];
  astro_weight_preference: number;
  favorite_astra_tone: string;
  profile_generated_at: string | null;
  games_analyzed: number;
  bets_analyzed: number;
}

/** Archetype display metadata */
export const ARCHETYPE_META: Record<string, { label: string; emoji: string; description: string }> = {
  sharp_conservative: { label: "Sharp Conservative", emoji: "🎯", description: "High-conviction, low-frequency. You wait for clear edges." },
  selective_hunter: { label: "Selective Hunter", emoji: "🏹", description: "Patient and disciplined. You pick your spots carefully." },
  aggressive_chaser: { label: "Aggressive Chaser", emoji: "🔥", description: "High volume, risk-tolerant. You chase action." },
  live_value_sniper: { label: "Live Value Sniper", emoji: "⚡", description: "You thrive in live markets finding in-game edges." },
  alt_line_safety_player: { label: "Alt-Line Safety Player", emoji: "🛡️", description: "You prefer safer alt lines with lower juice." },
  same_game_stacker: { label: "Same-Game Stacker", emoji: "📚", description: "You love correlated SGP plays." },
  high_volatility_hunter: { label: "High Volatility Hunter", emoji: "🎰", description: "You embrace variance for big payoffs." },
  astro_intuitive_sharp: { label: "Astro-Intuitive Sharp", emoji: "✨", description: "You blend cosmic signals with sharp analysis." },
};

/**
 * Hook to read/write the user's betting profile.
 */
export function useBettingProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-betting-profile", user?.id],
    queryFn: async (): Promise<UserBettingProfile | null> => {
      if (!user) return null;
      const { data } = await supabase
        .from("user_betting_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data as any) ?? null;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const generateProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      // Analyze user's bet history
      const { data: bets } = await supabase
        .from("bets")
        .select("market_type, selection, side, odds, result, stake_amount, payout, status, game_id, player_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);

      const { data: slips } = await supabase
        .from("bet_slips")
        .select("id, book, result, stake, payout, entry_type, source, status")
        .eq("user_id", user.id)
        .limit(200);

      const { data: picks } = await supabase
        .from("bet_slip_picks")
        .select("stat_type, direction, line, result, slip_id")
        .limit(1000);

      const allBets = bets || [];
      const allSlips = slips || [];
      const allPicks = picks || [];

      // Compute profile from history
      const totalBets = allBets.length;
      const wonBets = allBets.filter(b => b.result === "win").length;
      const lostBets = allBets.filter(b => b.result === "loss").length;

      // Market type analysis
      const marketCounts: Record<string, { total: number; wins: number }> = {};
      for (const b of allBets) {
        const mt = b.market_type || "unknown";
        if (!marketCounts[mt]) marketCounts[mt] = { total: 0, wins: 0 };
        marketCounts[mt].total++;
        if (b.result === "win") marketCounts[mt].wins++;
      }

      const marketEntries = Object.entries(marketCounts).sort((a, b) => b[1].total - a[1].total);
      const bestMarkets = marketEntries
        .filter(([, v]) => v.total >= 3 && v.wins / v.total > 0.55)
        .map(([k]) => k);
      const worstMarkets = marketEntries
        .filter(([, v]) => v.total >= 3 && v.wins / v.total < 0.4)
        .map(([k]) => k);

      // Over/under bias
      const overBets = allBets.filter(b => b.side === "over" || b.selection?.toLowerCase() === "over").length;
      const underBets = allBets.filter(b => b.side === "under" || b.selection?.toLowerCase() === "under").length;
      const ouTotal = overBets + underBets;
      const overUnderBias = ouTotal > 0 ? (overBets - underBets) / ouTotal : 0;

      // Stat type analysis from picks
      const statCounts: Record<string, number> = {};
      for (const p of allPicks) {
        const st = p.stat_type || "unknown";
        statCounts[st] = (statCounts[st] || 0) + 1;
      }
      const strongestStats = Object.entries(statCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k);

      // SGP tendency
      const sgpSlips = allSlips.filter(s => s.entry_type === "sgp" || s.source === "sgp").length;
      const sgpTendency = allSlips.length > 0 ? sgpSlips / allSlips.length : 0;

      // Volatility: analyze odds distribution
      const highOddsBets = allBets.filter(b => Math.abs(b.odds) >= 200).length;
      const volatilityTendency = totalBets > 0 ? highOddsBets / totalBets : 0;

      // Determine archetype
      let archetype = "selective_hunter";
      if (volatilityTendency > 0.5) archetype = "high_volatility_hunter";
      else if (sgpTendency > 0.4) archetype = "same_game_stacker";
      else if (totalBets > 100 && wonBets / Math.max(totalBets, 1) > 0.55) archetype = "sharp_conservative";
      else if (totalBets > 50 && volatilityTendency < 0.2) archetype = "alt_line_safety_player";

      // Risk tolerance
      const avgOdds = totalBets > 0
        ? allBets.reduce((s, b) => s + Math.abs(b.odds), 0) / totalBets
        : 0;
      const riskTolerance = avgOdds > 200 ? "aggressive" : avgOdds > 130 ? "moderate" : "conservative";

      // Slip size
      const slipPickCounts = allSlips.map(s => allPicks.filter(p => p.slip_id === s.id).length);
      const avgSlipSize = slipPickCounts.length > 0
        ? Math.round(slipPickCounts.reduce((a, b) => a + b, 0) / slipPickCounts.length)
        : 3;

      const profileData = {
        user_id: user.id,
        risk_tolerance: riskTolerance,
        betting_archetype: archetype,
        preferred_market_types: marketEntries.slice(0, 3).map(([k]) => k),
        preferred_slip_size: avgSlipSize,
        same_game_stack_tendency: Math.round(sgpTendency * 100) / 100,
        tilt_risk_score: 0, // TODO: compute from loss streaks
        high_volatility_tendency: Math.round(volatilityTendency * 100) / 100,
        over_under_bias: Math.round(overUnderBias * 100) / 100,
        best_performing_markets: bestMarkets,
        worst_performing_markets: worstMarkets,
        strongest_stat_types: strongestStats,
        profile_generated_at: new Date().toISOString(),
        games_analyzed: new Set(allBets.map(b => b.game_id)).size,
        bets_analyzed: totalBets,
        updated_at: new Date().toISOString(),
      };

      const { data: result, error } = await supabase
        .from("user_betting_profiles")
        .upsert(profileData as any, { onConflict: "user_id" })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-betting-profile"] });
    },
  });

  return {
    profile,
    isLoading,
    generateProfile: generateProfile.mutate,
    isGenerating: generateProfile.isPending,
    hasProfile: !!profile,
  };
}

/**
 * Compute a fit score (0-100) for a given recommendation against user profile.
 */
export function computeFitScore(
  profile: UserBettingProfile | null,
  marketType: string,
  statType?: string,
  odds?: number,
  isLive?: boolean,
): { score: number; label: string; note: string } {
  if (!profile) return { score: 50, label: "Unknown", note: "No profile available" };

  let score = 50;
  const notes: string[] = [];

  // Market type fit
  if (profile.best_performing_markets.includes(marketType)) {
    score += 20;
    notes.push("Strong market for you");
  } else if (profile.worst_performing_markets.includes(marketType)) {
    score -= 20;
    notes.push("Historically weak market");
  }

  // Stat type fit
  if (statType && profile.strongest_stat_types.includes(statType)) {
    score += 15;
    notes.push(`${statType} is your strongest stat`);
  }

  // Live vs pregame preference
  if (isLive && profile.live_vs_pregame_ratio > 0.6) {
    score += 10;
    notes.push("Fits your live preference");
  } else if (!isLive && profile.live_vs_pregame_ratio < 0.3) {
    score += 10;
    notes.push("Fits your pregame preference");
  }

  // Volatility alignment
  if (odds && Math.abs(odds) >= 200 && profile.high_volatility_tendency > 0.4) {
    score += 10;
    notes.push("Matches your volatility comfort");
  } else if (odds && Math.abs(odds) >= 200 && profile.high_volatility_tendency < 0.2) {
    score -= 10;
    notes.push("Higher volatility than your comfort zone");
  }

  score = Math.max(0, Math.min(100, score));
  const label = score >= 75 ? "Strong Fit" : score >= 55 ? "Good Fit" : score >= 40 ? "Moderate" : "Weak Fit";
  const note = notes.length > 0 ? notes[0] : "Standard profile match";

  return { score, label, note };
}
