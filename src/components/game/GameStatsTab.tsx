import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface GameStatsTabProps {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  league: string;
}

/**
 * Aggregate nba_play_by_play_events into per-player stat lines.
 */
function aggregatePbpToPlayerStats(events: any[], homeAbbr: string, awayAbbr: string) {
  const playerMap = new Map<string, any>();

  const getOrCreate = (name: string, team: string) => {
    const key = `${team}::${name}`;
    if (!playerMap.has(key)) {
      playerMap.set(key, {
        id: key,
        team_abbr: team,
        players: { name, position: null, headshot_url: null },
        points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0,
        fg_made: 0, fg_attempted: 0, three_made: 0, three_attempted: 0,
        ft_made: 0, ft_attempted: 0, off_rebounds: 0,
        minutes: null, plus_minus: null, starter: false,
      });
    }
    return playerMap.get(key)!;
  };

  for (const e of events) {
    if (!e.player || !e.team) continue;
    const team = e.team;
    const p = getOrCreate(e.player, team);

    switch (e.event_type) {
      case "shot":
      case "miss":
        p.fg_attempted++;
        if (e.result === "made") {
          p.fg_made++;
          p.points += e.points ?? 2;
          if (e.type?.toLowerCase().includes("3") || (e.points ?? 0) === 3) {
            p.three_made++;
            p.three_attempted++;
          }
        } else {
          if (e.type?.toLowerCase().includes("3")) {
            p.three_attempted++;
          }
        }
        break;
      case "free throw":
        p.ft_attempted++;
        if (e.result === "made") {
          p.ft_made++;
          p.points += 1;
        }
        break;
      case "rebound":
        p.rebounds++;
        if (e.type?.toLowerCase().includes("offensive") || e.type?.toLowerCase().includes("off")) {
          p.off_rebounds++;
        }
        break;
      case "turnover":
        p.turnovers++;
        break;
    }

    if (e.assist) {
      const assistPlayer = getOrCreate(e.assist, team);
      assistPlayer.assists++;
    }
    if (e.steal) {
      const stealTeam = team === homeAbbr ? awayAbbr : homeAbbr;
      const stealPlayer = getOrCreate(e.steal, stealTeam);
      stealPlayer.steals++;
    }
    if (e.block) {
      const blockTeam = team === homeAbbr ? awayAbbr : homeAbbr;
      const blockPlayer = getOrCreate(e.block, blockTeam);
      blockPlayer.blocks++;
    }
  }

  return Array.from(playerMap.values()).sort((a, b) => b.points - a.points);
}

