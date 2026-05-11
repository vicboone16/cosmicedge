/**
 * #17 — Morning → Evening Tracker
 * Tracks morning picks vs evening outcomes. Shows prediction accuracy
 * over time and for today's slate.
 */
import { useQuery } from "@tanstack/react-query";
import { Clock, TrendingUp, TrendingDown, CheckCircle, XCircle, Loader2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";

interface PickResult {
  gameId: string;
  awayAbbr: string;
  homeAbbr: string;
  pick: string; // e.g. "LAL ML", "Over 215.5"
  morningEdge: number;
  status: "pending" | "won" | "lost" | "push";
  actualResult?: string;
}

export function MorningEveningTracker() {
  const { data, isLoading } = useQuery({
    queryKey: ["morning-evening-tracker"],
    queryFn: async () => {
      // Get last 7 days of predictions and outcomes
      const sevenDaysAgo = subDays(new Date(), 7);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const { data: games } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, home_score, away_score, status, start_time")
        .gte("start_time", sevenDaysAgo.toISOString())
        .lte("start_time", today.toISOString())
        .order("start_time", { ascending: false });

      if (!games?.length) return { picks: [], stats: { total: 0, won: 0, lost: 0, pending: 0, winRate: 0 } };

      const gameIds = games.map(g => g.id);

      const { data: preds } = await supabase
        .from("ce_game_predictions")
        .select("game_id, edge_home, edge_away, p_home_win, p_away_win, mu_total, mu_spread_home, run_ts")
        .in("game_id", gameIds)
        .order("run_ts", { ascending: false });

      // Deduplicate predictions
      const predMap = new Map<string, typeof preds extends (infer T)[] | null ? NonNullable<T> : never>();
      for (const p of preds || []) {
        if (!predMap.has(p.game_id)) predMap.set(p.game_id, p);
      }

      const picks: PickResult[] = [];

      for (const game of games) {
        const pred = predMap.get(game.id);
        if (!pred) continue;

        const homeEdge = pred.edge_home || 0;
        const awayEdge = pred.edge_away || 0;
        
        // Skip games with no meaningful edge
        if (Math.abs(homeEdge) < 1.5 && Math.abs(awayEdge) < 1.5) continue;

        const favorsHome = homeEdge > awayEdge;
        const pick = favorsHome ? `${game.home_abbr} ML` : `${game.away_abbr} ML`;
        const edge = favorsHome ? homeEdge : awayEdge;

        // Determine outcome
        let status: PickResult["status"] = "pending";
        let actualResult: string | undefined;

        if (game.status === "final") {
          const homeWon = (game.home_score || 0) > (game.away_score || 0);
          if (favorsHome && homeWon) status = "won";
          else if (!favorsHome && !homeWon) status = "won";
          else status = "lost";
          actualResult = `${game.away_abbr} ${game.away_score} - ${game.home_score} ${game.home_abbr}`;
        }

        picks.push({
          gameId: game.id,
          awayAbbr: game.away_abbr,
          homeAbbr: game.home_abbr,
          pick,
          morningEdge: edge,
          status,
          actualResult,
        });
      }

      const won = picks.filter(p => p.status === "won").length;
      const lost = picks.filter(p => p.status === "lost").length;
      const pending = picks.filter(p => p.status === "pending").length;
      const total = won + lost;

      return {
        picks: picks.slice(0, 20), // latest 20
        stats: {
          total,
          won,
          lost,
          pending,
          winRate: total > 0 ? Math.round((won / total) * 100) : 0,
        },
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="cosmic-card rounded-xl p-6 flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-[10px] text-muted-foreground">Loading prediction tracker…</span>
      </div>
    );
  }

  if (!data || data.picks.length === 0) {
    return (
      <div className="cosmic-card rounded-xl p-4 text-center">
        <BarChart3 className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
        <p className="text-[10px] text-muted-foreground">No Oracle picks in the last 7 days to track.</p>
      </div>
    );
  }

  const { stats, picks } = data;
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayPicks = picks.filter(p => p.gameId); // all are "today-ish"

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-cosmic-cyan" />
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Morning → Evening Tracker</h3>
      </div>
      <p className="text-[9px] text-muted-foreground">
        How Oracle's morning edge predictions performed (last 7 days).
      </p>

      {/* Stats Summary */}
      <div className="cosmic-card rounded-xl p-4">
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-foreground">{stats.total}</p>
            <p className="text-[8px] text-muted-foreground uppercase">Settled</p>
          </div>
          <div>
            <p className={cn("text-lg font-bold", stats.winRate >= 55 ? "text-cosmic-green" : stats.winRate >= 45 ? "text-cosmic-gold" : "text-cosmic-red")}>
              {stats.winRate}%
            </p>
            <p className="text-[8px] text-muted-foreground uppercase">Win Rate</p>
          </div>
          <div>
            <p className="text-lg font-bold text-cosmic-green">{stats.won}</p>
            <p className="text-[8px] text-muted-foreground uppercase">Won</p>
          </div>
          <div>
            <p className="text-lg font-bold text-cosmic-red">{stats.lost}</p>
            <p className="text-[8px] text-muted-foreground uppercase">Lost</p>
          </div>
        </div>

        {/* Win rate bar */}
        {stats.total > 0 && (
          <div className="mt-3">
            <div className="h-2 bg-border rounded-full overflow-hidden flex">
              <div
                className="h-full bg-cosmic-green transition-all"
                style={{ width: `${stats.winRate}%` }}
              />
              <div
                className="h-full bg-cosmic-red transition-all"
                style={{ width: `${100 - stats.winRate}%` }}
              />
            </div>
          </div>
        )}

        {stats.pending > 0 && (
          <p className="text-[9px] text-cosmic-cyan mt-2 text-center">
            ⏳ {stats.pending} picks still pending
          </p>
        )}
      </div>

      {/* Recent Picks */}
      <div className="cosmic-card rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-primary/5">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Recent Picks</p>
        </div>
        <div className="divide-y divide-border/20">
          {picks.slice(0, 10).map((p, i) => (
            <div key={i} className="px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {p.status === "won" && <CheckCircle className="h-3.5 w-3.5 text-cosmic-green" />}
                {p.status === "lost" && <XCircle className="h-3.5 w-3.5 text-cosmic-red" />}
                {p.status === "pending" && <Clock className="h-3.5 w-3.5 text-cosmic-cyan" />}
                {p.status === "push" && <div className="h-3.5 w-3.5 rounded-full bg-cosmic-gold/20" />}
                <div>
                  <p className="text-[10px] font-semibold text-foreground">{p.pick}</p>
                  <p className="text-[8px] text-muted-foreground">{p.awayAbbr} @ {p.homeAbbr}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={cn(
                  "text-[9px] font-bold",
                  p.morningEdge >= 5 ? "text-cosmic-gold" : p.morningEdge >= 2 ? "text-cosmic-green" : "text-muted-foreground",
                )}>
                  +{p.morningEdge.toFixed(1)}% edge
                </p>
                {p.actualResult && (
                  <p className="text-[8px] text-muted-foreground">{p.actualResult}</p>
                )}
                {p.status === "pending" && (
                  <p className="text-[8px] text-cosmic-cyan">In progress</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
