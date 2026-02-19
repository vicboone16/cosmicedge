import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { RefreshCw, CalendarDays, Trophy, Wrench } from "lucide-react";
import { toast } from "sonner";

interface LeagueGameStats {
  league: string;
  total: number;
  withScores: number;
}

interface LeaguePlayerStats {
  league: string;
  total: number;
  withBirthDate: number;
  withBirthTime: number;
  withHeadshot: number;
}

export function DataHealthDashboard() {
  const [games, setGames] = useState<LeagueGameStats[]>([]);
  const [players, setPlayers] = useState<LeaguePlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [tsdbSyncing, setTsdbSyncing] = useState<string | null>(null);
  const [fixingStatuses, setFixingStatuses] = useState(false);

  const fixStatuses = async () => {
    setFixingStatuses(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("bulk-backfill-scores", {
        body: { mode: "fix_statuses" },
      });
      if (error) throw new Error(error.message);
      const total = (result?.fixed_capitalization ?? 0) + (result?.fixed_has_scores ?? 0);
      toast.success(`Fixed ${total} games → "final" status`);
      setLoading(true);
      fetchData();
    } catch (e: any) {
      toast.error(`Status fix failed: ${e.message}`);
    } finally {
      setFixingStatuses(false);
    }
  };

  const tsdbSync = async (mode: string, league: string) => {
    const key = `${mode}_${league}`;
    setTsdbSyncing(key);
    try {
      const { data: result, error } = await supabase.functions.invoke("thesportsdb-sync", {
        body: { mode, league },
      });
      if (error) throw new Error(error.message || "Sync failed");
      if (result?.error) throw new Error(result.error);
      
      const summary = mode === "rosters"
        ? `${result.players_upserted} players across ${result.teams_processed} teams`
        : mode === "scores"
        ? `${result.games_upserted ?? result.games_updated ?? 0} games updated`
        : mode === "schedule"
        ? `${result.games_inserted} upcoming games added`
        : `${result.mapped} teams mapped`;
      
      toast.success(`${league} ${mode}: ${summary}`);
      setLoading(true);
      fetchData();
    } catch (e: any) {
      toast.error(`${league} ${mode} failed: ${e.message}`);
    } finally {
      setTsdbSyncing(null);
    }
  };


  const fetchData = async () => {
      // Use RPC-style counting to avoid the 1000-row limit
      const leagues = ["NBA", "NFL", "NHL", "MLB"];
      
      const gamePromises = leagues.map(async (league) => {
        const [totalRes, scoredRes] = await Promise.all([
          supabase.from("games").select("id", { count: "exact", head: true }).eq("league", league),
          supabase.from("games").select("id", { count: "exact", head: true }).eq("league", league).not("home_score", "is", null),
        ]);
        return {
          league,
          total: totalRes.count || 0,
          withScores: scoredRes.count || 0,
        };
      });

      const playerPromises = leagues.map(async (league) => {
        const [totalRes, bdRes, btRes, hsRes] = await Promise.all([
          supabase.from("players").select("id", { count: "exact", head: true }).eq("league", league),
          supabase.from("players").select("id", { count: "exact", head: true }).eq("league", league).not("birth_date", "is", null),
          supabase.from("players").select("id", { count: "exact", head: true }).eq("league", league).not("birth_time", "is", null),
          supabase.from("players").select("id", { count: "exact", head: true }).eq("league", league).not("headshot_url", "is", null),
        ]);
        return {
          league,
          total: totalRes.count || 0,
          withBirthDate: bdRes.count || 0,
          withBirthTime: btRes.count || 0,
          withHeadshot: hsRes.count || 0,
        };
      });

      const [gameResults, playerResults] = await Promise.all([
        Promise.all(gamePromises),
        Promise.all(playerPromises),
      ]);

      setGames(gameResults);
      setPlayers(playerResults);
      setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-xs text-muted-foreground animate-pulse">Loading data health...</p>
      </Card>
    );
  }

  const pct = (a: number, b: number) => b === 0 ? 0 : Math.round((a / b) * 100);

  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-sm font-semibold text-foreground">📊 Data Health Dashboard</h2>

      {/* Games & Scores */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Games & Scores</h3>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] gap-1"
            disabled={fixingStatuses || tsdbSyncing !== null}
            onClick={fixStatuses}
          >
            {fixingStatuses ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
            Fix Statuses
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {games.map((g) => {
            const scorePct = pct(g.withScores, g.total);
            const scoreKey = `scores_${g.league}`;
            const schedKey = `schedule_${g.league}`;
            return (
              <div key={g.league} className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold text-foreground">{g.league}</span>
                  <span className="text-[10px] text-muted-foreground">{g.total.toLocaleString()} games</span>
                </div>
                <Progress value={scorePct} className="h-2" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{g.withScores.toLocaleString()} scored</span>
                  <span className={scorePct === 0 ? "text-destructive font-medium" : scorePct === 100 ? "text-green-500 font-medium" : ""}>
                    {scorePct}%
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px] gap-1" disabled={tsdbSyncing !== null || fixingStatuses} onClick={() => tsdbSync("scores", g.league)}>
                    {tsdbSyncing === scoreKey ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trophy className="h-3 w-3" />} Scores
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px] gap-1" disabled={tsdbSyncing !== null || fixingStatuses} onClick={() => tsdbSync("schedule", g.league)}>
                    {tsdbSyncing === schedKey ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CalendarDays className="h-3 w-3" />} Sched
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Players / Roster */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Roster & Astro Data</h3>
        {players.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No player data yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {players.map((p) => {
              const rosterKey = `rosters_${p.league}`;
              return (
                <div key={p.league} className="border border-border rounded-md p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">{p.league}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{p.total} players</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1.5 text-[10px] gap-1"
                        disabled={tsdbSyncing !== null}
                        onClick={() => tsdbSync("rosters", p.league)}
                      >
                        {tsdbSyncing === rosterKey ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Sync
                      </Button>
                    </div>
                  </div>
                  <StatRow label="Birth date" value={p.withBirthDate} total={p.total} />
                  <StatRow label="Birth time" value={p.withBirthTime} total={p.total} />
                  <StatRow label="Headshots" value={p.withHeadshot} total={p.total} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function StatRow({ label, value, total }: { label: string; value: number; total: number }) {
  const p = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
      <Progress value={p} className="h-1.5 flex-1" />
      <span className={`w-8 text-right ${p === 0 ? "text-destructive" : p === 100 ? "text-green-500" : "text-muted-foreground"}`}>
        {p}%
      </span>
    </div>
  );
}
