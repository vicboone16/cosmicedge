import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { GameRoster } from "@/hooks/use-game-roster";
import { expandTeamAbbrForQuery } from "@/lib/team-abbr-normalize";
import { Users, RefreshCw } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useState, useMemo } from "react";
import { toast } from "sonner";

// Zodiac utilities for lineup display
const ZODIAC_SIGNS_LOOKUP = [
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

function getZodiacForDate(dateStr: string): { sign: string; symbol: string } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T12:00:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  for (const s of ZODIAC_SIGNS_LOOKUP) {
    if ((month === s.m1 && day >= s.d1) || (month === s.m2 && day <= s.d2))
      return { sign: s.sign, symbol: s.symbol };
  }
  return { sign: "Capricorn", symbol: "♑" };
}

export function GameMatchupTab({
  gameId,
  homeAbbr,
  awayAbbr,
  homeTeam,
  awayTeam,
  league = "NBA",
  canonicalRoster,
}: {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  homeTeam: string;
  awayTeam: string;
  league?: string;
  canonicalRoster?: GameRoster;
}) {
  // Fetch standings
  const { data: standings } = useQuery({
    queryKey: ["matchup-standings", homeAbbr, awayAbbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("nba_standings")
        .select("*")
        .in("team_abbr", [homeAbbr, awayAbbr])
        .order("season", { ascending: false })
        .limit(2);
      return data || [];
    },
  });

  // Compute records directly from games table for reliability
  // Filter to current season only (Oct start)
  const { data: computedRecords } = useQuery({
    queryKey: ["matchup-computed-records", homeAbbr, awayAbbr],
    queryFn: async () => {
      const now = new Date();
      const seasonStartYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
      const seasonStart = `${seasonStartYear}-10-01T00:00:00Z`;

      const { data: games } = await supabase
        .from("games")
        .select("home_abbr, away_abbr, home_score, away_score, start_time")
        .eq("league", league)
        .eq("status", "final")
        .gte("start_time", seasonStart)
        .or(`home_abbr.in.(${homeAbbr},${awayAbbr}),away_abbr.in.(${homeAbbr},${awayAbbr})`)
        .order("start_time", { ascending: false });

      if (!games?.length) return {};

      const compute = (abbr: string) => {
        const teamGames = games.filter(g => g.home_abbr === abbr || g.away_abbr === abbr);
        let wins = 0, losses = 0, homeW = 0, homeL = 0, roadW = 0, roadL = 0;
        
        for (const g of teamGames) {
          if (g.home_score == null || g.away_score == null) continue;
          const isHome = g.home_abbr === abbr;
          const won = isHome ? g.home_score > g.away_score : g.away_score > g.home_score;
          if (won) { wins++; if (isHome) homeW++; else roadW++; }
          else { losses++; if (isHome) homeL++; else roadL++; }
        }

        // Streak
        let streak = "";
        let streakCount = 0;
        let streakType = "";
        for (const g of teamGames) {
          if (g.home_score == null || g.away_score == null) continue;
          const isHome = g.home_abbr === abbr;
          const won = isHome ? g.home_score > g.away_score : g.away_score > g.home_score;
          const type = won ? "W" : "L";
          if (!streakType) { streakType = type; streakCount = 1; }
          else if (type === streakType) { streakCount++; }
          else break;
        }
        streak = streakCount > 0 ? `${streakType}${streakCount}` : "—";

        // Last 10
        const last10Games = teamGames.slice(0, 10);
        let l10w = 0, l10l = 0;
        for (const g of last10Games) {
          if (g.home_score == null || g.away_score == null) continue;
          const isHome = g.home_abbr === abbr;
          const won = isHome ? g.home_score > g.away_score : g.away_score > g.home_score;
          if (won) l10w++; else l10l++;
        }

        return { wins, losses, homeW, homeL, roadW, roadL, streak, last10: `${l10w}-${l10l}` };
      };

      return { [homeAbbr]: compute(homeAbbr), [awayAbbr]: compute(awayAbbr) };
    },
  });

  // Build records from computed data (fallback to standings)
  const buildRecord = (abbr: string) => {
    const computed = computedRecords?.[abbr];
    const standing = standings?.find(s => s.team_abbr === abbr);
    
    if (computed && computed.wins > 0) return computed;
    if (standing) {
      return {
        wins: standing.wins ?? 0,
        losses: standing.losses ?? 0,
        homeW: standing.home_wins ?? 0,
        homeL: standing.home_losses ?? 0,
        roadW: standing.road_wins ?? 0,
        roadL: standing.road_losses ?? 0,
        streak: standing.streak || "—",
        last10: standing.last_10 || "—",
      };
    }
    return null;
  };

  const homeRec = buildRecord(homeAbbr);
  const awayRec = buildRecord(awayAbbr);

  const records = [
    { label: "Overall", home: homeRec ? `${homeRec.wins}-${homeRec.losses}` : "—", away: awayRec ? `${awayRec.wins}-${awayRec.losses}` : "—" },
    { label: "Home", home: homeRec ? `${homeRec.homeW}-${homeRec.homeL}` : "—", away: awayRec ? `${awayRec.homeW}-${awayRec.homeL}` : "—" },
    { label: "Away", home: homeRec ? `${homeRec.roadW}-${homeRec.roadL}` : "—", away: awayRec ? `${awayRec.roadW}-${awayRec.roadL}` : "—" },
    { label: "Streak", home: homeRec?.streak || "—", away: awayRec?.streak || "—" },
    { label: "Last 10", home: homeRec?.last10 || "—", away: awayRec?.last10 || "—" },
  ];

  // Compute advanced stats from player_game_stats (current season only)
  const { data: advancedStats } = useQuery({
    queryKey: ["matchup-advanced", homeAbbr, awayAbbr],
    queryFn: async () => {
      const now = new Date();
      const seasonStartYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
      const seasonStart = `${seasonStartYear}-10-01T00:00:00Z`;

      // Get current-season game IDs for these teams
      const { data: seasonGames } = await supabase
        .from("games")
        .select("id")
        .eq("league", league)
        .eq("status", "final")
        .gte("start_time", seasonStart)
        .or(`home_abbr.in.(${homeAbbr},${awayAbbr}),away_abbr.in.(${homeAbbr},${awayAbbr})`);

      if (!seasonGames?.length) return {};
      const gameIds = seasonGames.map(g => g.id);

      // Fetch in batches of 500 game IDs
      const allData: any[] = [];
      for (let i = 0; i < gameIds.length; i += 200) {
        const batch = gameIds.slice(i, i + 200);
        const { data } = await supabase
          .from("player_game_stats")
          .select("team_abbr, game_id, points, rebounds, assists, steals, blocks, turnovers, fg_made, fg_attempted, three_made, three_attempted, ft_made, ft_attempted, off_rebounds, minutes")
          .in("team_abbr", [homeAbbr, awayAbbr])
          .in("game_id", batch)
          .eq("period", "full");
        if (data) allData.push(...data);
      }

      const data = allData;

      if (!data?.length) return {};

      const computeTeam = (abbr: string) => {
        const rows = data.filter(r => r.team_abbr === abbr);
        if (!rows.length) return null;

        // Group by game
        const byGame = new Map<string, typeof rows>();
        for (const r of rows) {
          if (!byGame.has(r.game_id)) byGame.set(r.game_id, []);
          byGame.get(r.game_id)!.push(r);
        }

        const gameCount = byGame.size;
        let totalPts = 0, totalFGA = 0, totalFGM = 0, total3A = 0, total3M = 0;
        let totalFTA = 0, totalFTM = 0, totalORB = 0, totalTOV = 0;

        let gamesWithShotData = 0;
        let effPts = 0, effFGA = 0, effFGM = 0, eff3A = 0, eff3M = 0, effFTA = 0;

        for (const [, players] of byGame) {
          let gameFGA = 0;
          let gameHasShotData = false;
          for (const p of players) {
            totalPts += p.points ?? 0;
            totalFGA += p.fg_attempted ?? 0;
            totalFGM += p.fg_made ?? 0;
            total3A += p.three_attempted ?? 0;
            total3M += p.three_made ?? 0;
            totalFTA += p.ft_attempted ?? 0;
            totalFTM += p.ft_made ?? 0;
            totalORB += p.off_rebounds ?? 0;
            totalTOV += p.turnovers ?? 0;
            if (p.fg_attempted != null && p.fg_attempted > 0) {
              gameHasShotData = true;
              gameFGA += p.fg_attempted;
            }
          }
          // Only count games with actual shot data for efficiency metrics
          if (gameHasShotData) {
            gamesWithShotData++;
            for (const p of players) {
              effPts += p.points ?? 0;
              effFGA += p.fg_attempted ?? 0;
              effFGM += p.fg_made ?? 0;
              eff3A += p.three_attempted ?? 0;
              eff3M += p.three_made ?? 0;
              effFTA += p.ft_attempted ?? 0;
            }
          }
        }

        const ppg = totalPts / gameCount;
        // Pace estimate: FGA + 0.44*FTA - ORB + TOV per game
        const possPerGame = (totalFGA + 0.44 * totalFTA - totalORB + totalTOV) / gameCount;
        const ortg = possPerGame > 0 ? (totalPts / gameCount) / possPerGame * 100 : null;
        // TS% = PTS / (2 * (FGA + 0.44 * FTA)) — only from games with shot data
        const tsa = 2 * (effFGA + 0.44 * effFTA);
        const ts = tsa > 0 ? (effPts / tsa * 100) : null;
        // eFG% = (FGM + 0.5 * 3PM) / FGA
        const efg = effFGA > 0 ? ((effFGM + 0.5 * eff3M) / effFGA * 100) : null;
        // TOV% = TOV / (FGA + 0.44*FTA + TOV)
        const tovDenom = totalFGA + 0.44 * totalFTA + totalTOV;
        const tovPct = tovDenom > 0 ? (totalTOV / tovDenom * 100) : null;

        return { games: gameCount, ppg, pace: possPerGame, ortg, ts, efg, tovPct };
      };

      return { [homeAbbr]: computeTeam(homeAbbr), [awayAbbr]: computeTeam(awayAbbr) };
    },
  });

  // Also try team_season_pace for DRTG and Pace
  const { data: paceData } = useQuery({
    queryKey: ["matchup-pace", homeAbbr, awayAbbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_season_pace")
        .select("team_abbr, avg_pace, avg_points, avg_points_allowed, off_rating, def_rating, net_rating, games_played, ts_pct, efg_pct, off_efg_pct, def_efg_pct, tov_pct, off_tov_pct, def_tov_pct")
        .in("team_abbr", [homeAbbr, awayAbbr])
        .eq("league", league)
        .order("season", { ascending: false })
        .limit(2);
      return data || [];
    },
  });

  const getTeamStats = (abbr: string) => {
    const adv = advancedStats?.[abbr];
    const pace = paceData?.find(p => p.team_abbr === abbr);

    // Sanity check: if pace data has ORTG > 150 or pace < 50, it's corrupt — ignore it
    const paceIsValid = pace && Number(pace.off_rating) <= 150 && Number(pace.off_rating) >= 80 && Number(pace.avg_pace) >= 50;

    // Sanity-bound helper: reject values outside realistic NBA ranges (returns null if corrupt)
    const clamp = (val: number | null, min: number, max: number) => {
      if (val == null || typeof val !== "number" || isNaN(val)) return null;
      if (val < min || val > max) return null; // treat as corrupt
      return val;
    };

    // Net rating should also be clamped
    const netRtg = (ortg: number | null, drtg: number | null) => {
      if (ortg == null || drtg == null) return null;
      const net = ortg - drtg;
      // NBA net ratings should be between -25 and +25
      if (net < -25 || net > 25) return null;
      return net;
    };

    const ortgVal = clamp(paceIsValid ? Number(pace.off_rating) : null, 80, 140) ?? clamp(adv?.ortg ?? null, 80, 140);
    const drtgVal = clamp(paceIsValid ? Number(pace.def_rating) : null, 80, 140) ?? null;

    // Prioritize team_season_pace (manually curated) over computed stats
    return {
      ppg: clamp(paceIsValid && pace.avg_points != null ? Number(pace.avg_points) : null, 70, 140) ?? clamp(adv?.ppg ?? null, 70, 140),
      ortg: ortgVal,
      drtg: drtgVal,
      netRtg: paceIsValid && pace.net_rating != null ? clamp(Number(pace.net_rating), -25, 25) : netRtg(ortgVal, drtgVal),
      pace: clamp(paceIsValid ? Number(pace.avg_pace) : null, 85, 115) ?? clamp(adv?.pace ?? null, 85, 115),
      ts: clamp(pace?.ts_pct != null ? Number(pace.ts_pct) * 100 : null, 40, 70) ?? clamp(adv?.ts ?? null, 40, 70),
      efg: clamp(pace?.efg_pct != null ? Number(pace.efg_pct) * 100 : null, 35, 65) ?? clamp(adv?.efg ?? null, 35, 65),
      offEfg: pace?.off_efg_pct != null ? clamp(Number(pace.off_efg_pct), 0.35, 0.65) : null,
      defEfg: pace?.def_efg_pct != null ? clamp(Number(pace.def_efg_pct), 0.35, 0.65) : null,
      tovPct: clamp(pace?.tov_pct != null ? Number(pace.tov_pct) : null, 5, 25) ?? clamp(adv?.tovPct ?? null, 5, 25),
      offTov: pace?.off_tov_pct != null ? clamp(Number(pace.off_tov_pct), 5, 25) : null,
      defTov: pace?.def_tov_pct != null ? clamp(Number(pace.def_tov_pct), 5, 25) : null,
      games: (paceIsValid ? pace.games_played : null) ?? adv?.games ?? 0,
    };
  };

  const homeStats = getTeamStats(homeAbbr);
  const awayStats = getTeamStats(awayAbbr);

  const hasAnyStats = homeStats.ppg != null || awayStats.ppg != null;

  const statComparisons = hasAnyStats ? [
    { label: "PPG", home: homeStats.ppg?.toFixed(1), away: awayStats.ppg?.toFixed(1) },
    { label: "ORTG", home: homeStats.ortg?.toFixed(1), away: awayStats.ortg?.toFixed(1) },
    { label: "DRTG", home: homeStats.drtg?.toFixed(1), away: awayStats.drtg?.toFixed(1), lower: true },
    { label: "NET RTG", home: homeStats.netRtg?.toFixed(1), away: awayStats.netRtg?.toFixed(1) },
    { label: "PACE", home: homeStats.pace?.toFixed(1), away: awayStats.pace?.toFixed(1) },
    { label: "TS%", home: homeStats.ts?.toFixed(1), away: awayStats.ts?.toFixed(1) },
    { label: "EFG%", home: homeStats.efg?.toFixed(1), away: awayStats.efg?.toFixed(1) },
    { label: "Off eFG%", home: homeStats.offEfg != null ? (homeStats.offEfg * 100).toFixed(1) : null, away: awayStats.offEfg != null ? (awayStats.offEfg * 100).toFixed(1) : null },
    { label: "Def eFG%", home: homeStats.defEfg != null ? (homeStats.defEfg * 100).toFixed(1) : null, away: awayStats.defEfg != null ? (awayStats.defEfg * 100).toFixed(1) : null, lower: true },
    { label: "TOV%", home: homeStats.tovPct?.toFixed(1), away: awayStats.tovPct?.toFixed(1), lower: true },
    { label: "Off TOV%", home: homeStats.offTov?.toFixed(1), away: awayStats.offTov?.toFixed(1), lower: true },
    { label: "Def TOV%", home: homeStats.defTov?.toFixed(1), away: awayStats.defTov?.toFixed(1) },
  ].filter(s => s.home != null || s.away != null) : [];

  const gameCountLabel = homeStats.games && awayStats.games
    ? `${homeStats.games}G vs ${awayStats.games}G season avg`
    : homeStats.games ? `${homeStats.games}G season avg` : awayStats.games ? `${awayStats.games}G season avg` : "";

  const navigate = useNavigate();

  // Use canonical roster if provided, otherwise fallback to direct depth_charts query
  const { data: fallbackLineups, isLoading: fallbackLineupsLoading, refetch: refetchFallbackLineups } = useQuery({
    queryKey: ["game-lineups", homeAbbr, awayAbbr],
    queryFn: async () => {
      const { data } = await supabase
        .from("depth_charts")
        .select("player_name, team_abbr, position, depth_order, player_id, external_player_id")
        .in("team_abbr", [homeAbbr, awayAbbr])
        .eq("league", league)
        .order("depth_order", { ascending: true })
        .order("position", { ascending: true });
      return data || [];
    },
    enabled: !canonicalRoster, // skip if canonical roster is provided
  });

  // Convert canonical roster to lineup format
  const lineups = useMemo(() => {
    if (canonicalRoster) {
      return [...canonicalRoster.away, ...canonicalRoster.home].map(p => ({
        player_name: p.name,
        team_abbr: p.team,
        position: p.position,
        depth_order: p.source === "players" ? 1 : 2,
        player_id: p.id,
        external_player_id: null as string | null,
      }));
    }
    return fallbackLineups || [];
  }, [canonicalRoster, fallbackLineups]);
  const lineupsLoading = !canonicalRoster && fallbackLineupsLoading;
  const refetchLineups = refetchFallbackLineups;

  // Fetch birth dates for lineup players to show zodiac signs
  const lineupPlayerIds = useMemo(() => (lineups || []).map(l => l.player_id).filter(Boolean) as string[], [lineups]);
  const { data: lineupBirthDates } = useQuery({
    queryKey: ["lineup-birth-dates", lineupPlayerIds],
    queryFn: async () => {
      if (lineupPlayerIds.length === 0) return {};
      const { data } = await supabase
        .from("players")
        .select("id, birth_date")
        .in("id", lineupPlayerIds);
      const map: Record<string, string> = {};
      for (const p of data || []) {
        if (p.birth_date) map[p.id] = p.birth_date;
      }
      return map;
    },
    enabled: lineupPlayerIds.length > 0,
  });

  const [fetchingLineups, setFetchingLineups] = useState(false);
  const handleFetchLineups = async () => {
    setFetchingLineups(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-bdl-lineups`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (res.ok) {
        toast.success("Lineups refreshed");
        refetchLineups();
      } else {
        toast.error("Failed to fetch lineups");
      }
    } catch {
      toast.error("Failed to fetch lineups");
    }
    setFetchingLineups(false);
  };

  const homeLineup = lineups?.filter(p => p.team_abbr === homeAbbr) || [];
  const awayLineup = lineups?.filter(p => p.team_abbr === awayAbbr) || [];
  const homeStarters = homeLineup.filter(p => p.depth_order === 1);
  const awayStarters = awayLineup.filter(p => p.depth_order === 1);
  const homeBench = homeLineup.filter(p => p.depth_order > 1);
  const awayBench = awayLineup.filter(p => p.depth_order > 1);
  const hasLineups = homeLineup.length > 0 || awayLineup.length > 0;

  const PlayerRow = ({ player }: { player: typeof homeLineup[number] }) => {
    const birthDate = player.player_id ? lineupBirthDates?.[player.player_id] : null;
    const zodiac = birthDate ? getZodiacForDate(birthDate) : null;
    return (
      <button
        onClick={() => {
          if (player.player_id) navigate(`/player/${player.player_id}`);
        }}
        className="flex items-center gap-2 py-1.5 w-full text-left hover:bg-secondary/40 rounded-lg px-2 transition-colors"
      >
        <Avatar className="h-6 w-6 shrink-0">
          <AvatarFallback className="text-[8px] bg-secondary">
            {zodiac ? zodiac.symbol : player.player_name?.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground truncate">
            {player.player_name}
            {zodiac && (
              <span className="text-[9px] text-primary/70 ml-1">{zodiac.symbol}</span>
            )}
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono shrink-0">{player.position}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Starting Lineups */}
      <div className="cosmic-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" />
            Starting Lineups
          </h3>
          <button
            onClick={handleFetchLineups}
            disabled={fetchingLineups}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <RefreshCw className={cn("h-3 w-3", fetchingLineups && "animate-spin")} />
            Refresh
          </button>
        </div>

        {lineupsLoading ? (
          <p className="text-xs text-muted-foreground text-center py-6">Loading lineups…</p>
        ) : !hasLineups ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-xs text-muted-foreground">Starting lineups are still being confirmed.</p>
            <p className="text-[10px] text-muted-foreground/60">Lineups typically populate closer to game time.</p>
            <button
              onClick={handleFetchLineups}
              disabled={fetchingLineups}
              className="text-xs text-primary hover:underline"
            >
              {fetchingLineups ? "Fetching…" : "Refresh lineups"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-border">
            {/* Away Team */}
            <div className="p-3 space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">{awayAbbr}</p>
              {awayStarters.length > 0 ? (
                <div>
                  <p className="text-[9px] text-primary font-semibold uppercase tracking-wider mb-1">Starters</p>
                  {awayStarters.map(p => <PlayerRow key={p.player_name + p.position} player={p} />)}
                </div>
              ) : awayLineup.length === 0 ? (
                <p className="text-[9px] text-muted-foreground text-center py-4">Roster data still loading for {awayAbbr}.</p>
              ) : null}
              {awayBench.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-1 mt-2">Bench</p>
                  {awayBench.slice(0, 5).map(p => <PlayerRow key={p.player_name + p.position} player={p} />)}
                </div>
              )}
            </div>
            {/* Home Team */}
            <div className="p-3 space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">{homeAbbr}</p>
              {homeStarters.length > 0 ? (
                <div>
                  <p className="text-[9px] text-primary font-semibold uppercase tracking-wider mb-1">Starters</p>
                  {homeStarters.map(p => <PlayerRow key={p.player_name + p.position} player={p} />)}
                </div>
              ) : homeLineup.length === 0 ? (
                <p className="text-[9px] text-muted-foreground text-center py-4">Roster data still loading for {homeAbbr}.</p>
              ) : null}
              {homeBench.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-1 mt-2">Bench</p>
                  {homeBench.slice(0, 5).map(p => <PlayerRow key={p.player_name + p.position} player={p} />)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Team Records */}
      <div className="cosmic-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-bold text-foreground">{awayAbbr}</span>
          <span className="text-xs font-semibold text-muted-foreground">Team Records</span>
          <span className="text-xs font-bold text-foreground">{homeAbbr}</span>
        </div>
        {records.map(r => (
          <div key={r.label} className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 last:border-b-0">
            <span className="text-xs font-semibold text-foreground tabular-nums">{r.away}</span>
            <span className="text-[10px] text-muted-foreground">{r.label}</span>
            <span className="text-xs font-semibold text-foreground tabular-nums">{r.home}</span>
          </div>
        ))}
      </div>

      {/* Team Stats */}
      {statComparisons.length > 0 && (
        <div className="cosmic-card rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-xs font-bold text-foreground">{awayAbbr}</span>
            <span className="text-xs font-semibold text-muted-foreground">Team Stats</span>
            <span className="text-xs font-bold text-foreground">{homeAbbr}</span>
          </div>
          {statComparisons.map(s => {
            const hVal = s.home != null ? parseFloat(s.home) : null;
            const aVal = s.away != null ? parseFloat(s.away) : null;
            const homeWins = hVal != null && aVal != null
              ? (s.lower ? hVal < aVal : hVal > aVal)
              : false;
            const awayWins = hVal != null && aVal != null && !homeWins && hVal !== aVal;

            return (
              <div key={s.label} className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 last:border-b-0">
                <span className={cn("text-xs tabular-nums font-semibold", awayWins && "text-cosmic-green")}>
                  {s.away ?? "—"}
                </span>
                <div className="flex-1 mx-3">
                  <div className="flex items-center gap-1">
                    <div className={cn("h-1 rounded-full flex-1", awayWins ? "bg-cosmic-green" : "bg-cosmic-red/30")} />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{s.label}</span>
                    <div className={cn("h-1 rounded-full flex-1", homeWins ? "bg-cosmic-green" : "bg-cosmic-red/30")} />
                  </div>
                </div>
                <span className={cn("text-xs tabular-nums font-semibold", homeWins && "text-cosmic-green")}>
                  {s.home ?? "—"}
                </span>
              </div>
            );
          })}
          {gameCountLabel && (
            <div className="px-4 py-2 text-center">
              <span className="text-[9px] text-muted-foreground">{gameCountLabel}</span>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
