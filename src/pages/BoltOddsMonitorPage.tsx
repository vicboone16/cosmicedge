import { useIsAdmin } from "@/hooks/use-admin";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Wifi, WifiOff, RefreshCw, Clock, Zap, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function BoltOddsMonitorPage() {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const qc = useQueryClient();
  const [showAdmin, setShowAdmin] = useState(false);
  const [sportsFilter, setSportsFilter] = useState("MLB,NHL");
  const [booksFilter, setBooksFilter] = useState("draftkings,fanduel,betmgm,caesars");
  const [marketsFilter, setMarketsFilter] = useState("Moneyline,Spread,Total");

  // Connection status
  const { data: connStatus } = useQuery({
    queryKey: ["bolt-connection-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bolt_connection_status")
        .select("*")
        .limit(1)
        .single();
      return data;
    },
    enabled: isAdmin,
    refetchInterval: 5000,
  });

  // Recent logs
  const { data: logs } = useQuery({
    queryKey: ["bolt-socket-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bolt_socket_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: isAdmin,
    refetchInterval: 10000,
  });

  // Active games
  const { data: games } = useQuery({
    queryKey: ["bolt-games"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bolt_games")
        .select("*")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
    enabled: isAdmin,
    refetchInterval: 15000,
  });

  // Recent outcomes
  const { data: outcomes } = useQuery({
    queryKey: ["bolt-outcomes-recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bolt_outcomes")
        .select("*, bolt_markets!inner(market_name, player_name, bolt_game_id)")
        .order("updated_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: isAdmin,
    refetchInterval: 15000,
  });

  // Start socket
  const startSocket = useMutation({
    mutationFn: async () => {
      const filters = {
        sports: sportsFilter.split(",").map(s => s.trim()),
        sportsbooks: booksFilter.split(",").map(s => s.trim()),
        markets: marketsFilter.split(",").map(s => s.trim()),
      };
      const { data, error } = await supabase.functions.invoke("boltodds-ws", {
        body: { filters },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Socket session complete: ${data?.messages ?? 0} messages`);
      qc.invalidateQueries({ queryKey: ["bolt-connection-status"] });
      qc.invalidateQueries({ queryKey: ["bolt-socket-logs"] });
      qc.invalidateQueries({ queryKey: ["bolt-games"] });
    },
    onError: (err) => toast.error(`Socket error: ${err.message}`),
  });

  if (adminLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!isAdmin) return <div className="p-6 text-destructive font-bold">Admin access required</div>;

  const isConnected = connStatus?.status === "connected";

  return (
    <div className="min-h-screen pb-24 bg-background">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold font-display flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Live Odds Feed
            </h1>
            <p className="text-xs text-muted-foreground mt-1">Real-time market data</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? "default" : "secondary"} className="text-[10px]">
              {isConnected ? "Connected" : "Offline"}
            </Badge>
          </div>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Active Games — Primary content */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Live Games ({games?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {!games?.length ? (
              <div className="text-center py-6 space-y-2">
                <p className="text-xs text-muted-foreground">No active games.</p>
                <Button size="sm" variant="outline" onClick={() => startSocket.mutate()} disabled={startSocket.isPending}>
                  <RefreshCw className={`h-3 w-3 mr-1 ${startSocket.isPending ? "animate-spin" : ""}`} />
                  Refresh Feed
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {games.map((g: Record<string, unknown>) => (
                  <div key={g.id as string} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-secondary/20 border border-border/50">
                    <div>
                      <span className="font-semibold text-foreground">{g.away_team as string} @ {g.home_team as string}</span>
                      <Badge variant="outline" className="ml-2 text-[10px]">{g.sport as string}</Badge>
                    </div>
                    <span className="text-muted-foreground text-[10px]">{g.status as string}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Latest Odds — Primary content */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Latest Odds ({outcomes?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {!outcomes?.length ? (
              <p className="text-xs text-muted-foreground">No odds data yet.</p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {outcomes.map((o: Record<string, unknown>) => {
                  const mkt = o.bolt_markets as Record<string, unknown> | null;
                  return (
                    <div key={o.id as string} className="text-xs p-2 rounded-lg bg-secondary/20 flex justify-between items-center">
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">{mkt?.player_name as string ?? mkt?.market_name as string}</span>
                        <span className="text-muted-foreground ml-1">· {o.outcome_name as string}</span>
                      </div>
                      <div className="flex gap-2 items-center shrink-0">
                        {o.line != null && <span className="text-muted-foreground tabular-nums">{String(o.line)}</span>}
                        {o.american_odds != null && <span className="font-mono font-semibold tabular-nums">{Number(o.american_odds) > 0 ? "+" : ""}{String(o.american_odds)}</span>}
                        <Badge variant="outline" className="text-[9px]">{o.sportsbook as string}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Admin Controls — collapsible */}
        {isAdmin && (
          <Card>
            <CardHeader className="pb-2">
              <button onClick={() => setShowAdmin(!showAdmin)} className="w-full flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Admin Controls
                </CardTitle>
                <span className="text-[10px] text-muted-foreground">{showAdmin ? "▲" : "▼"}</span>
              </button>
            </CardHeader>
            {showAdmin && (
              <CardContent className="space-y-4">
                {/* Connection Details */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Connection</p>
                  {connStatus?.last_connected_at && (
                    <p className="text-xs text-muted-foreground">Last connected: {format(new Date(connStatus.last_connected_at), "PPp")}</p>
                  )}
                  {connStatus?.last_error && (
                    <p className="text-xs text-destructive">{connStatus.last_error}</p>
                  )}
                  <Button size="sm" onClick={() => startSocket.mutate()} disabled={startSocket.isPending}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${startSocket.isPending ? "animate-spin" : ""}`} />
                    {startSocket.isPending ? "Connecting..." : "Start Socket Session"}
                  </Button>
                </div>

                {/* Filters */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Filters</p>
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <Label className="text-[10px]">Sports</Label>
                      <Input value={sportsFilter} onChange={e => setSportsFilter(e.target.value)} className="h-7 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Books</Label>
                      <Input value={booksFilter} onChange={e => setBooksFilter(e.target.value)} className="h-7 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Markets</Label>
                      <Input value={marketsFilter} onChange={e => setMarketsFilter(e.target.value)} className="h-7 text-xs" />
                    </div>
                  </div>
                </div>

                {/* Message Log */}
                {logs && logs.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">Recent Messages ({logs.length})</p>
                    <div className="space-y-0.5 max-h-40 overflow-y-auto">
                      {logs.slice(0, 20).map((l: Record<string, unknown>) => (
                        <div key={l.id as string} className="text-[10px] p-1 rounded bg-muted/20 flex justify-between">
                          <div className="flex gap-1.5">
                            <Badge variant="outline" className="text-[8px] px-1">{l.message_type as string}</Badge>
                            {l.sport && <span className="text-muted-foreground">{l.sport as string}</span>}
                          </div>
                          <span className="text-muted-foreground tabular-nums">{format(new Date(l.created_at as string), "HH:mm:ss")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
