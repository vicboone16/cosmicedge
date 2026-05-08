import { useState, useMemo } from "react";
import {
  Trophy, BarChart3, TrendingUp, CheckCircle, XCircle, MinusCircle,
  Target, Percent, Filter, ChevronRight, Flame, RefreshCw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from "recharts";
import type { Tables } from "@/integrations/supabase/types";
import { getOutcome, computePerformance, americanToDecimal, filterSettled } from "@/lib/betting-math";

type BetRow = Tables<"bets">;
type Tab = "results" | "analytics" | "trends";
type OutcomeFilter = "all" | "won" | "lost" | "push";
type DateFilter = "all" | "7d" | "30d" | "90d";

const PIE_COLORS = [
  "hsl(155, 55%, 45%)",
  "hsl(0, 65%, 55%)",
  "hsl(42, 80%, 60%)",
];

const MARKET_LABELS: Record<string, string> = {
  player_points: "Points", player_rebounds: "Rebounds", player_assists: "Assists",
  player_threes: "3PM", player_blocks: "Blocks", player_steals: "Steals",
  player_turnovers: "TOV", player_points_rebounds_assists: "PRA",
  player_points_rebounds: "Pts+Reb", player_points_assists: "Pts+Ast",
  player_rebounds_assists: "Reb+Ast", player_blocks_steals: "Blk+Stl",
  spread: "Spread", totals: "Totals", moneyline: "ML", h2h: "ML",
};
function humanizeMarket(key?: string | null) {
  if (!key) return "Other";
  return MARKET_LABELS[key] ?? key.replace("player_", "").replace(/_/g, "+");
}

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  fontSize: "11px",
  color: "hsl(var(--foreground))",
};

function StatChip({
  label, value, color = "text-foreground",
}: { label: string; value: string | number; color?: string }) {
  return (
    <div className="cosmic-card rounded-xl px-3 py-2.5 text-center min-w-0">
      <p className={cn("text-base font-bold tabular-nums font-display leading-none", color)}>{value}</p>
      <p className="text-[9px] text-muted-foreground mt-0.5 leading-none">{label}</p>
    </div>
  );
}

