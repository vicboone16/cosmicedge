import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Star, TrendingUp, Zap, Shield, Flame, ArrowUp, ArrowDown, BarChart3, Users, Calendar, Swords } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { PlayerPropsSection } from "@/components/player/PlayerPropsSection";
import { ModelsTab } from "@/components/models/ModelsTab";
import { useNebulaOverlayByPlayer } from "@/hooks/use-nebula-overlay";

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
    { stat: "3P%", baseline: stats.three_pct ?? null, label: "3PT %" },
  ].filter(p => p.baseline != null);
  return props.map(p => {
    const mod = mods.find(m => m.stat === p.stat);
    const adjustedPct = mod ? mod.modifier : 0;
    const projected = p.baseline * (1 + adjustedPct / 100);
    return { ...p, projected: Math.round(projected * 10) / 10, modifier: mod };
  });
}

type StatsTab = "stats" | "1h" | "2h" | "1q" | "2q" | "3q" | "4q" | "ot1" | "ot2" | "game_logs";
type SampleSize = 5 | 10 | "season";
type StatMode = "averages" | "totals";
type PlayerProfileTab = "overview" | "astrology" | "models";

const PlayerPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [statsTab, setStatsTab] = useState<StatsTab>("stats");
  const [sampleSize, setSampleSize] = useState<SampleSize>(10);
  const [showOpponent, setShowOpponent] = useState(false);
  const [statMode, setStatMode] = useState<StatMode>("averages");
  const [profileTab, setProfileTab] = useState<PlayerProfileTab>("overview");

  const { data: overlayRows = [], isLoading: overlayLoading, refetch: refetchOverlay } = useNebulaOverlayByPlayer(id);

  const { data: player, isLoading } = useQuery({
    queryKey: ["player", id],
    queryFn: async () => {
      const { data } = await supabase.from("players").select("*").eq("id", id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: seasonStats } = useQuery({
    queryKey: ["player-season-stats", id, statMode],
    queryFn: async () => {
      const { data } = await supabase
        .from("player_season_stats")
        .select("*")
        .eq("player_id", id!)
        .eq("stat_type", statMode)
        .order("season", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Fallback: if no row for this stat_type, try the other
      if (!data) {
        const fallback = statMode === "averages" ? "totals" : "averages";
        const { data: fb } = await supabase
          .from("player_season_stats")
          .select("*")
          .eq("player_id", id!)
          .eq("stat_type", fallback)
          .order("season", { ascending: false })
          .limit(1)
          .maybeSingle();
        return fb;
      }
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
        .eq("period", "full")
        .not("points", "is", null)
        .order("created_at", { ascending: false })
        .limit(82);
      // Sort by game start_time descending for display
      const sorted = (data || []).sort((a, b) => {
        const aTime = (a.games as any)?.start_time || "";
        const bTime = (b.games as any)?.start_time || "";
        return bTime.localeCompare(aTime);
      });
      return sorted;
    },
    enabled: !!id,
  });

  // Quarter/Half period stats
  const periodTabMap: Record<string, string> = {
    "1q": "Q1", "2q": "Q2", "3q": "Q3", "4q": "Q4",
    "1h": "1H", "2h": "2H", "ot1": "OT", "ot2": "OT2",
  };
  const periodForTab = periodTabMap[statsTab] || null;

  const { data: periodLogs } = useQuery({
    queryKey: ["player-period-logs", id, periodForTab],
    queryFn: async () => {
      if (!periodForTab) return [];
      let periods: string[];
      if (periodForTab === "1H") {
        periods = ["Q1", "Q2", "1H"];
      } else if (periodForTab === "2H") {
        periods = ["Q3", "Q4", "2H"];
      } else {
        periods = [periodForTab];
      }
      const { data } = await supabase
        .from("player_game_stats")
        .select("*, games!player_game_stats_game_id_fkey(start_time, home_abbr, away_abbr, league)")
        .eq("player_id", id!)
        .in("period", periods)
        .not("points", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      return (data || []).sort((a, b) => {
        const aTime = (a.games as any)?.start_time || "";
        const bTime = (b.games as any)?.start_time || "";
        return bTime.localeCompare(aTime);
      });
    },
    enabled: !!id && !!periodForTab,
  });

  // Compute period averages
  const periodAvgStats = useMemo(() => {
    if (!periodLogs || periodLogs.length === 0) return null;

    // For halves: if we have direct rows, use them; else sum quarter rows per game
    let effectiveLogs: any[];
    const isHalf = periodForTab === "1H" || periodForTab === "2H";
    const halfQuarters = periodForTab === "1H" ? ["Q1", "Q2"] : periodForTab === "2H" ? ["Q3", "Q4"] : [];

    if (isHalf) {
      const directHalf = periodLogs.filter((l: any) => l.period === periodForTab);
      if (directHalf.length > 0) {
        effectiveLogs = directHalf;
      } else {
        // Sum quarters per game
        const byGame = new Map<string, any>();
        for (const l of periodLogs) {
          if (!halfQuarters.includes(l.period)) continue;
          const gid = l.game_id;
          if (!byGame.has(gid)) {
            byGame.set(gid, { ...l, _count: 1 });
          } else {
            const existing = byGame.get(gid)!;
            existing.points = (existing.points || 0) + (l.points || 0);
            existing.rebounds = (existing.rebounds || 0) + (l.rebounds || 0);
            existing.assists = (existing.assists || 0) + (l.assists || 0);
            existing.steals = (existing.steals || 0) + (l.steals || 0);
            existing.blocks = (existing.blocks || 0) + (l.blocks || 0);
            existing.turnovers = (existing.turnovers || 0) + (l.turnovers || 0);
            existing.minutes = (existing.minutes || 0) + (l.minutes || 0);
            existing.fg_made = (existing.fg_made || 0) + (l.fg_made || 0);
            existing.fg_attempted = (existing.fg_attempted || 0) + (l.fg_attempted || 0);
            existing.three_made = (existing.three_made || 0) + (l.three_made || 0);
            existing.three_attempted = (existing.three_attempted || 0) + (l.three_attempted || 0);
            existing.ft_made = (existing.ft_made || 0) + (l.ft_made || 0);
            existing.ft_attempted = (existing.ft_attempted || 0) + (l.ft_attempted || 0);
            existing._count++;
          }
        }
        effectiveLogs = Array.from(byGame.values()).filter(g => g._count >= 2);
      }
    } else {
      effectiveLogs = periodLogs.filter((l: any) => l.period === periodForTab);
    }

    if (effectiveLogs.length === 0) return null;

    // Apply sample size
    const limited = sampleSize === "season" ? effectiveLogs : effectiveLogs.slice(0, sampleSize);
    if (limited.length === 0) return null;

    const sum = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, min: 0, fg: 0, fga: 0, three: 0, threeA: 0, ft: 0, fta: 0 };
    for (const g of limited) {
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
    const n = limited.length;
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
      logs: limited,
    };
  }, [periodLogs, periodForTab, sampleSize]);

  // Upcoming opponent
  const { data: nextGame } = useQuery({
    queryKey: ["player-next-game", player?.team],
    queryFn: async () => {
      if (!player?.team) return null;
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time, venue")
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

  const isHome = nextGame ? nextGame.home_abbr === player?.team : false;

  // Opponent team season stats for comparison
  const { data: oppTeamStats } = useQuery({
    queryKey: ["opp-team-stats", opponent],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_season_stats")
        .select("*")
        .eq("team_abbr", opponent!)
        .order("season", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!opponent,
  });

  // Player's own team season stats
  const { data: ownTeamStats } = useQuery({
    queryKey: ["own-team-stats", player?.team],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_season_stats")
        .select("*")
        .eq("team_abbr", player!.team!)
        .order("season", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!player?.team,
  });

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
              <button onClick={() => navigate(`/team/${player.league || "NBA"}/${player.team}`)} className="text-xs text-primary hover:underline">
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

        {/* Profile tabs */}
        <div className="flex gap-1 mt-3 border-b border-border/50 -mx-4 px-4 overflow-x-auto no-scrollbar">
          {([
            { val: "overview" as PlayerProfileTab, label: "Overview" },
            { val: "astrology" as PlayerProfileTab, label: "Astrology" },
            { val: "models" as PlayerProfileTab, label: "Models" },
          ]).map(t => (
            <button
              key={t.val}
              onClick={() => setProfileTab(t.val)}
              className={cn(
                "px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap border-b-2",
                profileTab === t.val
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4 space-y-5">
        {/* Models Tab */}
        {profileTab === "models" && (
          <ModelsTab
            overlayRows={overlayRows}
            isLoading={overlayLoading}
            onRefresh={() => refetchOverlay()}
            hasBaseProps={true}
            showSearch
          />
        )}

        {profileTab === "astrology" && (
          <>
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
          </>
        )}

        {profileTab === "overview" && (
          <>
            {/* Props & Odds */}
            {player.team && (
              <PlayerPropsSection playerId={id!} playerName={player.name} teamAbbr={player.team} />
            )}

            {/* ====== Stats Section with Tabs & Filters ====== */}
            <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Performance
          </h3>

          {/* Totals / Averages toggle */}
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5 mb-3 w-fit">
            {(["averages", "totals"] as StatMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setStatMode(mode)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors capitalize",
                  statMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode === "averages" ? "Per Game" : "Season Totals"}
              </button>
            ))}
          </div>

          {/* Stats tabs */}
          <div className="flex bg-secondary rounded-lg p-0.5 mb-3 overflow-x-auto no-scrollbar">
            {([
              { key: "stats" as StatsTab, label: "Full" },
              { key: "1h" as StatsTab, label: "1H" },
              { key: "2h" as StatsTab, label: "2H" },
              { key: "1q" as StatsTab, label: "Q1" },
              { key: "2q" as StatsTab, label: "Q2" },
              { key: "3q" as StatsTab, label: "Q3" },
              { key: "4q" as StatsTab, label: "Q4" },
              { key: "ot1" as StatsTab, label: "OT" },
              { key: "ot2" as StatsTab, label: "OT2" },
              { key: "game_logs" as StatsTab, label: "Logs" },
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

            {/* Opponent filter - always show when there's a next game */}
            {opponent && nextGame && (
              <button
                onClick={() => setShowOpponent(!showOpponent)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors flex items-center gap-1 ml-auto",
                  showOpponent ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                )}
              >
                <Swords className="h-3 w-3" />
                vs {opponent} · {format(new Date(nextGame.start_time), "M/d")}
              </button>
            )}
          </div>

          {/* ── Next Matchup Preview ── */}
          {showOpponent && opponent && nextGame && (
            <div className="cosmic-card rounded-xl overflow-hidden mb-3 border border-primary/20">
              <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-border">
                <div className="flex items-center gap-2">
                  <Swords className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-bold text-foreground">Next Matchup</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(nextGame.start_time), "EEE, MMM d · h:mm a")}
                  </span>
                </div>
              </div>

              {/* Matchup header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="text-center flex-1">
                  <p className="text-lg font-bold text-foreground">{player?.team}</p>
                  <p className="text-[10px] text-muted-foreground">{isHome ? "Home" : "Away"}</p>
                </div>
                <span className="text-xs font-semibold text-muted-foreground px-3">VS</span>
                <div className="text-center flex-1">
                  <p className="text-lg font-bold text-foreground">{opponent}</p>
                  <p className="text-[10px] text-muted-foreground">{isHome ? "Away" : "Home"}</p>
                </div>
              </div>

              {/* Team stat comparison */}
              {ownTeamStats && oppTeamStats && (
                <div className="border-t border-border">
                  <div className="px-4 py-2 border-b border-border/50">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Team Comparison</p>
                  </div>
                  {[
                    { label: "PPG", own: ownTeamStats.points_per_game, opp: oppTeamStats.points_per_game },
                    { label: "Opp PPG", own: ownTeamStats.opp_points_per_game, opp: oppTeamStats.opp_points_per_game, lower: true },
                    { label: "Off Rtg", own: ownTeamStats.off_rating, opp: oppTeamStats.off_rating },
                    { label: "Def Rtg", own: ownTeamStats.def_rating, opp: oppTeamStats.def_rating, lower: true },
                    { label: "Pace", own: ownTeamStats.pace, opp: oppTeamStats.pace },
                    { label: "FG%", own: ownTeamStats.fg_pct, opp: oppTeamStats.fg_pct },
                  ].map(s => {
                    const ownVal = s.own ?? 0;
                    const oppVal = s.opp ?? 0;
                    const ownWins = s.lower ? ownVal < oppVal : ownVal > oppVal;
                    const oppWins = s.lower ? oppVal < ownVal : oppVal > ownVal;
                    return (
                      <div key={s.label} className="flex items-center justify-between px-4 py-2 border-b border-border/30 last:border-b-0">
                        <span className={cn("text-xs tabular-nums font-semibold", ownWins && "text-cosmic-green")}>
                          {s.own?.toFixed(1) ?? "—"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{s.label}</span>
                        <span className={cn("text-xs tabular-nums font-semibold", oppWins && "text-cosmic-green")}>
                          {s.opp?.toFixed(1) ?? "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Head-to-head game logs */}
              {opponentLogs.length > 0 ? (
                <div className="border-t border-border">
                  <div className="px-4 py-2 border-b border-border/50">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {player?.name} vs {opponent} · {opponentLogs.length} game{opponentLogs.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="grid grid-cols-8 gap-1 text-[9px] text-muted-foreground font-semibold uppercase tracking-wider px-3 py-1.5">
                    <span className="col-span-2">Date</span>
                    <span className="text-right">PTS</span>
                    <span className="text-right">REB</span>
                    <span className="text-right">AST</span>
                    <span className="text-right">STL</span>
                    <span className="text-right">BLK</span>
                    <span className="text-right">MIN</span>
                  </div>
                  {opponentLogs.slice(0, 5).map((g, i) => {
                    const game = g.games as any;
                    const dateStr = game?.start_time ? format(new Date(game.start_time), "M/d") : "—";
                    return (
                      <div key={g.id || i} className="grid grid-cols-8 gap-1 text-xs px-3 py-1.5 border-t border-border/20">
                        <span className="col-span-2 text-[10px] font-medium">{dateStr}</span>
                        <span className="text-right font-semibold tabular-nums">{g.points ?? "—"}</span>
                        <span className="text-right tabular-nums">{g.rebounds ?? "—"}</span>
                        <span className="text-right tabular-nums">{g.assists ?? "—"}</span>
                        <span className="text-right tabular-nums">{g.steals ?? "—"}</span>
                        <span className="text-right tabular-nums">{g.blocks ?? "—"}</span>
                        <span className="text-right tabular-nums text-muted-foreground">{g.minutes ?? "—"}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="border-t border-border px-4 py-3">
                  <p className="text-[10px] text-muted-foreground text-center">
                    No past games vs {opponent} this season · Box scores will populate after import
                  </p>
                </div>
              )}

              {nextGame.venue && (
                <div className="border-t border-border px-4 py-2">
                  <p className="text-[10px] text-muted-foreground text-center">📍 {nextGame.venue}</p>
                </div>
              )}
            </div>
          )}

          {statsTab === "stats" && (
            <div className="grid grid-cols-4 gap-2">
              {(() => {
                // Use game log averages if available (only for per-game mode), otherwise fall back to season stats
                const useGameLogs = statMode === "averages" && avgStats && avgStats.games > 0;
                const ss = seasonStats as any;
                const stats = useGameLogs
                  ? [
                      { label: "PTS", val: avgStats!.pts },
                      { label: "REB", val: avgStats!.reb },
                      { label: "AST", val: avgStats!.ast },
                      { label: "FG%", val: avgStats!.fgPct },
                      { label: "3P%", val: avgStats!.threePct },
                      { label: "STL", val: avgStats!.stl },
                      { label: "BLK", val: avgStats!.blk },
                      { label: "MIN", val: avgStats!.min },
                    ]
                  : ss
                  ? [
                      { label: "PTS", val: ss.points_per_game != null ? (statMode === "totals" ? Math.round(ss.points_per_game) : Number(ss.points_per_game).toFixed(1)) : null },
                      { label: "REB", val: ss.rebounds_per_game != null ? (statMode === "totals" ? Math.round(ss.rebounds_per_game) : Number(ss.rebounds_per_game).toFixed(1)) : null },
                      { label: "AST", val: ss.assists_per_game != null ? (statMode === "totals" ? Math.round(ss.assists_per_game) : Number(ss.assists_per_game).toFixed(1)) : null },
                      { label: "FG%", val: ss.fg_pct != null ? Number(ss.fg_pct).toFixed(1) : null },
                      { label: "3P%", val: ss.three_pct != null ? Number(ss.three_pct).toFixed(1) : null },
                      { label: "STL", val: ss.steals_per_game != null ? (statMode === "totals" ? Math.round(ss.steals_per_game) : Number(ss.steals_per_game).toFixed(1)) : null },
                      { label: "BLK", val: ss.blocks_per_game != null ? (statMode === "totals" ? Math.round(ss.blocks_per_game) : Number(ss.blocks_per_game).toFixed(1)) : null },
                      { label: "MIN", val: ss.minutes_per_game != null ? (statMode === "totals" ? Math.round(ss.minutes_per_game) : Number(ss.minutes_per_game).toFixed(1)) : null },
                      ...(statMode === "totals" ? [
                        { label: "GP", val: ss.games_played },
                        { label: "GS", val: ss.games_started },
                        { label: "FG", val: ss.fg_made != null ? `${Math.round(ss.fg_made)}/${Math.round(ss.fg_attempted)}` : null },
                        { label: "FT", val: ss.ft_made != null ? `${Math.round(ss.ft_made)}/${Math.round(ss.ft_attempted)}` : null },
                      ] : [
                        { label: "GP", val: ss.games_played },
                        { label: "FT%", val: ss.ft_pct != null ? Number(ss.ft_pct).toFixed(1) : null },
                        { label: "eFG%", val: ss.effective_fg_pct != null ? Number(ss.effective_fg_pct).toFixed(1) : null },
                        { label: "TOV", val: ss.turnovers_per_game != null ? Number(ss.turnovers_per_game).toFixed(1) : null },
                      ]),
                    ]
                  : [];
                return stats.map(({ label, val }) => (
                  <div key={label} className="cosmic-card rounded-xl p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                    <p className="text-sm font-semibold mt-0.5 tabular-nums">{val ?? "—"}</p>
                  </div>
                ));
              })()}
              <div className="col-span-4 text-center">
                <p className="text-[10px] text-muted-foreground">
                  {avgStats && avgStats.games > 0 && statMode === "averages"
                    ? showOpponent ? `${avgStats.games} games vs ${opponent}` : `${avgStats.games} game${avgStats.games !== 1 ? "s" : ""} sample`
                    : seasonStats ? `Season ${statMode} · ${(seasonStats as any).games_played ?? "—"} games` : "No stats available"
                  }
                </p>
              </div>
            </div>
          )}

          {periodForTab && (
            periodAvgStats ? (
              <div>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { label: "PTS", val: periodAvgStats.pts },
                    { label: "REB", val: periodAvgStats.reb },
                    { label: "AST", val: periodAvgStats.ast },
                    { label: "FG%", val: periodAvgStats.fgPct },
                    { label: "3P%", val: periodAvgStats.threePct },
                    { label: "STL", val: periodAvgStats.stl },
                    { label: "BLK", val: periodAvgStats.blk },
                    { label: "MIN", val: periodAvgStats.min },
                  ].map(({ label, val }) => (
                    <div key={label} className="cosmic-card rounded-xl p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                      <p className="text-sm font-semibold mt-0.5 tabular-nums">{val ?? "—"}</p>
                    </div>
                  ))}
                  <div className="col-span-4 text-center">
                    <p className="text-[10px] text-muted-foreground">
                      {statsTab === "1h" ? "First Half" : "First Quarter"} avg · {periodAvgStats.games} game{periodAvgStats.games !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                {/* Per-game breakdown */}
                <div className="space-y-1">
                  <div className="grid grid-cols-8 gap-1 text-[9px] text-muted-foreground font-semibold uppercase tracking-wider px-2 pb-1">
                    <span className="col-span-2">Date</span>
                    <span className="text-right">PTS</span>
                    <span className="text-right">REB</span>
                    <span className="text-right">AST</span>
                    <span className="text-right">STL</span>
                    <span className="text-right">BLK</span>
                    <span className="text-right">MIN</span>
                  </div>
                  {periodAvgStats.logs.map((g: any, i: number) => {
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
                </div>
              </div>
            ) : (
              <div className="cosmic-card rounded-xl p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  {statsTab === "1h" ? "First Half" : "First Quarter"} splits require per-period box scores. Ingest data via the quarter stats endpoint.
                </p>
              </div>
            )
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
          </>
        )}
      </div>
    </div>
  );
};

export default PlayerPage;
