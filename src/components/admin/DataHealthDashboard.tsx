import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
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
  const [syncing, setSyncing] = useState<string | null>(null);

  const syncRoster = async (league: string) => {
    setSyncing(league);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-players?mode=roster&league=${league}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Sync failed");
      toast.success(`${league} roster synced: ${result.meta?.players_upserted || 0} players updated`);
      // Refresh data
      setLoading(true);
      fetchData();
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(null);
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

      {/* Games */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Games & Scores</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {games.map((g) => {
            const scorePct = pct(g.withScores, g.total);
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
            {players.map((p) => (
              <div key={p.league} className="border border-border rounded-md p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{p.league}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{p.total} players</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-[10px]"
                      disabled={syncing !== null}
                      onClick={() => syncRoster(p.league)}
                    >
                      <RefreshCw className={`h-3 w-3 ${syncing === p.league ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
                <StatRow label="Birth date" value={p.withBirthDate} total={p.total} />
                <StatRow label="Birth time" value={p.withBirthTime} total={p.total} />
                <StatRow label="Headshots" value={p.withHeadshot} total={p.total} />
              </div>
            ))}
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
