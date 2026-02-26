import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function GameMatchupTab({
  gameId,
  homeAbbr,
  awayAbbr,
  homeTeam,
  awayTeam,
  league = "NBA",
}: {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  homeTeam: string;
  awayTeam: string;
  league?: string;
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

        for (const [, players] of byGame) {
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
          }
        }

        const ppg = totalPts / gameCount;
        // Pace estimate: FGA + 0.44*FTA - ORB + TOV per game
        const possPerGame = (totalFGA + 0.44 * totalFTA - totalORB + totalTOV) / gameCount;
        const ortg = possPerGame > 0 ? (totalPts / gameCount) / possPerGame * 100 : null;
        // TS% = PTS / (2 * (FGA + 0.44 * FTA))
        const tsa = 2 * (totalFGA + 0.44 * totalFTA);
        const ts = tsa > 0 ? (totalPts / tsa * 100) : null;
        // eFG% = (FGM + 0.5 * 3PM) / FGA
        const efg = totalFGA > 0 ? ((totalFGM + 0.5 * total3M) / totalFGA * 100) : null;
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
        .select("team_abbr, avg_pace, off_rating, def_rating, net_rating, games_played")
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
    const paceIsValid = pace && Number(pace.off_rating) <= 150 && Number(pace.avg_pace) >= 50;

    return {
      ppg: adv?.ppg ?? null,
      ortg: (paceIsValid ? Number(pace.off_rating) : null) ?? adv?.ortg ?? null,
      drtg: (paceIsValid ? Number(pace.def_rating) : null) ?? null,
      pace: (paceIsValid ? Number(pace.avg_pace) : null) ?? adv?.pace ?? null,
      ts: adv?.ts ?? null,
      efg: adv?.efg ?? null,
      tovPct: adv?.tovPct ?? null,
      games: adv?.games ?? pace?.games_played ?? 0,
    };
  };

  const homeStats = getTeamStats(homeAbbr);
  const awayStats = getTeamStats(awayAbbr);

  const hasAnyStats = homeStats.ppg != null || awayStats.ppg != null;

  const statComparisons = hasAnyStats ? [
    { label: "PPG", home: homeStats.ppg?.toFixed(1), away: awayStats.ppg?.toFixed(1) },
    { label: "ORTG", home: homeStats.ortg?.toFixed(1), away: awayStats.ortg?.toFixed(1) },
    { label: "DRTG", home: homeStats.drtg?.toFixed(1), away: awayStats.drtg?.toFixed(1), lower: true },
    { label: "PACE", home: homeStats.pace?.toFixed(1), away: awayStats.pace?.toFixed(1) },
    { label: "TS%", home: homeStats.ts?.toFixed(1), away: awayStats.ts?.toFixed(1) },
    { label: "EFG%", home: homeStats.efg?.toFixed(1), away: awayStats.efg?.toFixed(1) },
    { label: "TOV%", home: homeStats.tovPct?.toFixed(1), away: awayStats.tovPct?.toFixed(1), lower: true },
  ].filter(s => s.home != null || s.away != null) : [];

  const gameCountLabel = homeStats.games && awayStats.games
    ? `${homeStats.games}G vs ${awayStats.games}G season avg`
    : homeStats.games ? `${homeStats.games}G season avg` : awayStats.games ? `${awayStats.games}G season avg` : "";

  return (
    <div className="space-y-4">
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
