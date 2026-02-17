import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Compass, Search, User, Users, Flame, History, X, TrendingUp } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

  // Trending players (those with most recent prop activity)
  const { data: trending } = useQuery({
    queryKey: ["nexus-trending-players"],
    queryFn: async () => {
      const { data } = await supabase
        .from("player_props")
        .select("player_name, game_id")
        .order("captured_at", { ascending: false })
        .limit(200);
      if (!data) return [];
      const counts = new Map<string, number>();
      for (const row of data) {
        counts.set(row.player_name, (counts.get(row.player_name) || 0) + 1);
      }
      const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
      const names = sorted.map(([n]) => n);
      // Look up player IDs
      const { data: playerRows } = await supabase
        .from("players")
        .select("id, name, team, position, league, headshot_url")
        .in("name", names)
        .limit(12);
      return playerRows || [];
    },
  });

  const showResults = query.length >= 2 && players && players.length > 0;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players..."
          className="pl-9 pr-8"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showResults ? (
        <div className="space-y-1">
          {players.map((p: any) => (
            <button
              key={p.id}
              onClick={() => navigate(`/player/${p.id}`)}
              className="w-full cosmic-card rounded-xl p-3 flex items-center gap-3 hover:border-primary/30 transition-colors text-left"
            >
              <Avatar className="h-9 w-9 shrink-0">
                {p.headshot_url && <AvatarImage src={p.headshot_url} alt={p.name} />}
                <AvatarFallback className="text-[10px] bg-secondary">{p.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{p.name}</p>
                <p className="text-[10px] text-muted-foreground">{p.position || "—"} · {p.team || "—"}</p>
              </div>
              <span className="text-[10px] text-muted-foreground">{p.league}</span>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-primary" />
            Trending Players
          </h3>
          {trending && trending.length > 0 ? (
            <div className="space-y-1">
              {trending.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/player/${p.id}`)}
                  className="w-full cosmic-card rounded-xl p-3 flex items-center gap-3 hover:border-primary/30 transition-colors text-left"
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    {p.headshot_url && <AvatarImage src={p.headshot_url} alt={p.name} />}
                    <AvatarFallback className="text-[10px] bg-secondary">{p.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.position || "—"} · {p.team || "—"}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{p.league}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">Search for a player to explore their profile.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Teams Tab ──
function TeamsTab() {
  const navigate = useNavigate();
  const [league, setLeague] = useState("NBA");

  const { data: teams, isLoading } = useQuery({
    queryKey: ["nexus-teams", league],
    queryFn: async () => {
      const { data } = await supabase
        .from("standings")
        .select("team_abbr, team_name, league, wins, losses, streak, conference, playoff_seed")
        .eq("league", league)
        .order("season", { ascending: false })
        .limit(50);
      // Dedupe by team_abbr
      const seen = new Set<string>();
      return (data || []).filter(t => {
        if (seen.has(t.team_abbr)) return false;
        seen.add(t.team_abbr);
        return true;
      });
    },
  });

  // Fetch last 5 games for each team
  const { data: recentGames } = useQuery({
    queryKey: ["nexus-teams-recent", league],
    queryFn: async () => {
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, home_score, away_score, status")
        .eq("league", league)
        .eq("status", "final")
        .order("start_time", { ascending: false })
        .limit(300);
      return data || [];
    },
  });

  const teamRecent = useMemo(() => {
    const map = new Map<string, ("W" | "L")[]>();
    for (const g of recentGames || []) {
      if (g.home_score == null || g.away_score == null) continue;
      for (const abbr of [g.home_abbr, g.away_abbr]) {
        const arr = map.get(abbr) || [];
        if (arr.length >= 5) continue;
        const isHome = abbr === g.home_abbr;
        const teamScore = isHome ? g.home_score : g.away_score;
        const oppScore = isHome ? g.away_score : g.home_score;
        arr.push(teamScore > oppScore ? "W" : "L");
        map.set(abbr, arr);
      }
    }
    return map;
  }, [recentGames]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {["NBA", "NHL", "NFL", "MLB"].map(lg => (
          <button
            key={lg}
            onClick={() => setLeague(lg)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap",
              league === lg
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            {lg}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground text-center py-8">Loading teams...</p>
      ) : !teams || teams.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">No standings data for {league}.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {teams.map(t => {
            const recent = teamRecent.get(t.team_abbr) || [];
            return (
              <button
                key={t.team_abbr}
                onClick={() => navigate(`/team/${t.league}/${t.team_abbr}`)}
                className="cosmic-card rounded-xl p-3 text-left hover:border-primary/30 transition-colors"
              >
                <p className="text-sm font-bold text-foreground">{t.team_abbr}</p>
                <p className="text-[10px] text-muted-foreground truncate">{t.team_name}</p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-xs font-semibold tabular-nums">{t.wins ?? 0}-{t.losses ?? 0}</span>
                  <div className="flex gap-0.5 ml-auto">
                    {recent.map((r, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-2 w-2 rounded-full",
                          r === "W" ? "bg-cosmic-green" : "bg-cosmic-red"
                        )}
                      />
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Trends Tab (lazy-loads TrendsPage content) ──
import TrendsPage from "./TrendsPage";

function TrendsTab() {
  return <TrendsPage />;
}

// ── History Tab (lazy-loads HistoricalPage content) ──
import HistoricalPage from "./HistoricalPage";

function HistoryTab() {
  return <HistoricalPage />;
}

// ── Main Nexus Page ──
export default function NexusPage() {
  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <h1 className="text-lg font-bold font-display flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          Nexus
        </h1>
        <p className="text-[10px] text-muted-foreground mt-0.5">Research hub — players, teams, trends & history</p>
      </header>

      <div className="px-4 pt-4">
        <Tabs defaultValue="players" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
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
              <History className="h-3 w-3" />
              History
            </TabsTrigger>
          </TabsList>

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
