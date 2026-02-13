import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { History, TrendingUp, TrendingDown, ArrowUpDown, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface HistoricalOddsRow {
  id: string;
  game_id: string | null;
  external_event_id: string | null;
  league: string;
  home_team: string;
  away_team: string;
  start_time: string;
  market_type: string;
  bookmaker: string;
  home_price: number | null;
  away_price: number | null;
  line: number | null;
  snapshot_date: string;
  captured_at: string;
}

interface OddsSnapshot {
  id: string;
  game_id: string;
  bookmaker: string;
  market_type: string;
  home_price: number | null;
  away_price: number | null;
  line: number | null;
  captured_at: string;
}

function formatPrice(p: number | null): string {
  if (p == null) return "—";
  return p > 0 ? `+${p}` : `${p}`;
}

export default function HistoricalOddsPage() {
  const [league, setLeague] = useState("NBA");
  const [selectedDate, setSelectedDate] = useState(subDays(new Date(), 1));
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [marketType, setMarketType] = useState("moneyline");

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Fetch historical odds for the selected date
  const { data: historicalOdds, isLoading: histLoading, refetch, isFetching } = useQuery({
    queryKey: ["historical-odds", league, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historical_odds")
        .select("*")
        .eq("league", league)
        .eq("snapshot_date", dateStr)
        .order("home_team")
        .order("market_type");
      if (error) throw error;
      return (data || []) as HistoricalOddsRow[];
    },
  });

  // Fetch live odds snapshots for line movement chart
  const { data: liveSnapshots } = useQuery({
    queryKey: ["odds-snapshots", selectedGameId, marketType],
    queryFn: async () => {
      if (!selectedGameId) return [];
      const { data, error } = await supabase
        .from("odds_snapshots")
        .select("*")
        .eq("game_id", selectedGameId)
        .eq("market_type", marketType)
        .order("captured_at", { ascending: true });
      if (error) throw error;
      return (data || []) as OddsSnapshot[];
    },
    enabled: !!selectedGameId,
  });

  // Group historical odds by matchup
  const matchups = useMemo(() => {
    const map = new Map<string, HistoricalOddsRow[]>();
    for (const row of historicalOdds || []) {
      const key = `${row.home_team} vs ${row.away_team}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return map;
  }, [historicalOdds]);

  // Get consensus (average) closing line for each matchup
  const closingLines = useMemo(() => {
    const results: {
      key: string;
      homeTeam: string;
      awayTeam: string;
      gameId: string | null;
      moneyline: { home: number | null; away: number | null };
      spread: { line: number | null; home: number | null; away: number | null };
      total: { line: number | null; over: number | null; under: number | null };
      bookmakerCount: number;
    }[] = [];

    for (const [key, rows] of matchups) {
      const ml = rows.filter(r => r.market_type === "moneyline");
      const sp = rows.filter(r => r.market_type === "spread");
      const tot = rows.filter(r => r.market_type === "total");

      const avg = (arr: (number | null)[]) => {
        const valid = arr.filter((v): v is number => v != null);
        return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
      };

      results.push({
        key,
        homeTeam: rows[0].home_team,
        awayTeam: rows[0].away_team,
        gameId: rows[0].game_id,
        moneyline: {
          home: avg(ml.map(r => r.home_price)),
          away: avg(ml.map(r => r.away_price)),
        },
        spread: {
          line: avg(sp.map(r => r.line)),
          home: avg(sp.map(r => r.home_price)),
          away: avg(sp.map(r => r.away_price)),
        },
        total: {
          line: avg(tot.map(r => r.line)),
          over: avg(tot.map(r => r.home_price)),
          under: avg(tot.map(r => r.away_price)),
        },
        bookmakerCount: new Set(rows.map(r => r.bookmaker)).size,
      });
    }
    return results;
  }, [matchups]);

  // Line movement chart data
  const chartData = useMemo(() => {
    if (!liveSnapshots?.length) return [];
    // Dedupe by bookmaker+time, show consensus movement
    const timeMap = new Map<string, { prices: number[]; lines: number[] }>();
    for (const snap of liveSnapshots) {
      const t = new Date(snap.captured_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (!timeMap.has(t)) timeMap.set(t, { prices: [], lines: [] });
      const entry = timeMap.get(t)!;
      if (snap.home_price != null) entry.prices.push(snap.home_price);
      if (snap.line != null) entry.lines.push(snap.line);
    }
    return Array.from(timeMap.entries()).map(([time, data]) => ({
      time,
      price: data.prices.length > 0 ? Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length) : null,
      line: data.lines.length > 0 ? +(data.lines.reduce((a, b) => a + b, 0) / data.lines.length).toFixed(1) : null,
    }));
  }, [liveSnapshots]);

  const handleFetchHistorical = async () => {
    try {
      const isoDate = `${dateStr}T12:00:00Z`;
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-historical-odds?league=${league}&date=${isoDate}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
    } catch (e) {
      console.warn("Historical fetch error:", e);
    }
    refetch();
  };

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-bold font-display flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Historical Odds
          </h1>
          <button
            onClick={handleFetchHistorical}
            disabled={isFetching}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            Fetch
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          Line movement trends &amp; closing line value for backtesting
        </p>

        {/* Date nav */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setSelectedDate(d => subDays(d, 1))} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs text-muted-foreground">{format(selectedDate, "EEE, MMM d yyyy")}</span>
          <button onClick={() => setSelectedDate(d => addDays(d, 1))} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* League chips */}
        <div className="flex gap-1.5 mb-3">
          {["NBA", "NHL", "MLB", "NFL"].map((lg) => (
            <button
              key={lg}
              onClick={() => { setLeague(lg); setSelectedGameId(null); }}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                league === lg
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {lg}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Closing Lines Summary */}
        {histLoading ? (
          <div className="cosmic-card rounded-xl p-8 text-center">
            <p className="text-xs text-muted-foreground">Loading historical odds...</p>
          </div>
        ) : closingLines.length === 0 ? (
          <div className="cosmic-card rounded-xl p-8 text-center space-y-3">
            <History className="h-8 w-8 text-muted-foreground/30 mx-auto" />
            <p className="text-sm font-medium text-foreground">No historical data for this date</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Click "Fetch" to pull historical odds from the API for {format(selectedDate, "MMM d, yyyy")}.
            </p>
          </div>
        ) : (
          <>
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-widest flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                Closing Lines — {format(selectedDate, "MMM d")}
              </h3>
              {closingLines.map((cl) => (
                <button
                  key={cl.key}
                  onClick={() => setSelectedGameId(cl.gameId)}
                  className={`cosmic-card rounded-xl p-3 w-full text-left transition-colors ${
                    selectedGameId === cl.gameId ? "ring-1 ring-primary" : "hover:bg-secondary/20"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-foreground">{cl.awayTeam} @ {cl.homeTeam}</p>
                    <span className="text-[9px] text-muted-foreground">{cl.bookmakerCount} books</span>
                  </div>
                  <div className="flex gap-3">
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">ML</p>
                      <p className="text-xs font-bold tabular-nums">
                        {formatPrice(cl.moneyline.home)} / {formatPrice(cl.moneyline.away)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">Spread</p>
                      <p className="text-xs font-bold tabular-nums">
                        {cl.spread.line != null ? cl.spread.line : "—"} ({formatPrice(cl.spread.home)})
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">Total</p>
                      <p className="text-xs font-bold tabular-nums">
                        {cl.total.line != null ? `O/U ${cl.total.line}` : "—"}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </section>

            {/* Line Movement Chart */}
            {selectedGameId && (
              <section className="cosmic-card rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-primary uppercase tracking-widest">
                    Line Movement
                  </h3>
                  <Select value={marketType} onValueChange={setMarketType}>
                    <SelectTrigger className="w-[110px] h-7 text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="moneyline">Moneyline</SelectItem>
                      <SelectItem value="spread">Spread</SelectItem>
                      <SelectItem value="total">Total</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {chartData.length > 1 ? (
                  <div className="h-48">
                    <ResponsiveContainer>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="time" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "0.5rem",
                            fontSize: "11px",
                          }}
                        />
                        {marketType === "moneyline" ? (
                          <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Price" />
                        ) : (
                          <Line type="monotone" dataKey="line" stroke="hsl(var(--cosmic-cyan))" strokeWidth={2} dot={false} name="Line" />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    Not enough snapshots to chart line movement. Odds snapshots are collected automatically during daily fetches.
                  </p>
                )}
              </section>
            )}

            {/* CLV Analysis */}
            {selectedGameId && (
              <section className="cosmic-card rounded-xl p-4">
                <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">
                  Closing Line Value (CLV)
                </h3>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Compare your bet's opening odds vs the closing line. Consistently beating the close indicates +EV betting.
                </p>
                {(() => {
                  const matchup = closingLines.find(cl => cl.gameId === selectedGameId);
                  if (!matchup) return null;
                  
                  // Show bookmaker-by-bookmaker breakdown
                  const rows = (historicalOdds || []).filter(
                    r => r.game_id === selectedGameId && r.market_type === marketType
                  );
                  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No data for this market.</p>;

                  return (
                    <div className="space-y-1.5">
                      {rows.map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                          <span className="text-muted-foreground w-24 truncate">{r.bookmaker}</span>
                          <span className="tabular-nums font-medium">
                            {marketType === "moneyline"
                              ? `${formatPrice(r.home_price)} / ${formatPrice(r.away_price)}`
                              : `${r.line ?? "—"} (${formatPrice(r.home_price)}/${formatPrice(r.away_price)})`}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
