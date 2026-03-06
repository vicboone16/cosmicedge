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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/* ── types ── */
interface OpportunityRow {
  match_id: string;
  player_a: string;
  player_b: string;
  score_a: number;
  score_b: number;
  next_server: string;
  serves_left: number;
  status: string;
  win_prob_a: number;
  ml_edge: number | null;
  spread_edge: number | null;
  best_edge: number | null;
  best_bet_tag: string;
}

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

interface MomentumRow {
  match_id: string;
  win_prob_jump: number | null;
  momentum_level: string | null;
}

/* ── helpers ── */
function pct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function edgeColor(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v > 0.03) return "text-green-400";
  if (v < 0) return "text-red-400";
  return "text-foreground";
}

function rowBg(bestEdge: number | null) {
  if (bestEdge == null) return "";
  if (bestEdge > 0.05) return "bg-green-500/10";
  if (bestEdge > 0.02) return "bg-yellow-500/10";
  if (bestEdge < 0) return "bg-red-500/10";
  return "";
}

/* ── main ── */
export default function TTEdgePage() {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardRow | null>(null);
  const [momentum, setMomentum] = useState<MomentumRow | null>(null);

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

  /* ── fetchers ── */
  const fetchOpportunities = useCallback(async () => {
    const { data, error } = await supabase
      .from("tt_best_opportunities" as any)
      .select("*");
    if (!error && data) setOpportunities(data as unknown as OpportunityRow[]);
  }, []);

  const fetchDashboard = useCallback(async () => {
    if (!selectedMatchId) return;
    const { data, error } = await supabase
      .from("tt_admin_dashboard" as any)
      .select("*")
      .eq("match_id", selectedMatchId)
      .limit(1);
    if (!error && data && data.length > 0) setDashboard(data[0] as unknown as DashboardRow);
  }, [selectedMatchId]);

  const fetchMomentum = useCallback(async () => {
    if (!selectedMatchId) return;
    const { data, error } = await supabase
      .from("tt_momentum_signal" as any)
      .select("*")
      .eq("match_id", selectedMatchId)
      .limit(1);
    if (!error && data && data.length > 0) setMomentum(data[0] as unknown as MomentumRow);
    else setMomentum(null);
  }, [selectedMatchId]);

  // Monitor: 2s refresh
  useEffect(() => {
    fetchOpportunities();
    const iv = setInterval(fetchOpportunities, 2000);
    return () => clearInterval(iv);
  }, [fetchOpportunities]);

  // Console: 1s refresh
  useEffect(() => {
    if (!selectedMatchId) return;
    fetchDashboard();
    fetchMomentum();
    const iv = setInterval(() => {
      fetchDashboard();
      fetchMomentum();
    }, 1000);
    return () => clearInterval(iv);
  }, [selectedMatchId, fetchDashboard, fetchMomentum]);

  /* ── auth guard ── */
  if (authLoading || adminLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!user || !isAdmin) return <Navigate to="/" replace />;

  /* ── RPC helper ── */
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
    if (id) { setSelectedMatchId(id as string); toast({ title: "Match started!" }); }
  };

  const logPoint = async (winner: string) => {
    if (!selectedMatchId) return;
    await rpc("tt_log_point", { p_match_id: selectedMatchId, p_winner: winner });
    fetchDashboard();
  };

  const undoPoint = async () => {
    if (!selectedMatchId) return;
    await rpc("tt_undo_last_point", { p_match_id: selectedMatchId });
    fetchDashboard();
  };

  const resetMatch = async () => {
    if (!selectedMatchId) return;
    await rpc("tt_reset_match", { p_match_id: selectedMatchId });
    fetchDashboard();
  };

  const updateOdds = async () => {
    if (!selectedMatchId) return;
    await rpc("tt_update_odds", {
      p_match_id: selectedMatchId,
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

  const d = dashboard;

  return (
    <div className="p-4 pb-24 space-y-4">
      <h1 className="text-2xl font-bold text-center">🏓 Table Tennis Edge Lab</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ═══ LEFT: LIVE MATCH MONITOR ═══ */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Live Match Monitor</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Players</TableHead>
                    <TableHead className="text-xs">Score</TableHead>
                    <TableHead className="text-xs">Srv</TableHead>
                    <TableHead className="text-xs">Win%</TableHead>
                    <TableHead className="text-xs">Spr Edge</TableHead>
                    <TableHead className="text-xs">ML Edge</TableHead>
                    <TableHead className="text-xs">Best</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No live matches</TableCell></TableRow>
                  )}
                  {opportunities.map(o => (
                    <TableRow
                      key={o.match_id}
                      className={`cursor-pointer ${rowBg(o.best_edge)} ${o.match_id === selectedMatchId ? "ring-1 ring-primary" : ""}`}
                      onClick={() => setSelectedMatchId(o.match_id)}
                    >
                      <TableCell className="text-xs font-medium py-2">{o.player_a} v {o.player_b}</TableCell>
                      <TableCell className="text-xs font-bold py-2">{o.score_a}–{o.score_b}</TableCell>
                      <TableCell className="text-xs py-2">{o.next_server}({o.serves_left})</TableCell>
                      <TableCell className="text-xs py-2">{pct(o.win_prob_a)}</TableCell>
                      <TableCell className={`text-xs font-bold py-2 ${edgeColor(o.spread_edge)}`}>{pct(o.spread_edge)}</TableCell>
                      <TableCell className={`text-xs font-bold py-2 ${edgeColor(o.ml_edge)}`}>{pct(o.ml_edge)}</TableCell>
                      <TableCell className={`text-xs font-bold py-2 ${edgeColor(o.best_edge)}`}>{pct(o.best_edge)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* START MATCH */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Start New Match</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Player A</Label><Input value={playerA} onChange={e => setPlayerA(e.target.value)} placeholder="Player A" /></div>
                <div><Label className="text-xs">Player B</Label><Input value={playerB} onChange={e => setPlayerB(e.target.value)} placeholder="Player B" /></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">First Server</Label>
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={firstServer} onChange={e => setFirstServer(e.target.value)}>
                    <option value="A">A</option><option value="B">B</option>
                  </select>
                </div>
                <div><Label className="text-xs">pS</Label><Input value={pS} onChange={e => setPS(e.target.value)} /></div>
                <div><Label className="text-xs">pR</Label><Input value={pR} onChange={e => setPR(e.target.value)} /></div>
              </div>
              <Button className="w-full h-10 font-bold" onClick={startMatch}>Start Match</Button>
            </CardContent>
          </Card>
        </div>

        {/* ═══ RIGHT: MATCH TRADING CONSOLE ═══ */}
        <div className="space-y-3">
          {!selectedMatchId && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Select a match from the monitor or start a new one</CardContent></Card>
          )}

          {selectedMatchId && !d && (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Loading…</CardContent></Card>
          )}

          {selectedMatchId && d && (
            <>
              {/* MATCH HEADER */}
              <Card>
                <CardContent className="pt-4 text-center space-y-1">
                  <div className="text-sm text-muted-foreground font-medium">{d.player_a} vs {d.player_b}</div>
                  <div className="flex items-center justify-center gap-6">
                    <div className="text-center"><div className="text-xs text-muted-foreground">A</div><div className="text-5xl font-black">{d.score_a}</div></div>
                    <div className="text-2xl text-muted-foreground">|</div>
                    <div className="text-center"><div className="text-xs text-muted-foreground">B</div><div className="text-5xl font-black">{d.score_b}</div></div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Server: <span className="font-semibold text-foreground">{d.next_server}</span> · Serves left: {d.serves_left}
                  </div>
                  <div className={`text-xs font-bold ${d.status === "live" ? "text-green-400" : "text-muted-foreground"}`}>{d.status.toUpperCase()}</div>
                </CardContent>
              </Card>

              {/* POINT CONTROLS */}
              <div className="grid grid-cols-2 gap-2">
                <Button className="h-14 text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white" onClick={() => logPoint("A")}>A WON POINT</Button>
                <Button className="h-14 text-lg font-bold bg-orange-600 hover:bg-orange-700 text-white" onClick={() => logPoint("B")}>B WON POINT</Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={undoPoint}>Undo</Button>
                <Button variant="destructive" size="sm" onClick={resetMatch}>Reset</Button>
              </div>

              {/* BET SIGNAL */}
              <Card className={d.best_bet_tag !== "NONE" ? "border-green-500 bg-green-500/10" : "border-muted"}>
                <CardContent className="py-4 text-center">
                  {d.best_bet_tag !== "NONE" ? (
                    <><div className="text-xs text-green-400 font-bold uppercase tracking-widest">Best Bet</div><div className="text-2xl font-black text-green-400">{d.best_bet_tag}</div></>
                  ) : (
                    <div className="text-lg font-bold text-muted-foreground">PASS</div>
                  )}
                </CardContent>
              </Card>

              {/* MODEL OUTPUT */}
              <div className="grid grid-cols-3 gap-2">
                <Card><CardContent className="py-3 text-center"><div className="text-xs text-muted-foreground">Win Prob</div><div className="text-xl font-black">{pct(d.win_prob_a)}</div></CardContent></Card>
                <Card><CardContent className="py-3 text-center"><div className="text-xs text-muted-foreground">Cover -1.5</div><div className="text-xl font-black">{pct(d.cover_m15)}</div></CardContent></Card>
                <Card><CardContent className="py-3 text-center"><div className="text-xs text-muted-foreground">Over 18.5</div><div className="text-xl font-black">{pct(d.over_185)}</div></CardContent></Card>
              </div>

              {/* EDGE PANEL */}
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-sm">Edge Analysis</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {([["ML Edge", d.ml_edge], ["Spread Edge", d.spread_edge_m15], ["Over Edge", d.over_edge_185]] as [string, number | null][]).map(([label, val]) => (
                    <div key={label} className="flex justify-between items-center py-0.5">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <span className={`text-sm font-bold ${edgeColor(val)}`}>{pct(val)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* MOMENTUM */}
              {momentum && (
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-sm">Momentum</CardTitle></CardHeader>
                  <CardContent className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Level</span>
                    <span className={`text-sm font-bold ${momentum.momentum_level === "A_HOT" ? "text-blue-400" : momentum.momentum_level === "B_HOT" ? "text-orange-400" : "text-muted-foreground"}`}>
                      {momentum.momentum_level ?? "—"}
                    </span>
                  </CardContent>
                </Card>
              )}

              {/* ODDS INPUT */}
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-sm">Odds Input</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label className="text-xs">ML A</Label><Input value={mlOddsA} onChange={e => setMlOddsA(e.target.value)} placeholder="-150" /></div>
                    <div><Label className="text-xs">Spread</Label><Input value={spreadLine} onChange={e => setSpreadLine(e.target.value)} placeholder="-1.5" /></div>
                    <div><Label className="text-xs">Spr Odds</Label><Input value={spreadOdds} onChange={e => setSpreadOdds(e.target.value)} placeholder="-110" /></div>
                    <div><Label className="text-xs">Total</Label><Input value={totalLine} onChange={e => setTotalLine(e.target.value)} placeholder="18.5" /></div>
                    <div><Label className="text-xs">Over</Label><Input value={overOdds} onChange={e => setOverOdds(e.target.value)} placeholder="-110" /></div>
                    <div><Label className="text-xs">Under</Label><Input value={underOdds} onChange={e => setUnderOdds(e.target.value)} placeholder="-110" /></div>
                  </div>
                  <Button className="w-full" size="sm" onClick={updateOdds}>Update Odds</Button>
                </CardContent>
              </Card>

              <Button variant="outline" size="sm" className="w-full" onClick={() => { setSelectedMatchId(null); setDashboard(null); setMomentum(null); }}>
                ← Back to Monitor
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
