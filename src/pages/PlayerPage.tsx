import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Star, TrendingUp, Zap, Shield, Flame, ArrowUp, ArrowDown, BarChart3, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

function getZodiacFromDate(dateStr: string): { sign: string; symbol: string; element: string; quality: string } {
  const d = new Date(dateStr + "T12:00:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const signs: { sign: string; symbol: string; element: string; quality: string; m1: number; d1: number; m2: number; d2: number }[] = [
    { sign: "Capricorn", symbol: "♑", element: "Earth", quality: "Cardinal", m1: 1, d1: 1, m2: 1, d2: 19 },
    { sign: "Aquarius", symbol: "♒", element: "Air", quality: "Fixed", m1: 1, d1: 20, m2: 2, d2: 18 },
    { sign: "Pisces", symbol: "♓", element: "Water", quality: "Mutable", m1: 2, d1: 19, m2: 3, d2: 20 },
    { sign: "Aries", symbol: "♈", element: "Fire", quality: "Cardinal", m1: 3, d1: 21, m2: 4, d2: 19 },
    { sign: "Taurus", symbol: "♉", element: "Earth", quality: "Fixed", m1: 4, d1: 20, m2: 5, d2: 20 },
    { sign: "Gemini", symbol: "♊", element: "Air", quality: "Mutable", m1: 5, d1: 21, m2: 6, d2: 20 },
    { sign: "Cancer", symbol: "♋", element: "Water", quality: "Cardinal", m1: 6, d1: 21, m2: 7, d2: 22 },
    { sign: "Leo", symbol: "♌", element: "Fire", quality: "Fixed", m1: 7, d1: 23, m2: 8, d2: 22 },
    { sign: "Virgo", symbol: "♍", element: "Earth", quality: "Mutable", m1: 8, d1: 23, m2: 9, d2: 22 },
    { sign: "Libra", symbol: "♎", element: "Air", quality: "Cardinal", m1: 9, d1: 23, m2: 10, d2: 22 },
    { sign: "Scorpio", symbol: "♏", element: "Water", quality: "Fixed", m1: 10, d1: 23, m2: 11, d2: 21 },
    { sign: "Sagittarius", symbol: "♐", element: "Fire", quality: "Mutable", m1: 11, d1: 22, m2: 12, d2: 21 },
    { sign: "Capricorn", symbol: "♑", element: "Earth", quality: "Cardinal", m1: 12, d1: 22, m2: 12, d2: 31 },
  ];
  for (const s of signs) {
    if ((month === s.m1 && day >= s.d1) || (month === s.m2 && day <= s.d2))
      return { sign: s.sign, symbol: s.symbol, element: s.element, quality: s.quality };
  }
  return { sign: "Capricorn", symbol: "♑", element: "Earth", quality: "Cardinal" };
}

function getTransitModifiers(element: string): { stat: string; modifier: number; reason: string; type: "boost" | "risk" }[] {
  const now = new Date();
  const marsRetro = now >= new Date("2025-12-06") && now <= new Date("2026-02-24");
  const mercuryRetro = now >= new Date("2026-01-25") && now <= new Date("2026-02-15");
  const mods: { stat: string; modifier: number; reason: string; type: "boost" | "risk" }[] = [];
  if (marsRetro) {
    if (element === "Fire") {
      mods.push({ stat: "PTS", modifier: -8, reason: "Mars ℞ dampens Fire sign scoring energy", type: "risk" });
      mods.push({ stat: "STL", modifier: -12, reason: "Aggressive instincts muted under Mars ℞", type: "risk" });
    } else if (element === "Water") {
      mods.push({ stat: "AST", modifier: +6, reason: "Water signs channel Mars ℞ into court vision", type: "boost" });
    } else if (element === "Earth") {
      mods.push({ stat: "REB", modifier: +5, reason: "Earth signs grind harder when Mars ℞ slows pace", type: "boost" });
    }
  }
  if (mercuryRetro) {
    if (element === "Air") {
      mods.push({ stat: "TOV", modifier: +15, reason: "Mercury ℞ disrupts Air sign passing lanes", type: "risk" });
      mods.push({ stat: "AST", modifier: -10, reason: "Miscommunication under Mercury ℞", type: "risk" });
    } else if (element === "Earth") {
      mods.push({ stat: "FG%", modifier: +4, reason: "Earth signs stay methodical despite Mercury ℞", type: "boost" });
    }
  }
  if (element === "Air") mods.push({ stat: "3P%", modifier: +7, reason: "Sun in Aquarius empowers Air sign shooting", type: "boost" });
  if (element === "Water") mods.push({ stat: "PTS", modifier: +5, reason: "Jupiter in Cancer expands Water sign scoring", type: "boost" });
  return mods;
}

