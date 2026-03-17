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
  const [sportsFilter, setSportsFilter] = useState("baseball,hockey");
  const [booksFilter, setBooksFilter] = useState("draftkings,fanduel,betmgm,caesars");
  const [marketsFilter, setMarketsFilter] = useState("moneyline,spread,total");

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
        <h1 className="text-lg font-bold font-display flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          BoltOdds Monitor
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Server-side WebSocket odds feed</p>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Connection Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {isConnected ? <Wifi className="h-4 w-4 text-cosmic-green" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
              Connection Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={isConnected ? "default" : "secondary"}>
                {connStatus?.status ?? "unknown"}
              </Badge>
              {connStatus?.reconnect_count ? (
                <span className="text-xs text-muted-foreground">
                  Reconnects: {connStatus.reconnect_count}
                </span>
              ) : null}
            </div>
            {connStatus?.last_connected_at && (
              <p className="text-xs text-muted-foreground">
                Last connected: {format(new Date(connStatus.last_connected_at), "PPp")}
              </p>
            )}
            {connStatus?.last_message_at && (
              <p className="text-xs text-muted-foreground">
                Last message: {format(new Date(connStatus.last_message_at), "PPp")}
              </p>
            )}
            {connStatus?.last_error && (
              <p className="text-xs text-destructive">{connStatus.last_error}</p>
            )}
            <Button
              size="sm"
              onClick={() => startSocket.mutate()}
              disabled={startSocket.isPending}
              className="mt-2"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${startSocket.isPending ? "animate-spin" : ""}`} />
              {startSocket.isPending ? "Connecting..." : "Start Socket Session"}
            </Button>
          </CardContent>
        </Card>

        {/* Subscription Filters */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Subscription Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Sports (comma-separated)</Label>
              <Input value={sportsFilter} onChange={e => setSportsFilter(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Sportsbooks (comma-separated)</Label>
              <Input value={booksFilter} onChange={e => setBooksFilter(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Markets (comma-separated)</Label>
              <Input value={marketsFilter} onChange={e => setMarketsFilter(e.target.value)} className="h-8 text-xs" />
            </div>
          </CardContent>
        </Card>

        {/* Active Games */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Active Games ({games?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {!games?.length ? (
              <p className="text-xs text-muted-foreground">No games received yet. Start a socket session.</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {games.map((g: Record<string, unknown>) => (
                  <div key={g.id as string} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                    <div>
                      <span className="font-medium">{g.away_team as string} @ {g.home_team as string}</span>
                      <Badge variant="outline" className="ml-2 text-[10px]">{g.sport as string}</Badge>
                    </div>
                    <span className="text-muted-foreground">{g.status as string}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Outcomes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Latest Odds Updates ({outcomes?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {!outcomes?.length ? (
              <p className="text-xs text-muted-foreground">No odds data yet.</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {outcomes.map((o: Record<string, unknown>) => {
                  const mkt = o.bolt_markets as Record<string, unknown> | null;
                  return (
                    <div key={o.id as string} className="text-xs p-2 rounded bg-muted/30 flex justify-between">
                      <div>
                        <span className="font-medium">{mkt?.player_name as string ?? mkt?.market_name as string}</span>
                        <span className="text-muted-foreground ml-1">• {o.outcome_name as string}</span>
                      </div>
                      <div className="flex gap-2">
                        {o.line != null && <span>L: {String(o.line)}</span>}
                        {o.american_odds != null && <span className="font-mono">{Number(o.american_odds) > 0 ? "+" : ""}{String(o.american_odds)}</span>}
                        <Badge variant="outline" className="text-[10px]">{o.sportsbook as string}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Message Log */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Messages ({logs?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!logs?.length ? (
              <p className="text-xs text-muted-foreground">No messages logged yet.</p>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {logs.map((l: Record<string, unknown>) => (
                  <div key={l.id as string} className="text-xs p-1.5 rounded bg-muted/20 flex justify-between">
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-[10px]">{l.message_type as string}</Badge>
                      {l.sport && <span className="text-muted-foreground">{l.sport as string}</span>}
                    </div>
                    <span className="text-muted-foreground">
                      {format(new Date(l.created_at as string), "HH:mm:ss")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
