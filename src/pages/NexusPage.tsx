import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Compass, Search, User, Users, Flame, History as HistoryIcon, X, TrendingUp, Command, ChevronDown, ChevronUp } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CommandCenterTab from "@/components/nexus/CommandCenterTab";
import { GuidanceCard } from "@/components/ui/GuidanceCard";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import SignalLabPage from "./SignalLabPage";
import HistoricalPage from "./HistoricalPage";
import { getMarketShort } from "@/lib/market-catalog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

const glassCard = "backdrop-blur-xl bg-[#e8dff5]/40 border border-[#c4b0e0]/40 shadow-lg rounded-xl";

// ── Players Tab (now with Player Insights from Trends) ──
function PlayersTab() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

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

  // Player Insights from props + stats (merged from Trends)
  const { data: playerInsights } = useQuery({
    queryKey: ["nexus-player-insights"],
    queryFn: async () => {
      const { data: propData } = await supabase.from("player_props").select("id, game_id, player_name, market_key, line, over_price, under_price").not("over_price", "is", null).not("under_price", "is", null).order("player_name").limit(200);
      if (!propData || propData.length === 0) return [];

      const playerNames = [...new Set(propData.map(p => p.player_name))].slice(0, 20);
      const { data: playersData } = await supabase.from("players").select("id, name").in("name", playerNames);
      if (!playersData || playersData.length === 0) return [];

      const playerIds = playersData.map(p => p.id);
      const { data: stats } = await supabase.from("player_game_stats")
        .select("player_id, points, rebounds, assists, steals, blocks, three_made")
        .in("player_id", playerIds).eq("period", "full").order("created_at", { ascending: false }).limit(playerIds.length * 10);

      const statsByName = new Map<string, any[]>();
      for (const s of (stats || [])) {
        const player = playersData.find(p => p.id === s.player_id);
        if (player) {
          if (!statsByName.has(player.name)) statsByName.set(player.name, []);
          statsByName.get(player.name)!.push(s);
        }
      }

      const insights: TrendInsight[] = [];
      const seen = new Set<string>();
      for (const prop of propData) {
        if (prop.line == null) continue;
        const key = `${prop.player_name}::${prop.market_key}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const pStats = statsByName.get(prop.player_name) || [];
        const sampleSize = Math.min(pStats.length, 5);
        if (sampleSize === 0) continue;

        const sample = pStats.slice(0, sampleSize);
        const mk = prop.market_key;
        let statFn: (s: any) => number = () => 0;
        if (mk.includes("points")) statFn = s => s.points ?? 0;
        else if (mk.includes("rebounds")) statFn = s => s.rebounds ?? 0;
        else if (mk.includes("assists")) statFn = s => s.assists ?? 0;
        else if (mk.includes("steals")) statFn = s => s.steals ?? 0;
        else if (mk.includes("blocks")) statFn = s => s.blocks ?? 0;
        else if (mk.includes("threes")) statFn = s => s.three_made ?? 0;
        else continue;

        const values = sample.map(statFn);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const overHits = values.filter(v => v > prop.line!).length;
        const underHits = values.filter(v => v < prop.line!).length;
        const overRate = (overHits / sampleSize) * 100;
        const underRate = (underHits / sampleSize) * 100;
        const direction: "over" | "under" = overRate >= underRate ? "over" : "under";
        const hitCount = direction === "over" ? overHits : underHits;
        const hitRate = direction === "over" ? overRate : underRate;
        const hitGames = values.map(v => direction === "over" ? (v > prop.line! ? 1 : 0) : (v < prop.line! ? 1 : 0));

        if (hitRate < 60) continue;

        const propLabel = getMarketShort(prop.market_key);
        insights.push({
          id: String(prop.id), playerName: prop.player_name, teamAbbr: "",
          matchup: "", startTime: "",
          insightText: `${prop.player_name} has hit ${direction} ${prop.line} ${propLabel.toLowerCase()} in ${hitCount}/${sampleSize} recent games (${avg.toFixed(1)} avg).`,
          direction, propLabel, line: prop.line,
          odds: direction === "over" ? prop.over_price : prop.under_price,
          hitRate, sampleSize, hitGames, statValues: values, gameId: prop.game_id || "", marketKey: prop.market_key,
        });
      }
      return insights.sort((a, b) => b.hitRate - a.hitRate).slice(0, 10);
    },
    staleTime: 5 * 60_000,
  });

  const showResults = query.length >= 2 && players && players.length > 0;

  return (
    <div className="space-y-4">
      {/* How Trends Work - collapsible */}
      <Collapsible open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
        <CollapsibleTrigger asChild>
          <button className={cn(glassCard, "w-full p-3 flex items-center justify-between text-left")}>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#a78bda]" />
              <span className="text-sm font-semibold text-[#6b4c9a]">How Trends Work</span>
            </div>
            {howItWorksOpen ? <ChevronUp className="h-4 w-4 text-[#a78bda]" /> : <ChevronDown className="h-4 w-4 text-[#a78bda]" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn(glassCard, "mt-1 p-4 space-y-2")}>
            <p className="text-xs text-foreground/80">
              Trends analyzes player props against recent game logs to find hit-rate streaks and edges. <DataSourceBadge source="provider" compact /> lines come from sportsbook feeds. <DataSourceBadge source="model" compact /> insights are computed from your stat history.
            </p>
            <p className="text-xs text-foreground/80">
              Player Insights below shows the strongest current streaks — players consistently hitting over or under their lines.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Search */}
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
        <>
          {/* Player Insights — grouped by player */}
          {playerInsights && playerInsights.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6b4c9a] flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-[#a78bda]" /> Player Insights
              </h3>
              <div className="space-y-2">
                {(() => {
                  const grouped = new Map<string, typeof playerInsights>();
                  for (const insight of playerInsights.slice(0, 10)) {
                    const key = insight.playerName;
                    if (!grouped.has(key)) grouped.set(key, []);
                    grouped.get(key)!.push(insight);
                  }
                  return Array.from(grouped.entries()).map(([playerName, insights]) => (
                    <PlayerInsightGroup key={playerName} playerName={playerName} insights={insights} />
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Trending Players */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-primary" /> Trending Players
            </h3>
            {trending && trending.length > 0 ? (
              <>
                <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1 mb-3">
                  {trending.slice(0, 8).map((p) => (
                    <TrendingPlayerChip key={p.id} player={p} />
                  ))}
                </div>
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
        </>
      )}
    </div>
  );
}

function TrendingPlayerChip({ player: p }: { player: any }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/player/${p.id}`)}
      className={cn(glassCard, "shrink-0 w-[140px] p-3 text-center hover:border-[#a78bda]/50 transition-all")}
    >
      <Avatar className="h-12 w-12 mx-auto mb-1.5">
        {p.headshot_url && <AvatarImage src={p.headshot_url} alt={p.name} />}
        <AvatarFallback className="text-xs bg-[#f3eef9]">{p.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <p className="text-xs font-bold text-foreground truncate">{p.name}</p>
      <p className="text-[9px] text-muted-foreground">{p.position || "—"} · {p.team || "—"}</p>
      {p._stats && (
        <p className="text-[9px] text-[#7c5dac] font-semibold mt-1 tabular-nums">
          {p._stats.points_per_game?.toFixed(1) ?? "—"} ppg
        </p>
      )}
    </button>
  );
}

function PlayerRow({ player: p }: { player: any }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/player/${p.id}`)} className={cn(glassCard, "w-full p-3 flex items-center gap-3 hover:border-[#a78bda]/50 transition-colors text-left")}>
      <Avatar className="h-9 w-9 shrink-0">
        {p.headshot_url && <AvatarImage src={p.headshot_url} alt={p.name} />}
        <AvatarFallback className="text-[10px] bg-[#f3eef9]">{p.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
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
const TEAM_ABBR_NORMALIZE: Record<string, string> = {
  PHO: "PHX", BRK: "BKN", CHO: "CHA", NOH: "NOP", NOK: "NOP",
  GS: "GSW", SA: "SAS", NY: "NYK", NO: "NOP", VEG: "VGK",
  NJ: "NJD", TB: "TBL", LA: "LAK", SJ: "SJS", MON: "MTL",
};
function normalizeAbbr(abbr: string): string {
  return TEAM_ABBR_NORMALIZE[abbr] || abbr;
}

function TeamsTab() {
  const navigate = useNavigate();
  const [league, setLeague] = useState("NBA");
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const { data: teams, isLoading } = useQuery({
    queryKey: ["nexus-teams", league],
    queryFn: async () => {
      const { data } = await supabase.from("standings").select("team_abbr, team_name, league, wins, losses, streak, conference, playoff_seed").eq("league", league).order("season", { ascending: false }).limit(50);
      const seen = new Set<string>();
      return (data || []).filter(t => {
        const norm = normalizeAbbr(t.team_abbr);
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
      }).map(t => ({ ...t, team_abbr: normalizeAbbr(t.team_abbr) }));
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
            className={cn("px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap", league === lg ? "bg-[#a78bda] text-white" : "bg-[#e8dff5]/60 text-[#6b4c9a] hover:bg-[#e8dff5] hover:text-[#5a3d8a]")}>
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
                <button onClick={() => setExpandedTeam(isExpanded ? null : t.team_abbr)} className={cn(glassCard, "p-3 text-left hover:border-[#a78bda]/50 transition-colors")}>
                  <p className="text-sm font-bold text-foreground">{t.team_abbr}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{t.team_name}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <span className="text-xs font-semibold tabular-nums">{t.wins ?? 0}-{t.losses ?? 0}</span>
                    <div className="flex gap-0.5 ml-auto">
                      {dots.map((d, i) => (<span key={i} className={cn("h-2 w-2 rounded-full", d === "W" ? "bg-emerald-500" : d === "L" ? "bg-red-500" : "bg-muted")} />))}
                    </div>
                  </div>
                  {paceData?.get(t.team_abbr) && (
                    <div className="flex gap-2 mt-1.5 text-[9px] tabular-nums">
                      <span className="text-foreground font-semibold">{Number(paceData.get(t.team_abbr).off_rating).toFixed(1)}<span className="text-muted-foreground font-normal ml-0.5">ORtg</span></span>
                      <span className="text-foreground font-semibold">{Number(paceData.get(t.team_abbr).def_rating).toFixed(1)}<span className="text-muted-foreground font-normal ml-0.5">DRtg</span></span>
                      {paceData.get(t.team_abbr).net_rating != null && (
                        <span className={cn("font-semibold", Number(paceData.get(t.team_abbr).net_rating) >= 0 ? "text-emerald-500" : "text-red-500")}>
                          {Number(paceData.get(t.team_abbr).net_rating) > 0 ? "+" : ""}{Number(paceData.get(t.team_abbr).net_rating).toFixed(1)}<span className="text-muted-foreground font-normal ml-0.5">Net</span>
                        </span>
                      )}
                    </div>
                  )}
                </button>
                {isExpanded && last5.length > 0 && (
                  <div className="mt-1 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {[...last5].map((g, i) => (
                      <button key={i} onClick={() => navigate(`/game/${g.id}`)} className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#f3eef9]/60 hover:bg-[#e8dff5]/70 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground w-10">{g.date}</span>
                          <span className="text-[10px] text-foreground font-medium">vs {g.opp}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold tabular-nums">{g.score}</span>
                          <span className={cn("text-[9px] font-bold", g.result === "W" ? "text-emerald-500" : "text-red-500")}>{g.result}</span>
                        </div>
                      </button>
                    ))}
                    <button onClick={() => navigate(`/team/${league}/${t.team_abbr}`)} className="w-full text-center text-[10px] text-[#7c5dac] py-1 hover:underline">View Full Team Page →</button>
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

// ── Signals Tab ──
function SignalsTab() { return <SignalLabPage embedded />; }

// ── History Tab ──
function HistoryTab() { return <HistoricalPage />; }

// ── Main Nexus Page ──
export default function NexusPage() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "command";

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <h1 className="text-lg font-bold font-display flex items-center gap-2">
          <Compass className="h-5 w-5 text-[#a78bda]" />
          Nexus
        </h1>
        <p className="text-[10px] text-muted-foreground mt-0.5">Intelligence hub — command center, signals & research</p>
      </header>

      <div className="px-4 pt-4">
        <GuidanceCard title="Nexus Intelligence Hub" dismissKey="nexus_intro" variant="onboarding">
          <p>Your central research hub. The <strong>Command Center</strong> shows your Astra pulse, top plays, and live dashboard. <strong>Signals</strong> surfaces streaks, momentum, and live edges.</p>
        </GuidanceCard>
        <Tabs defaultValue={initialTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="command" className="text-xs gap-1">
              <Command className="h-3 w-3" />
              Command
            </TabsTrigger>
            <TabsTrigger value="signals" className="text-xs gap-1">
              <TrendingUp className="h-3 w-3" />
              Signals
            </TabsTrigger>
            <TabsTrigger value="players" className="text-xs gap-1">
              <User className="h-3 w-3" />
              Players
            </TabsTrigger>
            <TabsTrigger value="teams" className="text-xs gap-1">
              <Users className="h-3 w-3" />
              Teams
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs gap-1">
              <HistoryIcon className="h-3 w-3" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="command">
            <CommandCenterTab />
          </TabsContent>
          <TabsContent value="signals">
            <SignalsTab />
          </TabsContent>
          <TabsContent value="players">
            <PlayersTab />
          </TabsContent>
          <TabsContent value="teams">
            <TeamsTab />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