function getPlayerProps(stats: any, element: string) {
  if (!stats) return [];
  const mods = getTransitModifiers(element);
  const props = [
    { stat: "PTS", baseline: stats.points_per_game, label: "Points" },
    { stat: "REB", baseline: stats.rebounds_per_game, label: "Rebounds" },
    { stat: "AST", baseline: stats.assists_per_game, label: "Assists" },
    { stat: "STL", baseline: stats.steals_per_game, label: "Steals" },
    { stat: "BLK", baseline: stats.blocks_per_game, label: "Blocks" },
    { stat: "3P%", baseline: stats.three_pct ? stats.three_pct * 100 : null, label: "3PT %" },
  ].filter(p => p.baseline != null);
  return props.map(p => {
    const mod = mods.find(m => m.stat === p.stat);
    const adjustedPct = mod ? mod.modifier : 0;
    const projected = p.baseline * (1 + adjustedPct / 100);
    return { ...p, projected: Math.round(projected * 10) / 10, modifier: mod };
  });
}

type StatsTab = "stats" | "1h" | "1q" | "game_logs";
type SampleSize = 5 | 10 | "season";

const PlayerPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [statsTab, setStatsTab] = useState<StatsTab>("stats");
  const [sampleSize, setSampleSize] = useState<SampleSize>(10);
  const [showOpponent, setShowOpponent] = useState(false);

  const { data: player, isLoading } = useQuery({
    queryKey: ["player", id],
    queryFn: async () => {
      const { data } = await supabase.from("players").select("*").eq("id", id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: seasonStats } = useQuery({
    queryKey: ["player-season-stats", id],
    queryFn: async () => {
      const { data } = await supabase.from("player_season_stats").select("*").eq("player_id", id!).order("season", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  // Game logs for split stats
  const { data: gameLogs } = useQuery({
    queryKey: ["player-game-logs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("player_game_stats")
        .select("*, games!player_game_stats_game_id_fkey(start_time, home_abbr, away_abbr, league)")
        .eq("player_id", id!)
        .order("created_at", { ascending: false })
        .limit(82);
      return data || [];
    },
    enabled: !!id,
  });

  // Upcoming opponent
  const { data: nextGame } = useQuery({
    queryKey: ["player-next-game", player?.team],
    queryFn: async () => {
      if (!player?.team) return null;
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time")
        .or(`home_abbr.eq.${player.team},away_abbr.eq.${player.team}`)
        .gte("start_time", now)
        .order("start_time", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!player?.team,
  });

  const opponent = nextGame && player?.team
    ? (nextGame.home_abbr === player.team ? nextGame.away_abbr : nextGame.home_abbr)
    : null;

  // Opponent-specific stats (games vs this team)
  const opponentLogs = useMemo(() => {
    if (!opponent || !gameLogs) return [];
    return gameLogs.filter(g => {
      const game = g.games as any;
      return game && (game.home_abbr === opponent || game.away_abbr === opponent);
    });
  }, [gameLogs, opponent]);

  const slicedLogs = useMemo(() => {
    const logs = showOpponent ? opponentLogs : (gameLogs || []);
    if (sampleSize === "season") return logs;
    return logs.slice(0, sampleSize);
  }, [gameLogs, opponentLogs, sampleSize, showOpponent]);

  const avgStats = useMemo(() => {
    if (slicedLogs.length === 0) return null;
    const sum = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, min: 0, fg: 0, fga: 0, three: 0, threeA: 0, ft: 0, fta: 0 };
    for (const g of slicedLogs) {
      sum.pts += g.points ?? 0;
      sum.reb += g.rebounds ?? 0;
      sum.ast += g.assists ?? 0;
      sum.stl += g.steals ?? 0;
      sum.blk += g.blocks ?? 0;
      sum.min += g.minutes ?? 0;
      sum.fg += g.fg_made ?? 0;
      sum.fga += g.fg_attempted ?? 0;
      sum.three += g.three_made ?? 0;
      sum.threeA += g.three_attempted ?? 0;
      sum.ft += g.ft_made ?? 0;
      sum.fta += g.ft_attempted ?? 0;
    }
    const n = slicedLogs.length;
    return {
      pts: (sum.pts / n).toFixed(1),
      reb: (sum.reb / n).toFixed(1),
      ast: (sum.ast / n).toFixed(1),
      stl: (sum.stl / n).toFixed(1),
      blk: (sum.blk / n).toFixed(1),
      min: (sum.min / n).toFixed(1),
      fgPct: sum.fga > 0 ? ((sum.fg / sum.fga) * 100).toFixed(1) : "—",
      threePct: sum.threeA > 0 ? ((sum.three / sum.threeA) * 100).toFixed(1) : "—",
      ftPct: sum.fta > 0 ? ((sum.ft / sum.fta) * 100).toFixed(1) : "—",
      games: n,
    };
  }, [slicedLogs]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Consulting the natal chart...</p>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Player not found</p>
      </div>
    );
  }

  const zodiac = player.birth_date ? getZodiacFromDate(player.birth_date) : null;
  const props = zodiac && seasonStats ? getPlayerProps(seasonStats, zodiac.element) : [];
  const transitMods = zodiac ? getTransitModifiers(zodiac.element) : [];

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back</span>
        </button>
        <div className="flex items-center gap-3">
          <Avatar className="h-14 w-14">
            {player.headshot_url && <AvatarImage src={player.headshot_url} alt={player.name} />}
            <AvatarFallback className="text-lg bg-secondary">
              {zodiac ? zodiac.symbol : player.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold font-display">{player.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">{player.position || "—"}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <button onClick={() => navigate(`/team/${player.team}`)} className="text-xs text-primary hover:underline">
                {player.team}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => navigate("/trends")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/60 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            View Trends
          </button>
        </div>
      </header>

      <div className="px-4 py-4 space-y-5">
        {/* Natal Profile */}
        {zodiac && (
          <section>
            <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5" />
              Natal Profile
            </h3>
            <div className="celestial-gradient rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{zodiac.symbol}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Sun in {zodiac.sign}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {zodiac.element} · {zodiac.quality} · Born {player.birth_date} {player.birth_place ? `· ${player.birth_place}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="astro-badge rounded-full px-2 py-0.5 text-[10px] font-medium text-cosmic-indigo">
                  ☉ {zodiac.sign}
                </span>
                {player.natal_data_quality === "exact" ? (
                  <span className="astro-badge rounded-full px-2 py-0.5 text-[10px] font-medium text-cosmic-indigo">
                    Exact Birth Time
                  </span>
                ) : (
                  <span className="astro-badge rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Houses/Rising: Noon est.
                  </span>
                )}
                <span className="astro-badge rounded-full px-2 py-0.5 text-[10px] font-medium text-cosmic-indigo">
                  {zodiac.element} Element
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Active Transit Effects */}
        {transitMods.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Active Transit Effects
            </h3>
            <div className="space-y-2">
              {transitMods.map((mod, i) => (
                <div key={i} className={cn(
                  "cosmic-card rounded-xl p-3 flex items-start gap-3",
                  mod.type === "boost" ? "border-l-2 border-l-cosmic-green" : "border-l-2 border-l-cosmic-red"
                )}>
                  <div className={cn("p-1.5 rounded-lg mt-0.5", mod.type === "boost" ? "bg-cosmic-green/10" : "bg-cosmic-red/10")}>
                    {mod.type === "boost" ? <ArrowUp className="h-3.5 w-3.5 text-cosmic-green" /> : <ArrowDown className="h-3.5 w-3.5 text-cosmic-red" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{mod.stat}</span>
                      <span className={cn("text-[10px] font-bold", mod.type === "boost" ? "text-cosmic-green" : "text-cosmic-red")}>
                        {mod.modifier > 0 ? "+" : ""}{mod.modifier}%
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{mod.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ====== Stats Section with Tabs & Filters ====== */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Performance
          </h3>

          {/* Stats tabs */}
          <div className="flex bg-secondary rounded-lg p-0.5 mb-3">
            {([
              { key: "stats" as StatsTab, label: "Stats" },
              { key: "1h" as StatsTab, label: "1H" },
              { key: "1q" as StatsTab, label: "1Q" },
              { key: "game_logs" as StatsTab, label: "Game Logs" },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setStatsTab(t.key)}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
                  statsTab === t.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Sample size filter */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-muted-foreground">Sample:</span>
            {([5, 10, "season"] as SampleSize[]).map(s => (
              <button
                key={String(s)}
                onClick={() => setSampleSize(s)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors",
                  sampleSize === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                )}
              >
                {s === "season" ? "Season" : `Last ${s}`}
              </button>
            ))}

            {/* Opponent filter */}
            {opponent && (
              <button
                onClick={() => setShowOpponent(!showOpponent)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors flex items-center gap-1 ml-auto",
                  showOpponent ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                )}
              >
                <Users className="h-3 w-3" />
                vs {opponent}
              </button>
            )}
          </div>

          {statsTab === "stats" && avgStats && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "PTS", val: avgStats.pts },
                { label: "REB", val: avgStats.reb },
                { label: "AST", val: avgStats.ast },
                { label: "FG%", val: avgStats.fgPct },
                { label: "3P%", val: avgStats.threePct },
                { label: "STL", val: avgStats.stl },
                { label: "BLK", val: avgStats.blk },
                { label: "MIN", val: avgStats.min },
              ].map(({ label, val }) => (
                <div key={label} className="cosmic-card rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                  <p className="text-sm font-semibold mt-0.5 tabular-nums">{val ?? "—"}</p>
                </div>
              ))}
              <div className="col-span-4 text-center">
                <p className="text-[10px] text-muted-foreground">
                  {showOpponent ? `${avgStats.games} games vs ${opponent}` : `${avgStats.games} game${avgStats.games !== 1 ? "s" : ""} sample`}
                </p>
              </div>
            </div>
          )}

          {statsTab === "stats" && !avgStats && seasonStats && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "PTS", val: seasonStats.points_per_game },
                { label: "REB", val: seasonStats.rebounds_per_game },
                { label: "AST", val: seasonStats.assists_per_game },
                { label: "FG%", val: seasonStats.fg_pct ? (seasonStats.fg_pct * 100).toFixed(1) : null },
                { label: "3P%", val: seasonStats.three_pct ? (seasonStats.three_pct * 100).toFixed(1) : null },
                { label: "STL", val: seasonStats.steals_per_game },
                { label: "BLK", val: seasonStats.blocks_per_game },
                { label: "MIN", val: seasonStats.minutes_per_game },
              ].map(({ label, val }) => (
                <div key={label} className="cosmic-card rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                  <p className="text-sm font-semibold mt-0.5 tabular-nums">{val ?? "—"}</p>
                </div>
              ))}
            </div>
          )}

          {(statsTab === "1h" || statsTab === "1q") && (
            <div className="cosmic-card rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground">
                {statsTab === "1h" ? "First Half" : "First Quarter"} splits require per-period box scores. Data will populate as games are played.
              </p>
            </div>
          )}

          {statsTab === "game_logs" && (
            <div className="space-y-1">
              {slicedLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No game logs available.</p>
              ) : (
                <>
                  <div className="grid grid-cols-8 gap-1 text-[9px] text-muted-foreground font-semibold uppercase tracking-wider px-2 pb-1">
                    <span className="col-span-2">Date</span>
                    <span className="text-right">PTS</span>
                    <span className="text-right">REB</span>
                    <span className="text-right">AST</span>
                    <span className="text-right">STL</span>
                    <span className="text-right">BLK</span>
                    <span className="text-right">MIN</span>
                  </div>
                  {slicedLogs.map((g, i) => {
                    const game = g.games as any;
                    const dateStr = game?.start_time ? format(new Date(game.start_time), "M/d") : "—";
                    const matchup = game ? `${game.away_abbr}@${game.home_abbr}` : "";
                    return (
                      <div key={g.id || i} className="grid grid-cols-8 gap-1 text-xs px-2 py-1.5 cosmic-card rounded-lg">
                        <div className="col-span-2">
                          <p className="text-[10px] font-medium text-foreground">{dateStr}</p>
                          <p className="text-[9px] text-muted-foreground">{matchup}</p>
                        </div>
                        <span className="text-right font-semibold tabular-nums">{g.points ?? "—"}</span>
                        <span className="text-right tabular-nums">{g.rebounds ?? "—"}</span>
                        <span className="text-right tabular-nums">{g.assists ?? "—"}</span>
                        <span className="text-right tabular-nums">{g.steals ?? "—"}</span>
                        <span className="text-right tabular-nums">{g.blocks ?? "—"}</span>
                        <span className="text-right tabular-nums text-muted-foreground">{g.minutes ?? "—"}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </section>

        {/* Player Props with Astro Projections */}
        {props.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-cosmic-gold" />
              Projected Props · Transit-Adjusted
            </h3>
            <div className="space-y-2">
              {props.map(({ stat, label, baseline, projected, modifier }) => (
                <div key={stat} className="cosmic-card rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">{label}</p>
                      <p className="text-[10px] text-muted-foreground">Season avg: {baseline}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold font-display tabular-nums text-foreground">{projected}</p>
                      {modifier && (
                        <span className={cn("text-[10px] font-semibold", modifier.type === "boost" ? "text-cosmic-green" : "text-cosmic-red")}>
                          {modifier.type === "boost" ? "↑" : "↓"} {modifier.reason.split(" ").slice(0, 3).join(" ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        modifier?.type === "boost" ? "bg-cosmic-green" : modifier?.type === "risk" ? "bg-cosmic-red" : "bg-primary"
                      )}
                      style={{ width: `${Math.min((projected / (baseline * 1.5)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default PlayerPage;
