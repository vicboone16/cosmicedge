import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, TrendingUp, ChevronDown, ChevronUp, BarChart3, Calendar, History as HistoryIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { TeamOddsSection } from "@/components/team/TeamOddsSection";
import { TeamPlayerPropsSection } from "@/components/team/TeamPlayerPropsSection";

const ABBR_TO_FULL: Record<string, string> = {
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons",
  GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
  LAC: "Los Angeles Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
  MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
};

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function getGameOutcomes(
  game: any,
  odds: any[],
  teamAbbr: string,
  teamFullName: string
): { ats: string | null; ou: string | null } {
  if (!game.home_score || !game.away_score) return { ats: null, ou: null };
  const isHome = game.home_abbr === teamAbbr;
  const dateStr = game.start_time.split("T")[0];
  const datesToCheck = [dateStr, shiftDate(dateStr, -1), shiftDate(dateStr, 1)];

  const matching = odds.filter((o) => {
    if (!datesToCheck.includes(o.snapshot_date)) return false;
    if (isHome) return o.home_team === teamFullName || o.home_team?.toLowerCase().includes(teamAbbr.toLowerCase());
    return o.away_team === teamFullName || o.away_team?.toLowerCase().includes(teamAbbr.toLowerCase());
  });

  let ats: string | null = null;
  const spreadOdd = matching.find((o) => o.market_type === "spread" && o.line != null);
  if (spreadOdd) {
    const homeMargin = game.home_score - game.away_score;
    const spreadResult = homeMargin + spreadOdd.line;
    if (isHome) ats = spreadResult > 0 ? "✓" : spreadResult < 0 ? "✗" : "P";
    else ats = spreadResult < 0 ? "✓" : spreadResult > 0 ? "✗" : "P";
  }

  let ou: string | null = null;
  const totalOdd = matching.find((o) => o.market_type === "total" && o.line != null);
  if (totalOdd) {
    const actualTotal = game.home_score + game.away_score;
    if (actualTotal > totalOdd.line) ou = "O";
    else if (actualTotal < totalOdd.line) ou = "U";
    else ou = "P";
  }

  return { ats, ou };
}

const ZODIAC_RANGES = [
  { sign: "Capricorn", symbol: "♑", m1: 1, d1: 1, m2: 1, d2: 19 },
  { sign: "Aquarius", symbol: "♒", m1: 1, d1: 20, m2: 2, d2: 18 },
  { sign: "Pisces", symbol: "♓", m1: 2, d1: 19, m2: 3, d2: 20 },
  { sign: "Aries", symbol: "♈", m1: 3, d1: 21, m2: 4, d2: 19 },
  { sign: "Taurus", symbol: "♉", m1: 4, d1: 20, m2: 5, d2: 20 },
  { sign: "Gemini", symbol: "♊", m1: 5, d1: 21, m2: 6, d2: 20 },
  { sign: "Cancer", symbol: "♋", m1: 6, d1: 21, m2: 7, d2: 22 },
  { sign: "Leo", symbol: "♌", m1: 7, d1: 23, m2: 8, d2: 22 },
  { sign: "Virgo", symbol: "♍", m1: 8, d1: 23, m2: 9, d2: 22 },
  { sign: "Libra", symbol: "♎", m1: 9, d1: 23, m2: 10, d2: 22 },
  { sign: "Scorpio", symbol: "♏", m1: 10, d1: 23, m2: 11, d2: 21 },
  { sign: "Sagittarius", symbol: "♐", m1: 11, d1: 22, m2: 12, d2: 21 },
  { sign: "Capricorn", symbol: "♑", m1: 12, d1: 22, m2: 12, d2: 31 },
];

function getSignFromDate(dateStr: string): { sign: string; symbol: string } {
  const d = new Date(dateStr + "T12:00:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  for (const s of ZODIAC_RANGES) {
    if ((month === s.m1 && day >= s.d1) || (month === s.m2 && day <= s.d2))
      return { sign: s.sign, symbol: s.symbol };
  }
  return { sign: "Capricorn", symbol: "♑" };
}

function StatCell({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="cosmic-card rounded-xl p-2 text-center">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className="text-xs font-semibold mt-0.5">{value ?? "—"}</p>
    </div>
  );
}

