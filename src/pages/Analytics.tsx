import { BarChart3, TrendingUp, Target, Percent } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";
import type { Tables } from "@/integrations/supabase/types";
import { getOutcome, americanToDecimal, filterSettled } from "@/lib/betting-math";

type BetRow = Tables<"bets">;

const PIE_COLORS = ["hsl(155, 55%, 40%)", "hsl(0, 65%, 50%)", "hsl(42, 80%, 55%)"];

const Analytics = () => {
  const { user } = useAuth();

  const { data: bets, isLoading } = useQuery({
    queryKey: ["analytics-bets", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("bets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as BetRow[];
    },
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <BarChart3 className="h-8 w-8 text-cosmic-cyan mb-3" />
        <p className="text-sm text-muted-foreground">Please log in to view analytics.</p>
      </div>
    );
  }

  const settled = filterSettled(bets || []);
  const won = settled.filter(b => getOutcome(b) === "won").length;
  const lost = settled.filter(b => getOutcome(b) === "lost").length;
  const pushed = settled.filter(b => getOutcome(b) === "push").length;
  const totalSettled = won + lost + pushed;

  // Win rate by market type
  const marketStats: Record<string, { won: number; lost: number; total: number }> = {};
  settled.forEach(b => {
    const key = b.market_type || "other";
    const outcome = getOutcome(b);
    if (!marketStats[key]) marketStats[key] = { won: 0, lost: 0, total: 0 };
    marketStats[key].total++;
    if (outcome === "won") marketStats[key].won++;
    if (outcome === "lost") marketStats[key].lost++;
  });
  const marketChartData = Object.entries(marketStats).map(([name, s]) => ({
    name: name.length > 8 ? name.slice(0, 8) + "…" : name,
    winRate: s.total > 0 ? Math.round((s.won / (s.won + s.lost || 1)) * 100) : 0,
    total: s.total,
  }));

  // Pie chart data
  const pieData = [
    { name: "Won", value: won },
    { name: "Lost", value: lost },
    { name: "Push", value: pushed },
  ].filter(d => d.value > 0);

  // Cumulative ROI over time — using shared canonical helpers
  const roiData: { bet: number; roi: number }[] = [];
  let cumStaked = 0;
  let cumReturn = 0;
  settled.forEach((b, i) => {
    const stake = b.stake_amount ?? b.stake ?? 1;
    const outcome = getOutcome(b);
    cumStaked += stake;
    if (outcome === "won") cumReturn += b.payout ?? stake * americanToDecimal(b.odds);
    else if (outcome === "push") cumReturn += stake;
    roiData.push({ bet: i + 1, roi: cumStaked > 0 ? Math.round(((cumReturn - cumStaked) / cumStaked) * 100) : 0 });
  });

  // Calibration: group by confidence bucket, check actual win rate
  const calibrationData: { bucket: string; predicted: number; actual: number }[] = [];
  const buckets = [
    { min: 0, max: 30, label: "0-30" },
    { min: 30, max: 50, label: "30-50" },
    { min: 50, max: 70, label: "50-70" },
    { min: 70, max: 85, label: "70-85" },
    { min: 85, max: 101, label: "85+" },
  ];
  buckets.forEach(({ min, max, label }) => {
    const inBucket = settled.filter(b => (b.confidence ?? 50) >= min && (b.confidence ?? 50) < max);
    if (inBucket.length >= 1) {
      const wins = inBucket.filter(b => getOutcome(b) === "won").length;
      const decisions = inBucket.filter(b => getOutcome(b) !== "push").length;
      calibrationData.push({
        bucket: label,
        predicted: Math.round((min + max) / 2),
        actual: decisions > 0 ? Math.round((wins / decisions) * 100) : 0,
      });
    }
  });

  // Edge tier performance
  const tierStats: Record<string, { won: number; total: number }> = {};
  settled.forEach(b => {
    const tier = b.edge_tier || "none";
    if (!tierStats[tier]) tierStats[tier] = { won: 0, total: 0 };
    tierStats[tier].total++;
    if (b.status === "won") tierStats[tier].won++;
  });

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-5 w-5 text-cosmic-cyan" />
          <h1 className="text-xl font-bold font-display tracking-tight">Analytics</h1>
        </div>
        <p className="text-xs text-muted-foreground">Performance metrics & calibration</p>
      </header>

      <div className="px-4 py-4 space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Loading analytics...</p>}

        {!isLoading && totalSettled === 0 && (
          <div className="text-center py-12">
            <BarChart3 className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No settled bets to analyze</p>
          </div>
        )}

        {!isLoading && totalSettled > 0 && (
          <>
            {/* W/L Pie */}
            <section className="cosmic-card rounded-xl p-4">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" />
                Win/Loss Distribution
              </h3>
              <div className="h-48">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-2">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i] }} />
                    <span className="text-[10px] text-muted-foreground">{d.name}: {d.value}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Win Rate by Market */}
            {marketChartData.length > 0 && (
              <section className="cosmic-card rounded-xl p-4">
                <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5" />
                  Win Rate by Market
                </h3>
                <div className="h-48">
                  <ResponsiveContainer>
                    <BarChart data={marketChartData}>
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "11px" }} />
                      <Bar dataKey="winRate" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* Cumulative ROI */}
            {roiData.length > 2 && (
              <section className="cosmic-card rounded-xl p-4">
                <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Cumulative ROI
                </h3>
                <div className="h-48">
                  <ResponsiveContainer>
                    <LineChart data={roiData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="bet" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "11px" }} />
                      <Line type="monotone" dataKey="roi" stroke="hsl(var(--cosmic-cyan))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* Calibration */}
            {calibrationData.length > 1 && (
              <section className="cosmic-card rounded-xl p-4">
                <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">
                  Calibration Curve
                </h3>
                <div className="h-48">
                  <ResponsiveContainer>
                    <BarChart data={calibrationData}>
                      <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "11px" }} />
                      <Bar dataKey="predicted" fill="hsl(var(--cosmic-lavender))" radius={[4, 4, 0, 0]} name="Predicted" />
                      <Bar dataKey="actual" fill="hsl(var(--cosmic-green))" radius={[4, 4, 0, 0]} name="Actual" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[9px] text-muted-foreground mt-2 italic text-center">
                  A well-calibrated model has actual win rates matching predicted confidence levels.
                </p>
              </section>
            )}

            {/* Edge Tier Performance */}
            <section className="cosmic-card rounded-xl p-4">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">
                Edge Tier Performance
              </h3>
              <div className="space-y-2">
                {Object.entries(tierStats).map(([tier, s]) => {
                  const rate = s.total > 0 ? Math.round((s.won / s.total) * 100) : 0;
                  return (
                    <div key={tier} className="flex items-center gap-3">
                      <span className={cn(
                        "text-[10px] font-semibold uppercase w-12",
                        tier === "elite" ? "text-cosmic-gold" : tier === "high" ? "text-cosmic-green" : tier === "medium" ? "text-cosmic-cyan" : "text-muted-foreground"
                      )}>{tier}</span>
                      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${rate}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-12 text-right">{rate}% ({s.total})</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default Analytics;
