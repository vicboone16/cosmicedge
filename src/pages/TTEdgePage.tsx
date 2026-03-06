import { useState, useEffect, useCallback } from "react";
import { useIsAdmin } from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";

interface DashboardRow {
  match_id: string;
  player_a: string;
  player_b: string;
  score_a: number;
  score_b: number;
  next_server: string;
  serves_left: number;
  status: string;
  win_prob_a: number;
  total_points: number;
  p_s: number;
  p_r: number;
  ml_odds_a: number | null;
  spread_line: number | null;
  spread_odds: number | null;
  total_line: number | null;
  over_odds: number | null;
  under_odds: number | null;
  cover_m15: number;
  cover_m25: number;
  cover_m35: number;
  cover_m45: number;
  over_165: number;
  over_175: number;
  over_185: number;
  over_195: number;
  over_205: number;
  ml_edge: number | null;
  spread_edge_m15: number | null;
  over_edge_185: number | null;
  under_edge_185: number | null;
  best_bet_tag: string;
}

function EdgeBadge({ label, value }: { label: string; value: number | null }) {
  if (value == null) return <div className="text-xs text-muted-foreground">{label}: —</div>;
  const color = value > 0.03 ? "text-green-400" : value < 0 ? "text-red-400" : "text-foreground";
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

export default function TTEdgePage() {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [matchId, setMatchId] = useState<string | null>(null);
  const [data, setData] = useState<DashboardRow | null>(null);

  // Start match form
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");
  const [firstServer, setFirstServer] = useState("A");
  const [pS, setPS] = useState("0.56");
  const [pR, setPR] = useState("0.52");

  // Odds form
  const [mlOddsA, setMlOddsA] = useState("");
  const [spreadLine, setSpreadLine] = useState("");
  const [spreadOdds, setSpreadOdds] = useState("");
  const [totalLine, setTotalLine] = useState("");
  const [overOdds, setOverOdds] = useState("");
  const [underOdds, setUnderOdds] = useState("");

  const fetchDashboard = useCallback(async () => {
    if (!matchId) return;
    const { data: rows, error } = await supabase
      .from("tt_admin_dashboard" as any)
      .select("*")
      .eq("match_id", matchId)
      .limit(1);
    if (error) { console.error(error); return; }
    if (rows && rows.length > 0) setData(rows[0] as unknown as DashboardRow);
  }, [matchId]);

  // Auto-refresh every 1s when live
  useEffect(() => {
    if (!matchId) return;
    fetchDashboard();
    const interval = setInterval(() => {
      if (data?.status !== "live" && data) return;
      fetchDashboard();
    }, 1000);
    return () => clearInterval(interval);
  }, [matchId, fetchDashboard, data?.status]);

  if (authLoading || adminLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!user || !isAdmin) return <Navigate to="/" replace />;

  const rpc = async (fn: string, params: Record<string, any>) => {
    const { data: result, error } = await supabase.rpc(fn as any, params as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    return result;
  };

  const startMatch = async () => {
    if (!playerA || !playerB) { toast({ title: "Enter both player names" }); return; }
    const id = await rpc("tt_start_match", {
      p_player_a: playerA, p_player_b: playerB, p_first_server: firstServer,
      p_ps: parseFloat(pS), p_pr: parseFloat(pR),
    });
    if (id) { setMatchId(id as string); toast({ title: "Match started!" }); }
  };

  const logPoint = async (winner: string) => {
    if (!matchId) return;
    await rpc("tt_log_point", { p_match_id: matchId, p_winner: winner });
    fetchDashboard();
  };

  const undoPoint = async () => {
    if (!matchId) return;
    await rpc("tt_undo_last_point", { p_match_id: matchId });
    fetchDashboard();
  };

  const resetMatch = async () => {
    if (!matchId) return;
    await rpc("tt_reset_match", { p_match_id: matchId });
    fetchDashboard();
  };

  const updateOdds = async () => {
    if (!matchId) return;
    await rpc("tt_update_odds", {
      p_match_id: matchId,
      p_ml_odds_a: mlOddsA ? parseFloat(mlOddsA) : null,
      p_spread_line: spreadLine ? parseFloat(spreadLine) : null,
      p_spread_odds: spreadOdds ? parseFloat(spreadOdds) : null,
      p_total_line: totalLine ? parseFloat(totalLine) : null,
      p_over_odds: overOdds ? parseFloat(overOdds) : null,
      p_under_odds: underOdds ? parseFloat(underOdds) : null,
    });
    toast({ title: "Odds updated" });
    fetchDashboard();
  };

  return (
    <div className="max-w-lg mx-auto p-4 pb-24 space-y-4">
      <h1 className="text-2xl font-bold text-center">🏓 Table Tennis Edge Lab</h1>

      {/* SECTION 3 — START MATCH */}
      {!matchId && (
        <Card>
          <CardHeader><CardTitle className="text-base">Start Match</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Player A</Label><Input value={playerA} onChange={e => setPlayerA(e.target.value)} placeholder="Player A" /></div>
            <div><Label>Player B</Label><Input value={playerB} onChange={e => setPlayerB(e.target.value)} placeholder="Player B" /></div>
            <div>
              <Label>First Server</Label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={firstServer} onChange={e => setFirstServer(e.target.value)}>
                <option value="A">A</option><option value="B">B</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>pS</Label><Input value={pS} onChange={e => setPS(e.target.value)} /></div>
              <div><Label>pR</Label><Input value={pR} onChange={e => setPR(e.target.value)} /></div>
            </div>
            <Button className="w-full h-12 text-base font-bold" onClick={startMatch}>Start Match</Button>
          </CardContent>
        </Card>
      )}

      {/* ACTIVE MATCH */}
      {matchId && data && (
        <>
          {/* SECTION 1 — MATCH HEADER */}
          <Card>
            <CardContent className="pt-6 text-center space-y-2">
              <div className="text-sm text-muted-foreground font-medium">{data.player_a} vs {data.player_b}</div>
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">A</div>
                  <div className="text-5xl font-black">{data.score_a}</div>
                </div>
                <div className="text-2xl text-muted-foreground">|</div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">B</div>
                  <div className="text-5xl font-black">{data.score_b}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Server: <span className="font-semibold text-foreground">{data.next_server}</span> · Serves left: {data.serves_left}
              </div>
              <div className={`text-xs font-bold ${data.status === "live" ? "text-green-400" : "text-muted-foreground"}`}>
                {data.status.toUpperCase()}
              </div>
            </CardContent>
          </Card>

          {/* SECTION 2 — POINT CONTROLS */}
          <div className="grid grid-cols-2 gap-3">
            <Button className="h-16 text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white" onClick={() => logPoint("A")}>
              A WON POINT
            </Button>
            <Button className="h-16 text-lg font-bold bg-orange-600 hover:bg-orange-700 text-white" onClick={() => logPoint("B")}>
              B WON POINT
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-10" onClick={undoPoint}>Undo Last Point</Button>
            <Button variant="destructive" className="h-10" onClick={resetMatch}>Reset Match</Button>
          </div>

          {/* SECTION 7 — BET SIGNAL */}
          <Card className={data.best_bet_tag !== "NONE" ? "border-green-500 bg-green-500/10" : "border-muted"}>
            <CardContent className="pt-6 text-center">
              {data.best_bet_tag !== "NONE" ? (
                <>
                  <div className="text-xs text-green-400 font-bold uppercase tracking-widest">Best Bet</div>
                  <div className="text-2xl font-black text-green-400">{data.best_bet_tag}</div>
                </>
              ) : (
                <div className="text-lg font-bold text-muted-foreground">PASS</div>
              )}
            </CardContent>
          </Card>

          {/* SECTION 5 — MODEL OUTPUT */}
          <div className="grid grid-cols-1 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Win Probability</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-center">{(data.win_prob_a * 100).toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground text-center">{data.player_a} to win</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Spread Model</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Cover -1.5</span><span className="font-bold">{(data.cover_m15 * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span>Cover -2.5</span><span className="font-bold">{(data.cover_m25 * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span>Cover -3.5</span><span className="font-bold">{(data.cover_m35 * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span>Cover -4.5</span><span className="font-bold">{(data.cover_m45 * 100).toFixed(1)}%</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Totals Model</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Over 16.5</span><span className="font-bold">{(data.over_165 * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span>Over 17.5</span><span className="font-bold">{(data.over_175 * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span>Over 18.5</span><span className="font-bold">{(data.over_185 * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span>Over 19.5</span><span className="font-bold">{(data.over_195 * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span>Over 20.5</span><span className="font-bold">{(data.over_205 * 100).toFixed(1)}%</span></div>
              </CardContent>
            </Card>
          </div>

          {/* SECTION 6 — EDGE ANALYSIS */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Edge Analysis</CardTitle></CardHeader>
            <CardContent>
              <EdgeBadge label="ML Edge" value={data.ml_edge} />
              <EdgeBadge label="Spread Edge (-1.5)" value={data.spread_edge_m15} />
              <EdgeBadge label="Over Edge (18.5)" value={data.over_edge_185} />
              <EdgeBadge label="Under Edge (18.5)" value={data.under_edge_185} />
            </CardContent>
          </Card>

          {/* SECTION 4 — ODDS INPUT */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Odds Input</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">ML A</Label><Input value={mlOddsA} onChange={e => setMlOddsA(e.target.value)} placeholder="-150" /></div>
                <div><Label className="text-xs">Spread Line</Label><Input value={spreadLine} onChange={e => setSpreadLine(e.target.value)} placeholder="-1.5" /></div>
                <div><Label className="text-xs">Spread Odds</Label><Input value={spreadOdds} onChange={e => setSpreadOdds(e.target.value)} placeholder="-110" /></div>
                <div><Label className="text-xs">Total Line</Label><Input value={totalLine} onChange={e => setTotalLine(e.target.value)} placeholder="18.5" /></div>
                <div><Label className="text-xs">Over Odds</Label><Input value={overOdds} onChange={e => setOverOdds(e.target.value)} placeholder="-110" /></div>
                <div><Label className="text-xs">Under Odds</Label><Input value={underOdds} onChange={e => setUnderOdds(e.target.value)} placeholder="-110" /></div>
              </div>
              <Button className="w-full" onClick={updateOdds}>Update Odds</Button>
            </CardContent>
          </Card>

          {/* New match button */}
          <Button variant="outline" className="w-full" onClick={() => { setMatchId(null); setData(null); }}>
            ← New Match
          </Button>
        </>
      )}

      {matchId && !data && (
        <div className="text-center text-muted-foreground py-8">Loading match data...</div>
      )}
    </div>
  );
}