const TeamPage = () => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { abbr, league: leagueParam } = useParams();
  const navigate = useNavigate();

  const { data: standings } = useQuery({
    queryKey: ["team-standings", abbr],
    queryFn: async () => {
      let query = supabase
        .from("standings")
        .select("*")
        .eq("team_abbr", abbr!)
        .order("season", { ascending: false })
        .limit(1);
      if (leagueParam) query = query.eq("league", leagueParam.toUpperCase());
      const { data } = await query.maybeSingle();
      return data;
    },
    enabled: !!abbr,
  });

  const { data: players, isLoading: loadingPlayers } = useQuery({
    queryKey: ["team-roster", abbr, standings?.league],
    queryFn: async () => {
      let query = supabase
        .from("players")
        .select("*")
        .eq("team", abbr!)
        .eq("status", "active")
        .order("name");
      if (standings?.league) {
        query = query.eq("league", standings.league);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!abbr,
  });

  // Recent completed games
  const { data: recentGames } = useQuery({
    queryKey: ["team-recent-games", abbr, standings?.league],
    queryFn: async () => {
      const lg = standings?.league || leagueParam?.toUpperCase() || "NBA";
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, home_team, away_team, home_score, away_score, status, start_time, league")
        .eq("league", lg)
        .or(`home_abbr.eq.${abbr},away_abbr.eq.${abbr}`)
        .in("status", ["final", "live", "Final", "Final/OT"])
        .order("start_time", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!abbr,
    refetchInterval: (query) => {
      const games = query.state.data;
      const hasLive = games?.some((g) => g.status === "live");
      return hasLive ? 30_000 : 180_000;
    },
  });

  // Historical odds for outcome badges
  const teamFullName = ABBR_TO_FULL[abbr || ""] || abbr || "";
  const { data: recentOdds } = useQuery({
    queryKey: ["team-recent-odds-badges", teamFullName],
    queryFn: async () => {
      const { data } = await supabase
        .from("historical_odds")
        .select("home_team, away_team, market_type, line, snapshot_date")
        .or(`home_team.eq.${teamFullName},away_team.eq.${teamFullName}`)
        .order("snapshot_date", { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!teamFullName,
  });

  // Upcoming scheduled games — only future
  const { data: upcomingGames } = useQuery({
    queryKey: ["team-upcoming-games", abbr, standings?.league],
    queryFn: async () => {
      const lg = standings?.league || leagueParam?.toUpperCase() || "NBA";
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, home_team, away_team, home_score, away_score, status, start_time, league")
        .eq("league", lg)
        .or(`home_abbr.eq.${abbr},away_abbr.eq.${abbr}`)
        .eq("status", "scheduled")
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(10);
      return data || [];
    },
    enabled: !!abbr,
    refetchInterval: 180_000,
  });

  // Primary source: team_season_pace (authoritative ratings)
  const { data: paceRow } = useQuery({
    queryKey: ["team-pace-profile", abbr, leagueParam],
    queryFn: async () => {
      const lg = standings?.league || leagueParam?.toUpperCase() || "NBA";
      const now = new Date();
      const season = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
      const { data } = await supabase
        .from("team_season_pace")
        .select("*")
        .eq("team_abbr", abbr!)
        .eq("league", lg)
        .eq("season", season)
        .maybeSingle();
      return data;
    },
    enabled: !!abbr,
  });

  // Fallback: team_game_stats for four factors detail
  const { data: advancedStats } = useQuery({
    queryKey: ["team-advanced-stats", abbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_game_stats")
        .select("*")
        .eq("team_abbr", abbr!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!abbr,
  });

  // Compute four factors from game logs (for detailed breakdown)
  const fourFactors = advancedStats && advancedStats.length > 0
    ? (() => {
        const avg = (key: string) => {
          const vals = advancedStats
            .map((r: any) => r[key])
            .filter((v: any) => v !== null && v !== undefined);
          return vals.length ? (vals.reduce((a: number, b: number) => a + b, 0) / vals.length) : null;
        };
        return {
          ts_pct: avg("ts_pct"),
          efg_pct: avg("efg_pct"),
          tov_pct: avg("tov_pct"),
          orb_pct: avg("orb_pct"),
          ft_per_fga: avg("ft_per_fga"),
          opp_efg_pct: avg("opp_efg_pct"),
          opp_tov_pct: avg("opp_tov_pct"),
          opp_orb_pct: avg("opp_orb_pct"),
          opp_ft_per_fga: avg("opp_ft_per_fga"),
          ftr: avg("ftr"),
          three_par: avg("three_par"),
          trb_pct: avg("trb_pct"),
          ast_pct: avg("ast_pct"),
          stl_pct: avg("stl_pct"),
          blk_pct: avg("blk_pct"),
        };
      })()
    : null;

  // Unified season averages: prefer team_season_pace, fallback to team_game_stats
  const seasonAvg = paceRow
    ? {
        games: paceRow.games_played ?? 0,
        ppg: paceRow.avg_points != null ? Number(paceRow.avg_points) : null,
        off_rating: paceRow.off_rating != null ? Number(paceRow.off_rating) : null,
        def_rating: paceRow.def_rating != null ? Number(paceRow.def_rating) : null,
        pace: paceRow.avg_pace != null ? Number(paceRow.avg_pace) : null,
        net_rating: paceRow.net_rating != null ? Number(paceRow.net_rating) : null,
      }
    : advancedStats && advancedStats.length > 0
    ? (() => {
        const n = advancedStats.length;
        const avg = (key: string) => {
          const vals = advancedStats
            .map((r: any) => r[key])
            .filter((v: any) => v !== null && v !== undefined);
          return vals.length ? (vals.reduce((a: number, b: number) => a + b, 0) / vals.length) : null;
        };
        return {
          games: n,
          ppg: avg("points"),
          off_rating: avg("off_rating"),
          def_rating: avg("def_rating"),
          pace: avg("pace"),
          net_rating: null as number | null,
        };
      })()
    : null;

  const teamName = standings?.team_name || players?.[0]?.team || abbr;

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back</span>
        </button>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold font-display">{teamName}</h1>
          {seasonAvg && seasonAvg.net_rating != null && (
            <span className={cn(
              "text-xs font-bold px-2 py-1 rounded-lg",
              seasonAvg.net_rating > 0 ? "bg-cosmic-green/15 text-cosmic-green" : "bg-cosmic-red/15 text-cosmic-red"
            )}>
              {seasonAvg.net_rating > 0 ? "+" : ""}{seasonAvg.net_rating.toFixed(1)} NRtg
            </span>
          )}
        </div>
        {standings && (
          <p className="text-xs text-muted-foreground mt-1">
            {standings.wins}W – {standings.losses}L · {standings.conference} · Seed #{standings.playoff_seed || "—"}
          </p>
        )}
        {/* Last 10 W/L indicator */}
        {recentGames && recentGames.length > 0 && (
          <div className="flex items-center gap-0.5 mt-2">
            <span className="text-[9px] text-muted-foreground mr-1">L{Math.min(recentGames.length, 10)}</span>
            {recentGames.slice(0, 10).reverse().map((g, i) => {
              const isHome = g.home_abbr === abbr;
              const won = isHome ? (g.home_score ?? 0) > (g.away_score ?? 0) : (g.away_score ?? 0) > (g.home_score ?? 0);
              return (
                <div
                  key={i}
                  className={cn(
                    "h-3 w-3 rounded-sm text-[7px] font-bold flex items-center justify-center",
                    won ? "bg-cosmic-green/20 text-cosmic-green" : "bg-cosmic-red/20 text-cosmic-red"
                  )}
                >
                  {won ? "W" : "L"}
                </div>
              );
            })}
          </div>
        )}
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Stats */}
        {standings && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Season Record
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="cosmic-card rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Home</p>
                <p className="text-sm font-semibold mt-1">{standings.home_record || "—"}</p>
              </div>
              <div className="cosmic-card rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Away</p>
                <p className="text-sm font-semibold mt-1">{standings.away_record || "—"}</p>
              </div>
              <div className="cosmic-card rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Streak</p>
                <p className="text-sm font-semibold mt-1">{standings.streak || "—"}</p>
              </div>
            </div>
          </section>
        )}

        {/* Team Stats (Season Avg) */}
        {seasonAvg && (
          <section>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between py-2 group"
            >
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Team Stats · Avg ({seasonAvg.games} games)
              </h3>
              {showAdvanced ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              )}
            </button>

            {/* Always show core metrics */}
            <div className="grid grid-cols-4 gap-2 mt-2">
              <StatCell label={`PPG (${seasonAvg.games}g)`} value={seasonAvg.ppg?.toFixed(1)} />
              <StatCell label="ORtg" value={seasonAvg.off_rating?.toFixed(1)} />
              <StatCell label="DRtg" value={seasonAvg.def_rating?.toFixed(1)} />
              <StatCell label="Pace" value={seasonAvg.pace?.toFixed(1)} />
            </div>

            {/* Net Rating row */}
            {seasonAvg.net_rating != null && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <StatCell label="NRtg" value={seasonAvg.net_rating.toFixed(1)} />
                <StatCell label="PPG Allowed" value={
                  seasonAvg.off_rating != null && seasonAvg.def_rating != null && seasonAvg.pace != null
                    ? (seasonAvg.def_rating * seasonAvg.pace / 100).toFixed(1)
                    : null
                } />
              </div>
            )}

            {showAdvanced && fourFactors && (
              <div className="space-y-3 mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Shooting */}
                <div className="grid grid-cols-4 gap-2">
                  <StatCell label="TS%" value={fourFactors.ts_pct != null ? (fourFactors.ts_pct * 100).toFixed(1) + "%" : null} />
                  <StatCell label="eFG%" value={fourFactors.efg_pct != null ? (fourFactors.efg_pct * 100).toFixed(1) + "%" : null} />
                  <StatCell label="FTr" value={fourFactors.ftr?.toFixed(3)} />
                  <StatCell label="3PAr" value={fourFactors.three_par?.toFixed(3)} />
                </div>

                {/* Offensive Four Factors */}
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" />
                  Offensive Four Factors
                </h4>
                <div className="grid grid-cols-4 gap-2">
                  <StatCell label="Off eFG%" value={
                    paceRow?.off_efg_pct != null ? (Number(paceRow.off_efg_pct) * 100).toFixed(1) + "%" 
                    : fourFactors.efg_pct != null ? (fourFactors.efg_pct * 100).toFixed(1) + "%" : null
                  } />
                  <StatCell label="Off TOV%" value={
                    paceRow?.off_tov_pct != null ? Number(paceRow.off_tov_pct).toFixed(1)
                    : fourFactors.tov_pct?.toFixed(1)
                  } />
                  <StatCell label="ORB%" value={fourFactors.orb_pct?.toFixed(1)} />
                  <StatCell label="FT/FGA" value={fourFactors.ft_per_fga?.toFixed(3)} />
                </div>

                {/* Defensive Four Factors */}
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" />
                  Defensive Four Factors
                </h4>
                <div className="grid grid-cols-4 gap-2">
                  <StatCell label="Def eFG%" value={
                    paceRow?.def_efg_pct != null ? (Number(paceRow.def_efg_pct) * 100).toFixed(1) + "%"
                    : fourFactors.opp_efg_pct != null ? (fourFactors.opp_efg_pct * 100).toFixed(1) + "%" : null
                  } />
                  <StatCell label="Def TOV%" value={
                    paceRow?.def_tov_pct != null ? Number(paceRow.def_tov_pct).toFixed(1)
                    : fourFactors.opp_tov_pct?.toFixed(1)
                  } />
                  <StatCell label="Opp ORB%" value={fourFactors.opp_orb_pct?.toFixed(1)} />
                  <StatCell label="Opp FT/FGA" value={fourFactors.opp_ft_per_fga?.toFixed(3)} />
                </div>

                {/* Other Advanced */}
                <div className="grid grid-cols-4 gap-2">
                  <StatCell label="TRB%" value={fourFactors.trb_pct?.toFixed(1)} />
                  <StatCell label="AST%" value={fourFactors.ast_pct?.toFixed(1)} />
                  <StatCell label="STL%" value={fourFactors.stl_pct?.toFixed(1)} />
                  <StatCell label="BLK%" value={fourFactors.blk_pct?.toFixed(1)} />
                </div>
              </div>
            )}
          </section>
        )}

        {/* Odds & Records */}
        <TeamOddsSection abbr={abbr!} league={standings?.league || leagueParam?.toUpperCase() || "NBA"} />

        {/* Player Props for upcoming game */}
        <TeamPlayerPropsSection abbr={abbr!} league={standings?.league || leagueParam?.toUpperCase() || "NBA"} />

        {/* Upcoming Games */}
        {upcomingGames && upcomingGames.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Upcoming Games
            </h3>
            <div className="space-y-1">
              {upcomingGames.map(g => {
                const isHome = g.home_abbr === abbr;
                const opp = isHome ? g.away_abbr : g.home_abbr;
                const dateStr = new Date(g.start_time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                const timeStr = new Date(g.start_time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                return (
                  <button
                    key={g.id}
                    onClick={() => navigate(`/game/${g.id}`)}
                    className="w-full cosmic-card rounded-lg p-2 text-left hover:border-primary/30 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-12">{dateStr}</span>
                      <span className="text-[10px] text-muted-foreground">{isHome ? "vs" : "@"}</span>
                      <span className="text-xs font-semibold text-primary">{opp}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{timeStr}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent Games — compact */}
        {recentGames && recentGames.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <HistoryIcon className="h-3.5 w-3.5" />
              Recent Games
            </h3>
            <div className="space-y-1">
              {recentGames.map(g => {
                const isHome = g.home_abbr === abbr;
                const opp = isHome ? g.away_abbr : g.home_abbr;
                const dateStr = new Date(g.start_time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                const outcomes = getGameOutcomes(g, recentOdds || [], abbr!, teamFullName);
                const teamScore = isHome ? g.home_score : g.away_score;
                const oppScore = isHome ? g.away_score : g.home_score;
                const won = (teamScore ?? 0) > (oppScore ?? 0);
                const isLive = g.status === "live";

                return (
                  <button
                    key={g.id}
                    onClick={() => navigate(`/game/${g.id}`)}
                    className={cn(
                      "w-full cosmic-card rounded-lg p-2 text-left hover:border-primary/30 transition-colors",
                      isLive && "border-l-2 border-l-cosmic-green"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-muted-foreground w-10">{dateStr}</span>
                        <span className="text-[10px] text-muted-foreground">{isHome ? "vs" : "@"}</span>
                        <span className="text-xs font-semibold text-foreground w-8">{opp}</span>
                        <span className="text-xs font-bold tabular-nums ml-2">
                          {teamScore ?? 0}-{oppScore ?? 0}
                        </span>
                        <span className={cn(
                          "text-[10px] font-bold ml-1",
                          won ? "text-cosmic-green" : "text-cosmic-red"
                        )}>
                          {won ? "W" : "L"}
                        </span>
                        {isLive && <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse" />}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {outcomes.ats && (
                          <span className={cn(
                            "text-[9px] font-bold px-1 rounded",
                            outcomes.ats === "✓" ? "bg-cosmic-green/10 text-cosmic-green" : 
                            outcomes.ats === "✗" ? "bg-cosmic-red/10 text-cosmic-red" : "bg-muted text-muted-foreground"
                          )}>
                            ATS {outcomes.ats}
                          </span>
                        )}
                        {outcomes.ou && (
                          <span className={cn(
                            "text-[9px] font-bold px-1 rounded",
                            outcomes.ou === "O" ? "bg-cosmic-green/10 text-cosmic-green" : 
                            outcomes.ou === "U" ? "bg-cosmic-red/10 text-cosmic-red" : "bg-muted text-muted-foreground"
                          )}>
                            {outcomes.ou}
                          </span>
                        )}
                        <span className="text-[8px] text-muted-foreground uppercase ml-1">
                          {isLive ? "Live" : "Final"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Roster */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Roster
          </h3>
          <div className="space-y-1">
            {loadingPlayers ? (
              <p className="text-xs text-muted-foreground text-center py-4">Loading roster...</p>
            ) : !players || players.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No roster data available.</p>
            ) : (
              players.map(p => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/player/${p.id}`)}
                  className="w-full cosmic-card rounded-lg p-2 flex items-center gap-3 hover:border-primary/30 transition-colors text-left"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    {p.headshot_url && <AvatarImage src={p.headshot_url} alt={p.name} />}
                    <AvatarFallback className="text-[10px] bg-secondary">{p.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.position || "—"}</p>
                  </div>
                  {p.birth_date && (
                    <div className="flex items-center gap-1 bg-secondary/50 px-1.5 py-0.5 rounded-full">
                      <span className="text-[10px]">{getSignFromDate(p.birth_date).symbol}</span>
                      <span className="text-[9px] text-muted-foreground font-medium">{getSignFromDate(p.birth_date).sign}</span>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default TeamPage;
