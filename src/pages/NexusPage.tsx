import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Compass, Search, User, Users, Flame, History as HistoryIcon, X, TrendingUp, Command } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CommandCenterTab from "@/components/nexus/CommandCenterTab";
import { GuidanceCard } from "@/components/ui/GuidanceCard";

// ── Players Tab ──
function PlayersTab() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const { data: players } = useQuery({
    queryKey: ["nexus-players-search", query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const { data } = await supabase.rpc("search_players_unaccent", {
        search_query: query,
        max_results: 20,
      });
      const raw = (data || []).map((p: any) => ({
        id: p.player_id,
        name: p.player_name?.includes(",")
          ? p.player_name.split(",").map((s: string) => s.trim()).reverse().join(" ")
          : p.player_name,
        team: p.player_team,
        position: p.player_position,
        league: p.player_league,
        headshot_url: p.player_headshot_url,
      }));
      const seen = new Set<string>();
      return raw.filter((p: any) => {
        const key = `${p.name?.toLowerCase()}|${p.league}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    enabled: query.length >= 2,
  });

  const { data: trending } = useQuery({
    queryKey: ["nexus-trending-players"],
    queryFn: async () => {
      const { data: propData } = await supabase.from("player_props").select("player_name").limit(1000);
      let playerRows: any[] | null = null;

      if (propData && propData.length >= 20) {
        const counts = new Map<string, number>();
        for (const p of propData) counts.set(p.player_name, (counts.get(p.player_name) || 0) + 1);
        const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
        const names = ranked.map(r => r[0]);
        const { data: rows } = await supabase.from("players").select("id, name, team, position, league, headshot_url").in("name", names);
        if (rows && rows.length >= 8) {
          const nameOrder = new Map(names.map((n, i) => [n, i]));
          playerRows = rows.sort((a, b) => (nameOrder.get(a.name) ?? 99) - (nameOrder.get(b.name) ?? 99));
        }
      }

      if (!playerRows) {
        const { data: statsData } = await supabase.from("player_game_stats")
          .select("player_id, points, rebounds, assists, steals, blocks, turnovers")
          .eq("league", "NBA").eq("period", "full").order("created_at", { ascending: false }).limit(500);

        if (statsData && statsData.length >= 10) {
          const scores = new Map<string, { total: number; count: number }>();
          for (const s of statsData) {
            const composite = (s.points || 0) + (s.rebounds || 0) + (s.assists || 0) + (s.steals || 0) + (s.blocks || 0) - (s.turnovers || 0);
            const prev = scores.get(s.player_id) || { total: 0, count: 0 };
            scores.set(s.player_id, { total: prev.total + composite, count: prev.count + 1 });
          }
          const ranked = Array.from(scores.entries()).map(([id, { total, count }]) => ({ id, avg: total / count })).sort((a, b) => b.avg - a.avg).slice(0, 15);
          const ids = ranked.map(r => r.id);
          const { data: rows } = await supabase.from("players").select("id, name, team, position, league, headshot_url").in("id", ids);
          if (rows && rows.length > 0) {
            const idOrder = new Map(ids.map((id, i) => [id, i]));
            playerRows = rows.sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99));
          }
        }
      }

      if (!playerRows) {
        const { data: fallback } = await supabase.from("players").select("id, name, team, position, league, headshot_url").eq("league", "NBA").not("headshot_url", "is", null).order("name").limit(15);
        playerRows = fallback || [];
      }

      if (playerRows.length > 0) {
        const ids = playerRows.map(p => p.id);
        const { data: seasonStats } = await supabase.from("player_season_stats").select("player_id, points_per_game, rebounds_per_game, assists_per_game, games_played, stat_type").in("player_id", ids).eq("stat_type", "averages").order("season", { ascending: false });
        const statsMap = new Map<string, any>();
        for (const s of (seasonStats || [])) { if (!statsMap.has(s.player_id)) statsMap.set(s.player_id, s); }
        return playerRows.map(p => ({ ...p, _stats: statsMap.get(p.id) || null }));
      }
      return playerRows;
    },
    staleTime: 10 * 60_000,
  });

  const showResults = query.length >= 2 && players && players.length > 0;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players..." className="pl-9 pr-8" />
        {query && (<button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>)}
      </div>
      {showResults ? (
        <div className="space-y-1">
          {players.map((p: any) => (
            <PlayerRow key={p.id} player={p} />
          ))}
        </div>
      ) : (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-primary" /> Trending Players
          </h3>
          {trending && trending.length > 0 ? (
            <>
              {/* Horizontal carousel for top trending */}
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1 mb-3">
                {trending.slice(0, 8).map((p) => (
                  <TrendingPlayerChip key={p.id} player={p} />
                ))}
              </div>
              {/* Full list below */}
              <div className="space-y-1">
                {trending.map((p) => (
                  <PlayerRow key={p.id} player={p} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">Search for a player to explore their profile.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TrendingPlayerChip({ player: p }: { player: any }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/player/${p.id}`)}
      className="shrink-0 w-[140px] cosmic-card rounded-2xl p-3 text-center hover:border-primary/30 transition-all"
    >
      <Avatar className="h-12 w-12 mx-auto mb-1.5">
        {p.headshot_url && <AvatarImage src={p.headshot_url} alt={p.name} />}
        <AvatarFallback className="text-xs bg-secondary">{p.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <p className="text-xs font-bold text-foreground truncate">{p.name}</p>
      <p className="text-[9px] text-muted-foreground">{p.position || "—"} · {p.team || "—"}</p>
      {p._stats && (
        <p className="text-[9px] text-primary font-semibold mt-1 tabular-nums">
          {p._stats.points_per_game?.toFixed(1) ?? "—"} ppg
        </p>
      )}
    </button>
  );
}

function PlayerRow({ player: p }: { player: any }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/player/${p.id}`)} className="w-full cosmic-card rounded-xl p-3 flex items-center gap-3 hover:border-primary/30 transition-colors text-left">
      <Avatar className="h-9 w-9 shrink-0">
        {p.headshot_url && <AvatarImage src={p.headshot_url} alt={p.name} />}
        <AvatarFallback className="text-[10px] bg-secondary">{p.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{p.name}</p>
        <p className="text-[10px] text-muted-foreground">{p.position || "—"} · {p.team || "—"}</p>
      </div>
      <div className="text-right shrink-0">
        {p._stats ? (
          <div className="flex gap-2 text-[9px] tabular-nums">
            <span className="text-foreground font-semibold">{p._stats.points_per_game?.toFixed(1) ?? "—"}<span className="text-muted-foreground font-normal ml-0.5">pts</span></span>
            <span className="text-foreground font-semibold">{p._stats.rebounds_per_game?.toFixed(1) ?? "—"}<span className="text-muted-foreground font-normal ml-0.5">reb</span></span>
            <span className="text-foreground font-semibold">{p._stats.assists_per_game?.toFixed(1) ?? "—"}<span className="text-muted-foreground font-normal ml-0.5">ast</span></span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">{p.league}</span>
        )}
      </div>
    </button>
  );
}

// ── Teams Tab ──
function TeamsTab() {
  const navigate = useNavigate();
  const [league, setLeague] = useState("NBA");
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const { data: teams, isLoading } = useQuery({
    queryKey: ["nexus-teams", league],
    queryFn: async () => {
      const { data } = await supabase.from("standings").select("team_abbr, team_name, league, wins, losses, streak, conference, playoff_seed").eq("league", league).order("season", { ascending: false }).limit(50);
      const seen = new Set<string>();
      return (data || []).filter(t => { if (seen.has(t.team_abbr)) return false; seen.add(t.team_abbr); return true; });
    },
    staleTime: 5 * 60_000,
  });

  const { data: paceData } = useQuery({
    queryKey: ["nexus-team-pace", league],
    queryFn: async () => {
      const now = new Date();
      const season = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
      const { data } = await supabase.from("team_season_pace").select("team_abbr, off_rating, def_rating, avg_pace, net_rating").eq("league", league).eq("season", season);
      const map = new Map<string, any>();
      for (const r of (data || [])) map.set(r.team_abbr, r);
      return map;
    },
    staleTime: 5 * 60_000,
  });

  const teamAbbrs = useMemo(() => (teams || []).map(t => t.team_abbr), [teams]);

  const { data: recentGames } = useQuery({
    queryKey: ["nexus-teams-recent-games", league, teamAbbrs],
    queryFn: async () => {
      if (!teamAbbrs.length) return [];
      const { data } = await supabase.from("games").select("id, home_abbr, away_abbr, home_score, away_score, start_time, status").eq("league", league).in("status", ["final", "Final", "Final/OT"]).order("start_time", { ascending: false }).limit(500);
      return data || [];
    },
    enabled: teamAbbrs.length > 0,
    staleTime: 5 * 60_000,
  });

  const teamLast5 = useMemo(() => {
    const map = new Map<string, { result: "W" | "L"; score: string; opp: string; date: string; id: string }[]>();
    if (!recentGames) return map;
    for (const abbr of teamAbbrs) {
      const teamGames = recentGames.filter(g => g.home_abbr === abbr || g.away_abbr === abbr).slice(0, 5);
      map.set(abbr, teamGames.map(g => {
        const isHome = g.home_abbr === abbr;
        const teamScore = isHome ? g.home_score : g.away_score;
        const oppScore = isHome ? g.away_score : g.home_score;
        return { result: ((teamScore ?? 0) > (oppScore ?? 0) ? "W" : "L") as "W" | "L", score: `${teamScore ?? 0}-${oppScore ?? 0}`, opp: isHome ? g.away_abbr : g.home_abbr, date: new Date(g.start_time).toLocaleDateString(undefined, { month: "short", day: "numeric" }), id: g.id };
      }));
    }
    return map;
  }, [recentGames, teamAbbrs]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {["NBA", "NHL", "NFL", "MLB", "NCAAB"].map(lg => (
          <button key={lg} onClick={() => { setLeague(lg); setExpandedTeam(null); }}
            className={cn("px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap", league === lg ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground")}>
            {lg}
          </button>
        ))}
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground text-center py-8">Loading teams...</p> : !teams || teams.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">No standings data for {league}.</p> : (
        <div className="grid grid-cols-2 gap-2">
          {teams.map(t => {
            const last5 = teamLast5.get(t.team_abbr) || [];
            const isExpanded = expandedTeam === t.team_abbr;
            const dots: ("W" | "L" | null)[] = [];
            for (let i = 0; i < 5; i++) { const idx = 4 - i; dots.push(last5[idx] ? last5[idx].result : null); }
            return (
              <div key={t.team_abbr} className="flex flex-col">
                <button onClick={() => setExpandedTeam(isExpanded ? null : t.team_abbr)} className="cosmic-card rounded-xl p-3 text-left hover:border-primary/30 transition-colors">
                  <p className="text-sm font-bold text-foreground">{t.team_abbr}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{t.team_name}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <span className="text-xs font-semibold tabular-nums">{t.wins ?? 0}-{t.losses ?? 0}</span>
                    <div className="flex gap-0.5 ml-auto">
                      {dots.map((d, i) => (<span key={i} className={cn("h-2 w-2 rounded-full", d === "W" ? "bg-cosmic-green" : d === "L" ? "bg-cosmic-red" : "bg-muted")} />))}
                    </div>
                  </div>
                  {paceData?.get(t.team_abbr) && (
                    <div className="flex gap-2 mt-1.5 text-[9px] tabular-nums">
                      <span className="text-foreground font-semibold">{Number(paceData.get(t.team_abbr).off_rating).toFixed(1)}<span className="text-muted-foreground font-normal ml-0.5">ORtg</span></span>
                      <span className="text-foreground font-semibold">{Number(paceData.get(t.team_abbr).def_rating).toFixed(1)}<span className="text-muted-foreground font-normal ml-0.5">DRtg</span></span>
                      {paceData.get(t.team_abbr).net_rating != null && (
                        <span className={cn("font-semibold", Number(paceData.get(t.team_abbr).net_rating) >= 0 ? "text-cosmic-green" : "text-cosmic-red")}>
                          {Number(paceData.get(t.team_abbr).net_rating) > 0 ? "+" : ""}{Number(paceData.get(t.team_abbr).net_rating).toFixed(1)}<span className="text-muted-foreground font-normal ml-0.5">Net</span>
                        </span>
                      )}
                    </div>
                  )}
                </button>
                {isExpanded && last5.length > 0 && (
                  <div className="mt-1 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {[...last5].map((g, i) => (
                      <button key={i} onClick={() => navigate(`/game/${g.id}`)} className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground w-10">{g.date}</span>
                          <span className="text-[10px] text-foreground font-medium">vs {g.opp}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold tabular-nums">{g.score}</span>
                          <span className={cn("text-[9px] font-bold", g.result === "W" ? "text-cosmic-green" : "text-cosmic-red")}>{g.result}</span>
                        </div>
                      </button>
                    ))}
                    <button onClick={() => navigate(`/team/${league}/${t.team_abbr}`)} className="w-full text-center text-[10px] text-primary py-1 hover:underline">View Full Team Page →</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Trends Tab ──
import TrendsPage from "./TrendsPage";
function TrendsTab() { return <TrendsPage />; }

// ── History Tab ──
import HistoricalPage from "./HistoricalPage";
function HistoryTab() { return <HistoricalPage />; }

// ── Main Nexus Page ──
export default function NexusPage() {
  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <h1 className="text-lg font-bold font-display flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          Nexus
        </h1>
        <p className="text-[10px] text-muted-foreground mt-0.5">Intelligence hub — command center, research & analysis</p>
      </header>

      <div className="px-4 pt-4">
        <GuidanceCard title="Nexus Intelligence Hub" dismissKey="nexus_intro" variant="onboarding">
          <p>Your central research hub. The <strong>Command Center</strong> shows your Astra pulse, trap alerts, and top opportunities. Use <strong>Players</strong> and <strong>Teams</strong> for deep dives.</p>
          <p className="mt-1"><strong>Trends</strong> analyzes prop hit rates, and <strong>History</strong> tracks past results.</p>
        </GuidanceCard>
        <Tabs defaultValue="command" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="command" className="text-xs gap-1">
              <Command className="h-3 w-3" />
              Command
            </TabsTrigger>
            <TabsTrigger value="players" className="text-xs gap-1">
              <User className="h-3 w-3" />
              Players
            </TabsTrigger>
            <TabsTrigger value="teams" className="text-xs gap-1">
              <Users className="h-3 w-3" />
              Teams
            </TabsTrigger>
            <TabsTrigger value="trends" className="text-xs gap-1">
              <TrendingUp className="h-3 w-3" />
              Trends
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs gap-1">
              <HistoryIcon className="h-3 w-3" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="command">
            <CommandCenterTab />
          </TabsContent>
          <TabsContent value="players">
            <PlayersTab />
          </TabsContent>
          <TabsContent value="teams">
            <TeamsTab />
          </TabsContent>
          <TabsContent value="trends">
            <TrendsTab />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
