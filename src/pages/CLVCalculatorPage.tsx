import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { TrendingUp, TrendingDown, BarChart3, Star } from "lucide-react";
import { getPlanetaryHourAt } from "@/lib/planetary-hours";

function impliedProb(americanOdds: number): number {
  if (americanOdds > 0) return 100 / (americanOdds + 100);
  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export default function CLVCalculatorPage() {
  const { user } = useAuth();

  const { data: bets, isLoading: betsLoading } = useQuery({
    queryKey: ["clv-bets", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("bets")
        .select("*, games(start_time, home_abbr, away_abbr, venue_lat, league)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: historicalOdds } = useQuery({
    queryKey: ["clv-historical"],
    queryFn: async () => {
      const gameIds = (bets || []).map(b => b.game_id).filter(Boolean);
      if (gameIds.length === 0) return [];
      const { data } = await supabase
        .from("historical_odds")
        .select("*")
        .in("game_id", gameIds);
      return data || [];
    },
    enabled: !!(bets && bets.length > 0),
  });

  const clvData = useMemo(() => {
    if (!bets?.length) return [];
    const histMap = new Map<string, any[]>();
    for (const ho of historicalOdds || []) {
      const key = `${ho.game_id}_${ho.market_type}`;
      if (!histMap.has(key)) histMap.set(key, []);
      histMap.get(key)!.push(ho);
    }

    return bets.map((bet: any) => {
      const key = `${bet.game_id}_${bet.market_type}`;
      const closingOdds = histMap.get(key);
      let clv: number | null = null;

      if (closingOdds?.length) {
        // Average closing line
        const prices = closingOdds
          .map((c: any) => bet.side === "home" ? c.home_price : c.away_price)
          .filter((p: any) => p != null);
        if (prices.length > 0) {
          const avgClosing = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
          const betImplied = impliedProb(bet.odds);
          const closingImplied = impliedProb(avgClosing);
          clv = ((closingImplied - betImplied) / betImplied) * 100;
        }
      }

      // Planetary hour at game time
      const gameTime = bet.games?.start_time ? new Date(bet.games.start_time) : null;
      const planetaryHour = gameTime ? getPlanetaryHourAt(gameTime, bet.games?.venue_lat || 40.7) : null;

      return { ...bet, clv, planetaryHour };
    });
  }, [bets, historicalOdds]);

  const stats = useMemo(() => {
    const withCLV = clvData.filter(d => d.clv != null);
    if (withCLV.length === 0) return null;
    const totalCLV = withCLV.reduce((s, d) => s + d.clv!, 0);
    const avgCLV = totalCLV / withCLV.length;
    const positive = withCLV.filter(d => d.clv! > 0).length;

    // By league
    const byLeague = new Map<string, { sum: number; count: number }>();
    for (const d of withCLV) {
      const lg = d.sport || d.games?.league || "Unknown";
      const entry = byLeague.get(lg) || { sum: 0, count: 0 };
      entry.sum += d.clv!;
      entry.count++;
      byLeague.set(lg, entry);
    }

    // By planetary hour
    const byHour = new Map<string, { sum: number; count: number }>();
    for (const d of withCLV) {
      const planet = d.planetaryHour?.planet || "Unknown";
      const entry = byHour.get(planet) || { sum: 0, count: 0 };
      entry.sum += d.clv!;
      entry.count++;
      byHour.set(planet, entry);
    }

    return { avgCLV, positive, total: withCLV.length, byLeague, byHour };
  }, [clvData]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="cosmic-card rounded-xl p-8 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium">Sign in to view your CLV analysis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <h1 className="text-lg font-bold font-display flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          CLV Calculator
        </h1>
        <p className="text-[10px] text-muted-foreground">
          Compare your bets against closing lines with astrological context
        </p>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Aggregate Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-2">
            <div className="cosmic-card rounded-xl p-3 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Avg CLV</p>
              <p className={`text-lg font-bold font-display ${stats.avgCLV >= 0 ? "text-cosmic-green" : "text-destructive"}`}>
                {stats.avgCLV >= 0 ? "+" : ""}{stats.avgCLV.toFixed(1)}%
              </p>
            </div>
            <div className="cosmic-card rounded-xl p-3 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Beat Close</p>
              <p className="text-lg font-bold font-display text-foreground">
                {stats.positive}/{stats.total}
              </p>
            </div>
            <div className="cosmic-card rounded-xl p-3 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Win Rate</p>
              <p className="text-lg font-bold font-display text-foreground">
                {Math.round((stats.positive / stats.total) * 100)}%
              </p>
            </div>
          </div>
        )}

        {/* CLV by Planetary Hour */}
        {stats?.byHour && stats.byHour.size > 0 && (
          <section className="cosmic-card rounded-xl p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5" />
              CLV by Planetary Hour
            </h3>
            <div className="space-y-1.5">
              {Array.from(stats.byHour.entries()).map(([planet, d]) => (
                <div key={planet} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                  <span className="text-muted-foreground">{planet}</span>
                  <span className={`font-medium tabular-nums ${d.sum / d.count >= 0 ? "text-cosmic-green" : "text-destructive"}`}>
                    {(d.sum / d.count).toFixed(1)}% ({d.count})
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CLV by League */}
        {stats?.byLeague && stats.byLeague.size > 0 && (
          <section className="cosmic-card rounded-xl p-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">
              CLV by League
            </h3>
            <div className="space-y-1.5">
              {Array.from(stats.byLeague.entries()).map(([lg, d]) => (
                <div key={lg} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                  <span className="text-muted-foreground">{lg}</span>
                  <span className={`font-medium tabular-nums ${d.sum / d.count >= 0 ? "text-cosmic-green" : "text-destructive"}`}>
                    {(d.sum / d.count).toFixed(1)}% ({d.count})
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Individual Bets */}
        <section>
          <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">
            Bet-Level CLV
          </h3>
          {betsLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
          ) : clvData.length === 0 ? (
            <div className="cosmic-card rounded-xl p-8 text-center">
              <p className="text-xs text-muted-foreground">No bets found. Place bets in SkySpread to track CLV.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {clvData.slice(0, 50).map((d: any) => (
                <div key={d.id} className="cosmic-card rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-foreground">
                      {d.selection} — {d.market_type}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {formatOdds(d.odds)}
                      {d.planetaryHour && ` · ${d.planetaryHour.symbol} ${d.planetaryHour.planet} hour`}
                    </p>
                  </div>
                  <div className="text-right">
                    {d.clv != null ? (
                      <div className="flex items-center gap-1">
                        {d.clv >= 0 ? (
                          <TrendingUp className="h-3 w-3 text-cosmic-green" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-destructive" />
                        )}
                        <span className={`text-xs font-bold tabular-nums ${d.clv >= 0 ? "text-cosmic-green" : "text-destructive"}`}>
                          {d.clv >= 0 ? "+" : ""}{d.clv.toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">No close</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