export function GameStatsTab({ gameId, homeAbbr, awayAbbr, homeTeam, awayTeam, homeScore, awayScore, league }: GameStatsTabProps) {
  const [subTab, setSubTab] = useState<"game" | "home" | "away">("game");

  // Fetch quarter/period scores
  const { data: quarters } = useQuery({
    queryKey: ["game-quarters-detail", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("game_quarters")
        .select("quarter, home_score, away_score")
        .eq("game_id", gameId)
        .order("quarter", { ascending: true });
      return data || [];
    },
  });

  // Fetch player game stats
  const { data: playerStats } = useQuery({
    queryKey: ["game-player-stats", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("player_game_stats")
        .select("*, players!player_game_stats_player_id_fkey(name, position, headshot_url)")
        .eq("game_id", gameId)
        .eq("period", "full")
        .order("points", { ascending: false });
      return data || [];
    },
  });

  // Fallback: fetch PBP events to derive stats when player_game_stats is empty
  const { data: pbpEvents } = useQuery({
    queryKey: ["game-pbp-stats-fallback", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nba_play_by_play_events")
        .select("event_type, player, team, points, result, type, assist, steal, block, period")
        .eq("game_id", gameId)
        .limit(5000);
      return data || [];
    },
    enabled: !!playerStats && playerStats.length === 0,
  });

  // Use PBP-derived stats as fallback
  const effectivePlayerStats = useMemo(() => {
    if (playerStats && playerStats.length > 0) return playerStats;
    if (pbpEvents && pbpEvents.length > 0) {
      return aggregatePbpToPlayerStats(pbpEvents, homeAbbr, awayAbbr);
    }
    return [];
  }, [playerStats, pbpEvents, homeAbbr, awayAbbr]);

  const periodLabel = (q: number) => {
    if (league === "NHL") return q <= 3 ? `P${q}` : q === 4 ? "OT" : `${q - 3}OT`;
    if (league === "MLB") return `${q}`;
    return q <= 4 ? `${q === 1 ? "1ST" : q === 2 ? "2ND" : q === 3 ? "3RD" : "4TH"}` : `OT${q - 4 > 1 ? q - 4 : ""}`;
  };

  // Team totals from player stats
  const homePlayerStats = playerStats?.filter(p => p.team_abbr === homeAbbr) || [];
  const awayPlayerStats = playerStats?.filter(p => p.team_abbr === awayAbbr) || [];

  const sumStat = (players: typeof homePlayerStats, key: string) =>
    players.reduce((sum, p) => sum + ((p as any)[key] ?? 0), 0);

  const teamCompareStats = [
    { label: "Rebounds", home: sumStat(homePlayerStats, "rebounds"), away: sumStat(awayPlayerStats, "rebounds") },
    { label: "Assists", home: sumStat(homePlayerStats, "assists"), away: sumStat(awayPlayerStats, "assists") },
    { label: "Steals", home: sumStat(homePlayerStats, "steals"), away: sumStat(awayPlayerStats, "steals") },
    { label: "Blocks", home: sumStat(homePlayerStats, "blocks"), away: sumStat(awayPlayerStats, "blocks") },
    { label: "Turnovers", home: sumStat(homePlayerStats, "turnovers"), away: sumStat(awayPlayerStats, "turnovers"), lower: true },
    {
      label: "Field Goals",
      home: `${sumStat(homePlayerStats, "fg_made")}-${sumStat(homePlayerStats, "fg_attempted")}`,
      away: `${sumStat(awayPlayerStats, "fg_made")}-${sumStat(awayPlayerStats, "fg_attempted")}`,
      isStr: true,
      homeNum: sumStat(homePlayerStats, "fg_made"),
      awayNum: sumStat(awayPlayerStats, "fg_made"),
    },
    {
      label: "3 Pointers",
      home: `${sumStat(homePlayerStats, "three_made")}-${sumStat(homePlayerStats, "three_attempted")}`,
      away: `${sumStat(awayPlayerStats, "three_made")}-${sumStat(awayPlayerStats, "three_attempted")}`,
      isStr: true,
      homeNum: sumStat(homePlayerStats, "three_made"),
      awayNum: sumStat(awayPlayerStats, "three_made"),
    },
    {
      label: "Free Throws",
      home: `${sumStat(homePlayerStats, "ft_made")}-${sumStat(homePlayerStats, "ft_attempted")}`,
      away: `${sumStat(awayPlayerStats, "ft_made")}-${sumStat(awayPlayerStats, "ft_attempted")}`,
      isStr: true,
      homeNum: sumStat(homePlayerStats, "ft_made"),
      awayNum: sumStat(awayPlayerStats, "ft_made"),
    },
  ];

  // Separate starters and bench
  const splitRoster = (stats: typeof homePlayerStats) => {
    const starters = stats.filter(p => p.starter);
    const bench = stats.filter(p => !p.starter);
    // If no starter flags, treat top 5 by minutes as starters
    if (starters.length === 0 && stats.length >= 5) {
      const sorted = [...stats].sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0));
      return { starters: sorted.slice(0, 5), bench: sorted.slice(5) };
    }
    return { starters, bench };
  };

  const displayPlayers = subTab === "home" ? homePlayerStats : subTab === "away" ? awayPlayerStats : [];
  const { starters, bench } = splitRoster(displayPlayers);

  return (
    <div className="space-y-4">
      {/* Team toggle */}
      <div className="flex rounded-full bg-secondary/50 p-1 gap-1">
        {[
          { val: "away" as const, label: awayAbbr },
          { val: "game" as const, label: "Game" },
          { val: "home" as const, label: homeAbbr },
        ].map(t => (
          <button
            key={t.val}
            onClick={() => setSubTab(t.val)}
            className={cn(
              "flex-1 text-xs font-semibold py-2 rounded-full transition-colors",
              subTab === t.val
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Game sub-tab: Quarter scores + Team comparison */}
      {subTab === "game" && (
        <div className="space-y-4">
          {/* Quarter scores table */}
          {quarters && quarters.length > 0 && (
            <div className="cosmic-card rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium w-24" />
                      {quarters.map(q => (
                        <th key={q.quarter} className="text-center py-2.5 px-2 text-muted-foreground font-medium uppercase text-[10px]">
                          {periodLabel(q.quarter)}
                        </th>
                      ))}
                      <th className="text-center py-2.5 px-3 font-bold text-foreground uppercase text-[10px]">TOT</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 px-3 font-semibold text-foreground">{awayTeam.split(" ").pop()}</td>
                      {quarters.map(q => (
                        <td key={q.quarter} className="text-center py-2.5 px-2 tabular-nums text-muted-foreground">{q.away_score ?? "–"}</td>
                      ))}
                      <td className="text-center py-2.5 px-3 font-bold tabular-nums text-foreground">{awayScore}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-foreground">{homeTeam.split(" ").pop()}</td>
                      {quarters.map(q => (
                        <td key={q.quarter} className="text-center py-2.5 px-2 tabular-nums text-muted-foreground">{q.home_score ?? "–"}</td>
                      ))}
                      <td className="text-center py-2.5 px-3 font-bold tabular-nums text-foreground">{homeScore}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Team comparison stats */}
          {playerStats && playerStats.length > 0 && (
            <div className="cosmic-card rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <span className="text-[10px] text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">{awayAbbr}</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">{homeAbbr}</span>
              </div>
              {teamCompareStats.map((s) => {
                const hVal = typeof s.home === "number" ? s.home : (s as any).homeNum ?? 0;
                const aVal = typeof s.away === "number" ? s.away : (s as any).awayNum ?? 0;
                const homeWins = s.lower ? hVal < aVal : hVal > aVal;
                const awayWins = s.lower ? aVal < hVal : aVal > hVal;
                return (
                  <div key={s.label} className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 last:border-b-0">
                    <span className="text-xs text-foreground font-medium flex-1">{s.label}</span>
                    <span className={cn("text-xs tabular-nums font-semibold w-20 text-right", awayWins && "text-cosmic-gold")}>
                      {s.isStr ? s.away : s.away}
                      {awayWins && <span className="ml-1 text-cosmic-gold">◀</span>}
                    </span>
                    <span className={cn("text-xs tabular-nums font-semibold w-20 text-right", homeWins && "text-cosmic-gold")}>
                      {s.isStr ? s.home : s.home}
                      {homeWins && <span className="ml-1 text-cosmic-gold">◀</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Player stats sub-tabs */}
      {(subTab === "home" || subTab === "away") && (
        <div className="space-y-2">
          {displayPlayers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No player stats available for this game.</p>
            </div>
          ) : (
            <div className="cosmic-card rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium sticky left-0 bg-secondary/30 min-w-[100px]">
                        {starters.length > 0 ? "STARTERS" : "PLAYERS"}
                      </th>
                      <th className="text-center py-2 px-1.5 text-muted-foreground font-medium">MIN</th>
                      <th className="text-center py-2 px-1.5 text-muted-foreground font-medium">PTS</th>
                      <th className="text-center py-2 px-1.5 text-muted-foreground font-medium">REB</th>
                      <th className="text-center py-2 px-1.5 text-muted-foreground font-medium">AST</th>
                      <th className="text-center py-2 px-1.5 text-muted-foreground font-medium">BLK</th>
                      <th className="text-center py-2 px-1.5 text-muted-foreground font-medium">STL</th>
                      <th className="text-center py-2 px-1.5 text-muted-foreground font-medium">TOV</th>
                      <th className="text-center py-2 px-1.5 text-muted-foreground font-medium">+/-</th>
                    </tr>
                  </thead>
                  <tbody>
                    {starters.map((p) => (
                      <PlayerStatRow key={p.id} stat={p} />
                    ))}
                    {bench.length > 0 && (
                      <>
                        <tr className="border-t border-border bg-secondary/30">
                          <td colSpan={9} className="py-2 px-2">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground font-medium text-[10px]">BENCH</span>
                              <span className="text-muted-foreground font-medium text-[10px]">MIN PTS REB AST BLK STL TOV +/-</span>
                            </div>
                          </td>
                        </tr>
                        {bench.map((p) => (
                          <PlayerStatRow key={p.id} stat={p} />
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlayerStatRow({ stat }: { stat: any }) {
  const playerName = stat.players?.name || "Unknown";
  const position = stat.players?.position || "";
  const mins = stat.minutes != null ? `${Math.floor(stat.minutes)}:${String(Math.round((stat.minutes % 1) * 60)).padStart(2, "0")}` : "—";

  return (
    <tr className="border-b border-border/30 last:border-b-0 hover:bg-secondary/20 transition-colors">
      <td className="py-2.5 px-2 sticky left-0 bg-card min-w-[100px]">
        <div>
          <span className="text-xs font-medium text-foreground">{playerName.split(" ").map((w: string, i: number) => i === 0 ? w[0] + "." : w).join(" ")}</span>
          {position && <span className="text-[9px] text-muted-foreground ml-1">{position}</span>}
        </div>
      </td>
      <td className="text-center py-2.5 px-1.5 tabular-nums text-muted-foreground">{mins}</td>
      <td className="text-center py-2.5 px-1.5 tabular-nums font-semibold text-foreground">{stat.points ?? 0}</td>
      <td className="text-center py-2.5 px-1.5 tabular-nums text-foreground">{stat.rebounds ?? 0}</td>
      <td className="text-center py-2.5 px-1.5 tabular-nums text-foreground">{stat.assists ?? 0}</td>
      <td className="text-center py-2.5 px-1.5 tabular-nums text-foreground">{stat.blocks ?? 0}</td>
      <td className="text-center py-2.5 px-1.5 tabular-nums text-foreground">{stat.steals ?? 0}</td>
      <td className="text-center py-2.5 px-1.5 tabular-nums text-foreground">{stat.turnovers ?? 0}</td>
      <td className="text-center py-2.5 px-1.5 tabular-nums text-foreground">{stat.plus_minus != null ? (stat.plus_minus > 0 ? `+${stat.plus_minus}` : stat.plus_minus) : "—"}</td>
    </tr>
  );
}
