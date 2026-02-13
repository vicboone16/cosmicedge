import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { History, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, RefreshCw, Trophy, Star, Users, Target } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { getPlanetaryHourAt } from "@/lib/planetary-hours";

function formatPrice(p: number | null): string {
  if (p == null) return "—";
  return p > 0 ? `+${p}` : `${p}`;
}

// Season definitions
const SEASONS = [
  { label: "2024-25", start: new Date(2024, 9, 1), end: new Date(2025, 6, 30) },
  { label: "2025-26", start: new Date(2025, 9, 1), end: new Date(2026, 6, 30) },
];

function getCurrentSeason(): typeof SEASONS[number] {
  const now = new Date();
  return SEASONS.find(s => now >= s.start && now <= s.end) || SEASONS[SEASONS.length - 1];
}

export default function HistoricalPage() {
  const [league, setLeague] = useState("NBA");
  const [season, setSeason] = useState(getCurrentSeason().label);
  const [selectedDate, setSelectedDate] = useState(subDays(new Date(), 1));
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [marketType, setMarketType] = useState("moneyline");
  const [playerSearch, setPlayerSearch] = useState("");

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Use local date boundaries (midnight-to-midnight local time) converted to ISO for UTC comparison
  const localStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
  const localEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59, 999);

  // ── Tab 1: Past games ──
  const { data: pastGames } = useQuery({
    queryKey: ["past-games", league, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("games")
        .select("*")
        .eq("league", league)
        .gte("start_time", localStart.toISOString())
        .lte("start_time", localEnd.toISOString())
        .order("start_time");
      return data || [];
    },
  });

  // ── Tab 2: Historical odds ──
  const { data: historicalOdds, refetch, isFetching } = useQuery({
    queryKey: ["historical-odds", league, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("historical_odds")
        .select("*")
        .eq("league", league)
        .eq("snapshot_date", dateStr)
        .order("home_team")
        .order("market_type");
      return data || [];
    },
  });

  // ── Tab 2: Line movement ──
  const { data: liveSnapshots } = useQuery({
    queryKey: ["odds-snapshots", selectedGameId, marketType],
    queryFn: async () => {
      if (!selectedGameId) return [];
      const { data } = await supabase
        .from("odds_snapshots")
        .select("*")
        .eq("game_id", selectedGameId)
        .eq("market_type", marketType)
        .order("captured_at", { ascending: true });
      return data || [];
    },
    enabled: !!selectedGameId,
  });

  // ── Tab 4: Player stats ──
  const { data: playerStats } = useQuery({
    queryKey: ["hist-player-stats", league, dateStr, playerSearch],
    queryFn: async () => {
      const gameIds = pastGames?.map(g => g.id) || [];
      if (gameIds.length === 0) return [];
      let query = supabase
        .from("player_game_stats")
        .select("*, players!player_game_stats_player_id_fkey(name, team, birth_date)")
        .in("game_id", gameIds)
        .order("points", { ascending: false })
        .limit(50);
      return (await query).data || [];
    },
    enabled: (pastGames?.length || 0) > 0,
  });

  // ── Tab 5: Market outcomes ──
  const marketOutcomes = useMemo(() => {
    if (!pastGames || !historicalOdds) return [];
    return pastGames.map(g => {
      const odds = historicalOdds.filter(o => o.game_id === g.id);
      const mlOdds = odds.filter(o => o.market_type === "moneyline");
      const spreadOdds = odds.filter(o => o.market_type === "spread");
      const totalOdds = odds.filter(o => o.market_type === "total");

      const homeWon = g.home_score != null && g.away_score != null && g.home_score > g.away_score;
      const totalScore = (g.home_score || 0) + (g.away_score || 0);
      const avgSpreadLine = spreadOdds.length > 0 
        ? spreadOdds.reduce((s, o) => s + (o.line || 0), 0) / spreadOdds.length 
        : null;
      const avgTotalLine = totalOdds.length > 0
        ? totalOdds.reduce((s, o) => s + (o.line || 0), 0) / totalOdds.length
        : null;

      const homeCoveredATS = avgSpreadLine != null && g.home_score != null && g.away_score != null
        ? (g.home_score + avgSpreadLine) > g.away_score
        : null;
      const wentOver = avgTotalLine != null ? totalScore > avgTotalLine : null;

      return { game: g, homeWon, totalScore, avgSpreadLine, avgTotalLine, homeCoveredATS, wentOver };
    });
  }, [pastGames, historicalOdds]);

  // Closing lines for Tab 2
  const closingLines = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const row of historicalOdds || []) {
      const key = `${row.home_team} vs ${row.away_team}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    const results: any[] = [];
    for (const [key, rows] of map) {
      const ml = rows.filter(r => r.market_type === "moneyline");
      const sp = rows.filter(r => r.market_type === "spread");
      const tot = rows.filter(r => r.market_type === "total");
      const avg = (arr: (number | null)[]) => {
        const valid = arr.filter((v): v is number => v != null);
        return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
      };
      results.push({
        key, homeTeam: rows[0].home_team, awayTeam: rows[0].away_team, gameId: rows[0].game_id,
        moneyline: { home: avg(ml.map(r => r.home_price)), away: avg(ml.map(r => r.away_price)) },
        spread: { line: avg(sp.map(r => r.line)), home: avg(sp.map(r => r.home_price)), away: avg(sp.map(r => r.away_price)) },
        total: { line: avg(tot.map(r => r.line)), over: avg(tot.map(r => r.home_price)), under: avg(tot.map(r => r.away_price)) },
        bookmakerCount: new Set(rows.map(r => r.bookmaker)).size,
      });
    }
    return results;
  }, [historicalOdds]);

  const chartData = useMemo(() => {
    if (!liveSnapshots?.length) return [];
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
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-historical-odds?league=${league}&date=${dateStr}T12:00:00Z`,
        { method: "GET", headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
    } catch (e) { console.warn(e); }
    refetch();
  };

  const filteredPlayerStats = useMemo(() => {
    if (!playerSearch) return playerStats || [];
    const q = playerSearch.toLowerCase();
    return (playerStats || []).filter((s: any) => s.players?.name?.toLowerCase().includes(q) || s.team_abbr?.toLowerCase().includes(q));
  }, [playerStats, playerSearch]);

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-bold font-display flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Historical
          </h1>
          <button onClick={handleFetchHistorical} disabled={isFetching}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary">
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            Fetch
          </button>
        </div>

        {/* Season selector */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Season:</span>
          {SEASONS.map(s => (
            <button key={s.label} onClick={() => { setSeason(s.label); setSelectedDate(s.start); setSelectedGameId(null); }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                season === s.label ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
              }`}>{s.label}</button>
          ))}
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setSelectedDate(d => subDays(d, 1))} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <input
            type="date"
            value={format(selectedDate, "yyyy-MM-dd")}
            onChange={(e) => { if (e.target.value) setSelectedDate(new Date(e.target.value + "T12:00:00")); }}
            className="bg-transparent text-xs text-muted-foreground border border-border/50 rounded px-2 py-0.5"
          />
          <button onClick={() => setSelectedDate(d => addDays(d, 1))} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* League chips */}
        <div className="flex gap-1.5">
          {["NBA", "NHL", "MLB", "NFL"].map((lg) => (
            <button key={lg} onClick={() => { setLeague(lg); setSelectedGameId(null); }}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                league === lg ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}>{lg}</button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4">
        <Tabs defaultValue="results" className="w-full">
          <TabsList className="w-full grid grid-cols-5 h-8">
            <TabsTrigger value="results" className="text-[9px] px-1"><Trophy className="h-3 w-3 mr-0.5" />Results</TabsTrigger>
            <TabsTrigger value="odds" className="text-[9px] px-1"><TrendingUp className="h-3 w-3 mr-0.5" />Odds</TabsTrigger>
            <TabsTrigger value="astro" className="text-[9px] px-1"><Star className="h-3 w-3 mr-0.5" />Astro</TabsTrigger>
            <TabsTrigger value="players" className="text-[9px] px-1"><Users className="h-3 w-3 mr-0.5" />Stats</TabsTrigger>
            <TabsTrigger value="markets" className="text-[9px] px-1"><Target className="h-3 w-3 mr-0.5" />ATS</TabsTrigger>
          </TabsList>

          {/* Tab 1: Game Results */}
          <TabsContent value="results" className="space-y-2 mt-3">
            {pastGames?.length ? pastGames.map(g => (
              <div key={g.id} className="cosmic-card rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-foreground">{g.away_team} @ {g.home_team}</p>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    g.status === "final" ? "bg-cosmic-green/20 text-cosmic-green" : "bg-secondary text-muted-foreground"
                  }`}>{g.status?.toUpperCase()}</span>
                </div>
                {g.home_score != null && g.away_score != null ? (
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold tabular-nums">{g.away_score}</span>
                      <span className="text-xs text-muted-foreground">-</span>
                      <span className="text-lg font-bold tabular-nums">{g.home_score}</span>
                    </div>
                    <span className={`text-[10px] font-bold ${g.home_score > g.away_score ? "text-cosmic-green" : "text-cosmic-red"}`}>
                      {g.home_score > g.away_score ? `${g.home_abbr} WIN` : `${g.away_abbr} WIN`}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Score not yet available</p>
                )}
              </div>
            )) : closingLines.length > 0 ? closingLines.map(cl => (
              <div key={cl.key} className="cosmic-card rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-foreground">{cl.awayTeam} @ {cl.homeTeam}</p>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-secondary text-muted-foreground">ODDS ONLY</span>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                  <span>ML: {formatPrice(cl.moneyline.home)} / {formatPrice(cl.moneyline.away)}</span>
                  {cl.spread.line != null && <span>Spread: {cl.spread.line}</span>}
                  {cl.total.line != null && <span>O/U: {cl.total.line}</span>}
                </div>
              </div>
            )) : (
              <div className="cosmic-card rounded-xl p-8 text-center">
                <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">No games found for this date</p>
                <p className="text-xs text-muted-foreground mt-1">Try clicking "Fetch" or navigate to a date with games</p>
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Historical Odds & Line Movement */}
          <TabsContent value="odds" className="space-y-3 mt-3">
            {closingLines.length === 0 ? (
              <div className="cosmic-card rounded-xl p-8 text-center space-y-2">
                <History className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-medium">No historical odds data</p>
                <p className="text-xs text-muted-foreground">Click "Fetch" to pull data</p>
              </div>
            ) : (
              <>
                {closingLines.map(cl => (
                  <button key={cl.key} onClick={() => setSelectedGameId(cl.gameId)}
                    className={`cosmic-card rounded-xl p-3 w-full text-left transition-colors ${selectedGameId === cl.gameId ? "ring-1 ring-primary" : "hover:bg-secondary/20"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold">{cl.awayTeam} @ {cl.homeTeam}</p>
                      <span className="text-[9px] text-muted-foreground">{cl.bookmakerCount} books</span>
                    </div>
                    <div className="flex gap-3">
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">ML</p>
                        <p className="text-xs font-bold tabular-nums">{formatPrice(cl.moneyline.home)} / {formatPrice(cl.moneyline.away)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Spread</p>
                        <p className="text-xs font-bold tabular-nums">{cl.spread.line ?? "—"} ({formatPrice(cl.spread.home)})</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Total</p>
                        <p className="text-xs font-bold tabular-nums">{cl.total.line != null ? `O/U ${cl.total.line}` : "—"}</p>
                      </div>
                    </div>
                  </button>
                ))}

                {selectedGameId && (
                  <div className="cosmic-card rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-primary uppercase tracking-widest">Line Movement</h3>
                      <Select value={marketType} onValueChange={setMarketType}>
                        <SelectTrigger className="w-[110px] h-7 text-[10px]"><SelectValue /></SelectTrigger>
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
                            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "11px" }} />
                            {marketType === "moneyline" ? (
                              <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                            ) : (
                              <Line type="monotone" dataKey="line" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-6">Not enough snapshots to chart line movement.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Tab 3: Historical Astrology */}
          <TabsContent value="astro" className="space-y-2 mt-3">
            {(() => {
              // Use pastGames if available, otherwise derive from closingLines
              const astroGames = pastGames?.length ? pastGames.map(g => ({
                key: g.id,
                away: g.away_abbr,
                home: g.home_abbr,
                startTime: g.start_time,
                lat: g.venue_lat ?? 40.7,
                lng: g.venue_lng,
                score: g.home_score != null ? `${g.away_score}-${g.home_score} · ${(g.home_score || 0) + (g.away_score || 0)} total` : null,
              })) : closingLines.map(cl => ({
                key: cl.key,
                away: cl.awayTeam,
                home: cl.homeTeam,
                startTime: (historicalOdds?.find(o => o.home_team === cl.homeTeam)?.start_time) || selectedDate.toISOString(),
                lat: 40.7,
                lng: null as number | null,
                score: null as string | null,
              }));

              if (astroGames.length === 0) return (
                <div className="cosmic-card rounded-xl p-8 text-center">
                  <Star className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-medium">No games to analyze</p>
                  <p className="text-xs text-muted-foreground mt-1">Try clicking "Fetch" to load historical odds data</p>
                </div>
              );

              return astroGames.map(g => {
                const ph = getPlanetaryHourAt(new Date(g.startTime), g.lat);
                return (
                  <div key={g.key} className="cosmic-card rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">{g.away} @ {g.home}</p>
                      <span className="text-[10px] text-muted-foreground">{format(new Date(g.startTime), "h:mm a")}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {ph && (
                        <div className="flex items-center gap-1">
                          <span className="text-sm">{ph.symbol}</span>
                          <div>
                            <p className="text-[10px] font-medium">{ph.planet} Hour</p>
                            <p className="text-[9px] text-muted-foreground">{ph.isDay ? "Day" : "Night"} chart</p>
                          </div>
                        </div>
                      )}
                      <div className="text-[9px] text-muted-foreground">
                        {g.lat && g.lng ? (
                          <span>📍 {g.lat.toFixed(2)}°N, {Math.abs(g.lng).toFixed(2)}°W</span>
                        ) : "No coordinates"}
                      </div>
                    </div>
                    {g.score && (
                      <p className="text-[10px] text-muted-foreground">Final: {g.score}</p>
                    )}
                  </div>
                );
              });
            })()}
          </TabsContent>

          {/* Tab 4: Historical Player Stats */}
          <TabsContent value="players" className="space-y-2 mt-3">
            <Input placeholder="Search player or team..." value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} className="h-8 text-xs mb-2" />
            {filteredPlayerStats.length === 0 ? (
              <div className="cosmic-card rounded-xl p-8 text-center">
                <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm font-medium">No player stats found</p>
              </div>
            ) : filteredPlayerStats.slice(0, 30).map((s: any) => (
              <div key={s.id} className="cosmic-card rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-xs font-semibold">{s.players?.name || "Unknown"}</p>
                    <p className="text-[9px] text-muted-foreground">{s.team_abbr}{s.players?.birth_date ? ` · 🎂 ${s.players.birth_date}` : ""}</p>
                  </div>
                  <span className="text-sm font-bold text-primary tabular-nums">{s.points ?? 0} PTS</span>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span>{s.rebounds ?? 0} REB</span>
                  <span>{s.assists ?? 0} AST</span>
                  <span>{s.steals ?? 0} STL</span>
                  <span>{s.blocks ?? 0} BLK</span>
                  <span>{s.turnovers ?? 0} TO</span>
                  {s.minutes && <span>{s.minutes} MIN</span>}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* Tab 5: Team Market Outcomes */}
          <TabsContent value="markets" className="space-y-2 mt-3">
            {marketOutcomes.length === 0 ? (
              <div className="cosmic-card rounded-xl p-8 text-center">
                <Target className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm font-medium">No market outcome data</p>
              </div>
            ) : marketOutcomes.map(({ game: g, homeWon, totalScore, avgSpreadLine, avgTotalLine, homeCoveredATS, wentOver }) => (
              <div key={g.id} className="cosmic-card rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">{g.away_abbr} @ {g.home_abbr}</p>
                  {g.home_score != null && (
                    <span className="text-xs font-bold tabular-nums">{g.away_score}-{g.home_score}</span>
                  )}
                </div>
                <div className="flex gap-3 text-[10px]">
                  {homeWon !== undefined && (
                    <span className={homeWon ? "text-cosmic-green font-bold" : "text-cosmic-red font-bold"}>
                      ML: {homeWon ? g.home_abbr : g.away_abbr}
                    </span>
                  )}
                  {homeCoveredATS != null && avgSpreadLine != null && (
                    <span className={homeCoveredATS ? "text-cosmic-green" : "text-cosmic-red"}>
                      ATS: {homeCoveredATS ? g.home_abbr : g.away_abbr} ({avgSpreadLine > 0 ? "+" : ""}{avgSpreadLine.toFixed(1)})
                    </span>
                  )}
                  {wentOver != null && avgTotalLine != null && (
                    <span className={wentOver ? "text-cosmic-green" : "text-cosmic-red"}>
                      O/U: {wentOver ? "OVER" : "UNDER"} ({avgTotalLine.toFixed(1)}) · {totalScore}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