export default function PerformancePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("results");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  /* ── Single query for all bets ── */
  const { data: allBets = [], isLoading, refetch } = useQuery({
    queryKey: ["perf-bets", user?.id],
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
    staleTime: 60_000,
  });

  /* ── Filter helpers ── */
  const dateThreshold: Date | null = useMemo(() => {
    if (dateFilter === "7d") return startOfDay(subDays(new Date(), 7));
    if (dateFilter === "30d") return startOfDay(subDays(new Date(), 30));
    if (dateFilter === "90d") return startOfDay(subDays(new Date(), 90));
    return null;
  }, [dateFilter]);

  const filteredBets = useMemo(() => {
    return allBets.filter(b => {
      const outcome = getOutcome(b);
      const isSettled = outcome !== null;
      if (!isSettled) return false;
      if (outcomeFilter !== "all" && outcome !== outcomeFilter) return false;
      if (marketFilter !== "all" && (b.market_type || "other") !== marketFilter) return false;
      if (dateThreshold) {
        const at = b.settled_at ?? b.created_at;
        if (!at || new Date(at) < dateThreshold) return false;
      }
      return true;
    });
  }, [allBets, outcomeFilter, marketFilter, dateThreshold]);

  /* Market type options derived from data */
  const marketOptions = useMemo(() => {
    const types = new Set(filterSettled(allBets).map(b => b.market_type || "other"));
    return Array.from(types).sort();
  }, [allBets]);

  /* ── Global performance metrics (full settled data, no filter) ── */
  const settled = useMemo(() => filterSettled(allBets), [allBets]);
  const perf = useMemo(() => computePerformance(settled), [settled]);

  /* Hot streak: count of consecutive wins from most recent */
  const hotStreak = useMemo(() => {
    const sorted = [...settled].sort((a, b) =>
      new Date(b.settled_at ?? b.created_at ?? 0).getTime() -
      new Date(a.settled_at ?? a.created_at ?? 0).getTime()
    );
    let streak = 0;
    for (const b of sorted) {
      if (getOutcome(b) === "won") streak++;
      else break;
    }
    return streak;
  }, [settled]);

  /* ── Analytics derived data (from filtered bets) ── */
  const analyticsFiltered = useMemo(() => filteredBets, [filteredBets]);

  const won = analyticsFiltered.filter(b => getOutcome(b) === "won").length;
  const lost = analyticsFiltered.filter(b => getOutcome(b) === "lost").length;
  const pushed = analyticsFiltered.filter(b => getOutcome(b) === "push").length;

  const pieData = useMemo(() =>
    [{ name: "Won", value: won }, { name: "Lost", value: lost }, { name: "Push", value: pushed }]
      .filter(d => d.value > 0),
    [won, lost, pushed]);

  const marketChartData = useMemo(() => {
    const ms: Record<string, { won: number; total: number }> = {};
    analyticsFiltered.forEach(b => {
      const key = humanizeMarket(b.market_type);
      if (!ms[key]) ms[key] = { won: 0, total: 0 };
      ms[key].total++;
      if (getOutcome(b) === "won") ms[key].won++;
    });
    return Object.entries(ms)
      .map(([name, s]) => ({
        name: name.length > 8 ? name.slice(0, 7) + "…" : name,
        winRate: s.total > 0 ? Math.round((s.won / s.total) * 100) : 0,
        total: s.total,
      }))
      .sort((a, b) => b.winRate - a.winRate);
  }, [analyticsFiltered]);

  const roiData = useMemo(() => {
    const data: { bet: number; roi: number }[] = [];
    let cumStaked = 0;
    let cumReturn = 0;
    analyticsFiltered.forEach((b, i) => {
      const stake = b.stake_amount ?? (b as any).stake ?? 1;
      const outcome = getOutcome(b);
      cumStaked += stake;
      if (outcome === "won") cumReturn += b.payout ?? stake * americanToDecimal(b.odds);
      else if (outcome === "push") cumReturn += stake;
      data.push({ bet: i + 1, roi: cumStaked > 0 ? Math.round(((cumReturn - cumStaked) / cumStaked) * 100) : 0 });
    });
    return data;
  }, [analyticsFiltered]);

  /* ── Auth guard ── */
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-3">
        <Trophy className="h-10 w-10 text-cosmic-gold" />
        <p className="text-sm text-muted-foreground text-center">Sign in to track your performance.</p>
        <button onClick={() => navigate("/auth")} className="text-sm text-primary hover:underline font-medium">
          Sign In →
        </button>
      </div>
    );
  }

  const hasData = settled.length > 0;

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <header className="px-4 pt-12 pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight">Performance</h1>
            <p className="text-[11px] text-muted-foreground">Bet history, analytics &amp; trends</p>
          </div>
          <button
            onClick={() => refetch()}
            aria-label="Refresh data"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Key metrics banner */}
      {hasData && (
        <div className="px-4 pt-4 pb-2">
          <div className="grid grid-cols-4 gap-2">
            <StatChip label="Win %" value={perf.total > 0 ? `${perf.winRate.toFixed(0)}%` : "—"} color="text-primary" />
            <StatChip
              label="ROI"
              value={perf.total > 0 ? `${perf.roi >= 0 ? "+" : ""}${perf.roi.toFixed(1)}%` : "—"}
              color={perf.roi > 0 ? "text-cosmic-green" : perf.roi < 0 ? "text-cosmic-red" : "text-foreground"}
            />
            <StatChip label="Settled" value={perf.total} color="text-foreground" />
            <StatChip label="Streak 🔥" value={hotStreak > 0 ? `${hotStreak}W` : "—"} color="text-cosmic-gold" />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border/40">
          {(["results", "analytics", "trends"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all capitalize",
                tab === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "results" && "Results"}
              {t === "analytics" && "Analytics"}
              {t === "trends" && "Trends"}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <Filter className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />

        {/* Date filter */}
        {(["all", "7d", "30d", "90d"] as DateFilter[]).map(d => (
          <button
            key={d}
            onClick={() => setDateFilter(d)}
            className={cn(
              "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all",
              dateFilter === d
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {d === "all" ? "All time" : d}
          </button>
        ))}

        <div className="w-px h-3 bg-border/50 shrink-0" />

        {/* Outcome filter */}
        {(["all", "won", "lost", "push"] as OutcomeFilter[]).map(o => (
          <button
            key={o}
            onClick={() => setOutcomeFilter(o)}
            className={cn(
              "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all capitalize",
              outcomeFilter === o
                ? o === "won" ? "bg-cosmic-green/20 border-cosmic-green text-cosmic-green"
                  : o === "lost" ? "bg-cosmic-red/20 border-cosmic-red text-cosmic-red"
                  : o === "push" ? "bg-cosmic-gold/20 border-cosmic-gold text-cosmic-gold"
                  : "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {o === "all" ? "All" : o.charAt(0).toUpperCase() + o.slice(1)}
          </button>
        ))}

        {/* Market filter */}
        {marketOptions.length > 1 && (
          <>
            <div className="w-px h-3 bg-border/50 shrink-0" />
            <button
              onClick={() => setMarketFilter("all")}
              className={cn(
                "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all",
                marketFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground",
              )}
            >
              All markets
            </button>
            {marketOptions.map(m => (
              <button
                key={m}
                onClick={() => setMarketFilter(m)}
                className={cn(
                  "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all",
                  marketFilter === m
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-background border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {humanizeMarket(m)}
              </button>
            ))}
          </>
        )}
      </div>

      {/* ── Tab content ── */}
      <div className="px-4 pt-2 space-y-3">

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !hasData && (
          <div className="text-center py-16 space-y-3">
            <Trophy className="h-10 w-10 text-muted-foreground/20 mx-auto" />
            <p className="text-sm font-medium text-foreground">No settled bets yet</p>
            <p className="text-xs text-muted-foreground">Head to SkySpread to track your first bet.</p>
            <button
              onClick={() => navigate("/skyspread")}
              className="text-sm text-primary hover:underline font-medium"
            >
              Open SkySpread →
            </button>
          </div>
        )}

        {/* ─────────── RESULTS TAB ─────────── */}
        {!isLoading && tab === "results" && hasData && (
          <>
            {filteredBets.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">No bets match current filters</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Filtered summary */}
                {(outcomeFilter !== "all" || marketFilter !== "all" || dateFilter !== "all") && (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
                    <span className="font-semibold text-foreground">{filteredBets.length}</span> bets matched ·
                    <span className={cn(
                      "font-semibold",
                      won > lost ? "text-cosmic-green" : won < lost ? "text-cosmic-red" : "text-muted-foreground"
                    )}>{won}W {lost}L {pushed}P</span>
                  </div>
                )}

                {[...filteredBets]
                  .sort((a, b) =>
                    new Date(b.settled_at ?? b.created_at ?? 0).getTime() -
                    new Date(a.settled_at ?? a.created_at ?? 0).getTime()
                  )
                  .map(bet => {
                    const outcome = getOutcome(bet) ?? "push";
                    const icons = { won: CheckCircle, lost: XCircle, push: MinusCircle };
                    const colors = { won: "text-cosmic-green", lost: "text-cosmic-red", push: "text-cosmic-gold" };
                    const ResultIcon = icons[outcome as keyof typeof icons] ?? MinusCircle;
                    const resultColor = colors[outcome as keyof typeof colors] ?? "text-muted-foreground";

                    return (
                      <div key={bet.id} className="cosmic-card rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-xs font-semibold text-foreground truncate flex-1 leading-snug">
                            {bet.away_team && bet.home_team
                              ? `${bet.away_team} @ ${bet.home_team}`
                              : (bet.selection || "—")}
                          </p>
                          <div className={cn("flex items-center gap-1 shrink-0", resultColor)}>
                            <ResultIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="text-[10px] font-bold uppercase">{outcome}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                          <span className="font-medium text-primary/80">{humanizeMarket(bet.market_type)}</span>
                          {bet.selection && (
                            <span className="truncate max-w-[140px]">{bet.selection}</span>
                          )}
                          {bet.odds != null && (
                            <span className="tabular-nums">{bet.odds > 0 ? "+" : ""}{bet.odds}</span>
                          )}
                          {bet.stake_amount != null && (
                            <span>Stake: {bet.stake_amount}{bet.stake_unit ? ` ${bet.stake_unit}` : ""}</span>
                          )}
                          {outcome === "won" && bet.payout != null && (
                            <span className="text-cosmic-green font-semibold">
                              +{bet.payout}
                            </span>
                          )}
                          {(bet.settled_at ?? bet.created_at) && (
                            <span>{format(new Date((bet.settled_at ?? bet.created_at)!), "MMM d")}</span>
                          )}
                        </div>
                        {bet.result_notes && (
                          <p className="text-[10px] text-muted-foreground italic mt-1.5 line-clamp-2">
                            "{bet.result_notes}"
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}

        {/* ─────────── ANALYTICS TAB ─────────── */}
        {!isLoading && tab === "analytics" && hasData && (
          <>
            {filteredBets.length < 2 ? (
              <div className="text-center py-12">
                <BarChart3 className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Not enough data with current filters</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Win/Loss pie */}
                <section className="cosmic-card rounded-xl p-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3 flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" aria-hidden="true" />
                    Distribution ({filteredBets.length} bets)
                  </h3>
                  <div className="h-44">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%" cy="50%"
                          innerRadius={46} outerRadius={70}
                          dataKey="value"
                          paddingAngle={4}
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-4 mt-1">
                    {pieData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i] }} />
                        <span className="text-[10px] text-muted-foreground">{d.name}: {d.value}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Win rate by market */}
                {marketChartData.length > 0 && (
                  <section className="cosmic-card rounded-xl p-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3 flex items-center gap-1.5">
                      <Percent className="h-3.5 w-3.5" aria-hidden="true" />
                      Win Rate by Market
                    </h3>
                    <div className="h-44">
                      <ResponsiveContainer>
                        <BarChart data={marketChartData} margin={{ left: -16 }}>
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} domain={[0, 100]} />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(v, _, p) => [`${v}% (${p.payload.total} bets)`, "Win Rate"]}
                          />
                          <Bar dataKey="winRate" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}

                {/* Cumulative ROI line */}
                {roiData.length > 2 && (
                  <section className="cosmic-card rounded-xl p-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                      Cumulative ROI
                    </h3>
                    <div className="h-44">
                      <ResponsiveContainer>
                        <LineChart data={roiData} margin={{ left: -16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="bet" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v}%`, "ROI"]} />
                          <Line
                            type="monotone"
                            dataKey="roi"
                            stroke="hsl(var(--cosmic-cyan))"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}

                {/* Breakdown table by market */}
                <section className="cosmic-card rounded-xl p-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">
                    Market Breakdown
                  </h3>
                  <div className="space-y-2">
                    {marketChartData.slice(0, 8).map(m => (
                      <div key={m.name} className="flex items-center gap-3">
                        <span className="text-[10px] font-medium text-foreground w-16 truncate">{m.name}</span>
                        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${m.winRate}%` }}
                          />
                        </div>
                        <span className={cn(
                          "text-[10px] font-bold tabular-nums w-16 text-right",
                          m.winRate >= 60 ? "text-cosmic-green" : m.winRate >= 50 ? "text-foreground" : "text-cosmic-red"
                        )}>
                          {m.winRate}% ({m.total})
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </>
        )}

        {/* ─────────── TRENDS TAB ─────────── */}
        {!isLoading && tab === "trends" && (
          <div className="space-y-3">
            {/* Quick summary cards using filtered data */}
            {hasData && filteredBets.length > 0 && (
              <>
                <div className="cosmic-card rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Flame className="h-4 w-4 text-cosmic-gold" aria-hidden="true" />
                    <h3 className="text-xs font-bold text-foreground">Current Streak</h3>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={cn(
                      "text-3xl font-black font-display tabular-nums",
                      hotStreak >= 3 ? "text-cosmic-gold" : hotStreak > 0 ? "text-cosmic-green" : "text-muted-foreground"
                    )}>
                      {hotStreak > 0 ? `${hotStreak}` : "—"}
                    </span>
                    {hotStreak > 0 && (
                      <span className="text-sm text-muted-foreground">consecutive wins</span>
                    )}
                  </div>
                  {hotStreak === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">No active winning streak</p>
                  )}
                </div>

                {/* Best market */}
                {marketChartData.length > 0 && (
                  <div className="cosmic-card rounded-xl p-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">
                      Best Performing Markets
                    </h3>
                    <div className="space-y-2">
                      {marketChartData
                        .filter(m => m.total >= 2)
                        .slice(0, 4)
                        .map((m, i) => (
                          <div key={m.name} className="flex items-center gap-3">
                            <span className={cn(
                              "text-[10px] font-black w-4 text-center",
                              i === 0 ? "text-cosmic-gold" : i === 1 ? "text-muted-foreground" : "text-[#cd7f32]"
                            )}>#{i + 1}</span>
                            <span className="text-[10px] font-medium text-foreground flex-1">{m.name}</span>
                            <span className={cn(
                              "text-[10px] font-bold tabular-nums",
                              m.winRate >= 60 ? "text-cosmic-green" : m.winRate >= 50 ? "text-foreground" : "text-cosmic-red"
                            )}>{m.winRate}%</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Link to full Trends page */}
            <button
              onClick={() => navigate("/trends")}
              className="w-full cosmic-card rounded-xl p-4 flex items-center justify-between hover:border-primary/30 transition-all text-left"
            >
              <div>
                <p className="text-xs font-bold text-foreground">Player Prop Trends</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Browse player streaks, edges &amp; insights</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            </button>

            {!hasData && (
              <div className="text-center py-12">
                <TrendingUp className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Settle bets to see trends</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
