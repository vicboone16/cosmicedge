import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Search, Save, CalendarIcon, TrendingUp } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { cn } from "@/lib/utils";

interface GameRow {
  id: string;
  league: string;
  home_team: string;
  away_team: string;
  home_abbr: string;
  away_abbr: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  start_time: string;
}

interface OddsFormState {
  bookmaker: string;
  ml_home: string;
  ml_away: string;
  spread_line: string;
  spread_home: string;
  spread_away: string;
  total_line: string;
  total_over: string;
  total_under: string;
}

const EMPTY_ODDS: OddsFormState = {
  bookmaker: "consensus",
  ml_home: "", ml_away: "",
  spread_line: "", spread_home: "", spread_away: "",
  total_line: "", total_over: "", total_under: "",
};

export default function AdminGameManager() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [league, setLeague] = useState("ALL");
  const [search, setSearch] = useState("");
  const [editGame, setEditGame] = useState<GameRow | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editHomeScore, setEditHomeScore] = useState("");
  const [editAwayScore, setEditAwayScore] = useState("");
  const [oddsForm, setOddsForm] = useState<OddsFormState>({ ...EMPTY_ODDS });

  const dateStr = format(date, "yyyy-MM-dd");

  const { data: games = [], isLoading } = useQuery({
    queryKey: ["admin-games", dateStr, league],
    queryFn: async () => {
      const start = `${dateStr}T00:00:00Z`;
      const end = `${dateStr}T23:59:59Z`;
      let q = supabase
        .from("games")
        .select("id, league, home_team, away_team, home_abbr, away_abbr, home_score, away_score, status, start_time")
        .gte("start_time", start)
        .lte("start_time", end)
        .order("start_time", { ascending: true });
      if (league !== "ALL") q = q.eq("league", league);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as GameRow[];
    },
  });

  // Fetch existing odds for the selected game
  const { data: existingOdds } = useQuery({
    queryKey: ["admin-game-odds", editGame?.id],
    queryFn: async () => {
      if (!editGame) return [];
      const { data } = await supabase
        .from("odds_snapshots")
        .select("*")
        .eq("game_id", editGame.id)
        .order("captured_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!editGame,
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; status: string; home_score: number | null; away_score: number | null }) => {
      const { error } = await supabase
        .from("games")
        .update({ status: payload.status, home_score: payload.home_score, away_score: payload.away_score, updated_at: new Date().toISOString() })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-games"] });
      toast({ title: "Game updated" });
      setEditGame(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const oddsMutation = useMutation({
    mutationFn: async () => {
      if (!editGame) throw new Error("No game selected");
      const rows: any[] = [];
      const now = new Date().toISOString();
      const bk = oddsForm.bookmaker || "consensus";

      if (oddsForm.ml_home || oddsForm.ml_away) {
        rows.push({
          game_id: editGame.id,
          bookmaker: bk,
          market_type: "moneyline",
          home_price: oddsForm.ml_home ? Number(oddsForm.ml_home) : null,
          away_price: oddsForm.ml_away ? Number(oddsForm.ml_away) : null,
          line: null,
          captured_at: now,
        });
      }
      if (oddsForm.spread_line || oddsForm.spread_home || oddsForm.spread_away) {
        rows.push({
          game_id: editGame.id,
          bookmaker: bk,
          market_type: "spread",
          home_price: oddsForm.spread_home ? Number(oddsForm.spread_home) : null,
          away_price: oddsForm.spread_away ? Number(oddsForm.spread_away) : null,
          line: oddsForm.spread_line ? Number(oddsForm.spread_line) : null,
          captured_at: now,
        });
      }
      if (oddsForm.total_line || oddsForm.total_over || oddsForm.total_under) {
        rows.push({
          game_id: editGame.id,
          bookmaker: bk,
          market_type: "total",
          home_price: oddsForm.total_over ? Number(oddsForm.total_over) : null,
          away_price: oddsForm.total_under ? Number(oddsForm.total_under) : null,
          line: oddsForm.total_line ? Number(oddsForm.total_line) : null,
          captured_at: now,
        });
      }
      if (rows.length === 0) throw new Error("Enter at least one odds value");
      const { error } = await supabase.from("odds_snapshots").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["admin-game-odds"] });
      toast({ title: `${count} odds line(s) saved` });
      setOddsForm({ ...EMPTY_ODDS });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkFinalize = useMutation({
    mutationFn: async () => {
      const toFix = games.filter(g => g.status === "scheduled" && g.home_score != null && g.away_score != null && new Date(g.start_time) < new Date());
      if (!toFix.length) throw new Error("No games to finalize");
      const ids = toFix.map(g => g.id);
      const { error } = await supabase
        .from("games")
        .update({ status: "final", updated_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      return toFix.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["admin-games"] });
      toast({ title: `${count} games finalized` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = useCallback((game: GameRow) => {
    setEditGame(game);
    setEditStatus(game.status);
    setEditHomeScore(game.home_score?.toString() ?? "");
    setEditAwayScore(game.away_score?.toString() ?? "");
    setOddsForm({ ...EMPTY_ODDS });
  }, []);

  const handleSave = () => {
    if (!editGame) return;
    updateMutation.mutate({
      id: editGame.id,
      status: editStatus,
      home_score: editHomeScore ? Number(editHomeScore) : null,
      away_score: editAwayScore ? Number(editAwayScore) : null,
    });
  };

  const filtered = search
    ? games.filter(g =>
        g.home_abbr.toLowerCase().includes(search.toLowerCase()) ||
        g.away_abbr.toLowerCase().includes(search.toLowerCase()) ||
        g.home_team.toLowerCase().includes(search.toLowerCase()) ||
        g.away_team.toLowerCase().includes(search.toLowerCase())
      )
    : games;

  const scheduledWithScores = games.filter(g => g.status === "scheduled" && g.home_score != null && g.away_score != null && new Date(g.start_time) < new Date());

  const updateOdds = (key: keyof OddsFormState, val: string) => setOddsForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="space-y-4">
      {/* Date nav with clickable date picker */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setDate(d => subDays(d, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-[140px] h-9 text-sm font-medium gap-2 justify-center">
              <CalendarIcon className="h-3.5 w-3.5" />
              {format(date, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => { if (d) { setDate(d); setCalendarOpen(false); } }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="icon" onClick={() => setDate(d => addDays(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={league} onValueChange={setLeague}>
          <SelectTrigger className="w-24 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="NBA">NBA</SelectItem>
            <SelectItem value="NHL">NHL</SelectItem>
            <SelectItem value="NFL">NFL</SelectItem>
            <SelectItem value="MLB">MLB</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[150px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams..." className="pl-8 h-9 text-xs" />
        </div>
      </div>

      {/* Bulk fix */}
      {scheduledWithScores.length > 0 && (
        <Button variant="destructive" size="sm" onClick={() => bulkFinalize.mutate()} disabled={bulkFinalize.isPending} className="text-xs">
          Finalize {scheduledWithScores.length} scored games still marked "scheduled"
        </Button>
      )}

      {/* Game list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading games...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No games found for this date.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(g => (
            <Card key={g.id} className="p-3 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => openEdit(g)}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{g.league}</Badge>
                  <span className="text-sm font-medium text-foreground">{g.away_abbr} @ {g.home_abbr}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {(g.away_score != null && g.home_score != null) ? (
                    <span className="text-xs text-muted-foreground">{g.away_score} - {g.home_score}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No score</span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{format(new Date(g.start_time), "h:mm a")}</span>
                </div>
              </div>
              <Badge variant={g.status === "final" ? "default" : g.status === "scheduled" ? "secondary" : "outline"} className="text-[10px] uppercase">
                {g.status}
              </Badge>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog with tabs: Game Info + Odds */}
      <Dialog open={!!editGame} onOpenChange={(open) => !open && setEditGame(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit: {editGame?.away_abbr} @ {editGame?.home_abbr}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="game" className="w-full">
            <TabsList className="w-full grid grid-cols-2 h-8">
              <TabsTrigger value="game" className="text-[10px]">Game Info</TabsTrigger>
              <TabsTrigger value="odds" className="text-[10px]">Odds</TabsTrigger>
            </TabsList>

            {/* Game Info Tab */}
            <TabsContent value="game" className="mt-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground">Status</label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="final">Final</SelectItem>
                    <SelectItem value="postponed">Postponed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground">{editGame?.away_abbr} Score</label>
                  <Input type="number" value={editAwayScore} onChange={e => setEditAwayScore(e.target.value)} className="h-9 text-xs" />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">{editGame?.home_abbr} Score</label>
                  <Input type="number" value={editHomeScore} onChange={e => setEditHomeScore(e.target.value)} className="h-9 text-xs" />
                </div>
              </div>
              <Button onClick={handleSave} disabled={updateMutation.isPending} size="sm" className="gap-1 w-full">
                <Save className="h-3 w-3" /> Save Game
              </Button>
            </TabsContent>

            {/* Odds Tab */}
            <TabsContent value="odds" className="mt-3 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground">Bookmaker</label>
                <Input value={oddsForm.bookmaker} onChange={e => updateOdds("bookmaker", e.target.value)} placeholder="consensus" className="h-8 text-xs" />
              </div>

              {/* Moneyline */}
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Moneyline</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">{editGame?.home_abbr} (Home)</label>
                    <Input type="number" value={oddsForm.ml_home} onChange={e => updateOdds("ml_home", e.target.value)} placeholder="-110" className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">{editGame?.away_abbr} (Away)</label>
                    <Input type="number" value={oddsForm.ml_away} onChange={e => updateOdds("ml_away", e.target.value)} placeholder="+105" className="h-8 text-xs" />
                  </div>
                </div>
              </div>

              {/* Spread */}
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Spread</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Line</label>
                    <Input type="number" step="0.5" value={oddsForm.spread_line} onChange={e => updateOdds("spread_line", e.target.value)} placeholder="-3.5" className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">{editGame?.home_abbr}</label>
                    <Input type="number" value={oddsForm.spread_home} onChange={e => updateOdds("spread_home", e.target.value)} placeholder="-110" className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">{editGame?.away_abbr}</label>
                    <Input type="number" value={oddsForm.spread_away} onChange={e => updateOdds("spread_away", e.target.value)} placeholder="-110" className="h-8 text-xs" />
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total (Over/Under)</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Line</label>
                    <Input type="number" step="0.5" value={oddsForm.total_line} onChange={e => updateOdds("total_line", e.target.value)} placeholder="215.5" className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Over</label>
                    <Input type="number" value={oddsForm.total_over} onChange={e => updateOdds("total_over", e.target.value)} placeholder="-110" className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Under</label>
                    <Input type="number" value={oddsForm.total_under} onChange={e => updateOdds("total_under", e.target.value)} placeholder="-110" className="h-8 text-xs" />
                  </div>
                </div>
              </div>

              <Button onClick={() => oddsMutation.mutate()} disabled={oddsMutation.isPending} size="sm" className="gap-1 w-full">
                <TrendingUp className="h-3 w-3" /> Save Odds
              </Button>

              {/* Existing odds for this game */}
              {existingOdds && existingOdds.length > 0 && (
                <div className="pt-2 border-t border-border/50 space-y-1.5">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Existing Odds ({existingOdds.length})</h4>
                  {existingOdds.map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between bg-secondary/30 rounded px-2 py-1.5 text-[10px]">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[8px] uppercase">{o.market_type}</Badge>
                        <span className="text-muted-foreground">{o.bookmaker}</span>
                      </div>
                      <div className="flex items-center gap-2 text-foreground tabular-nums">
                        {o.line != null && <span>L: {o.line}</span>}
                        {o.home_price != null && <span>H: {o.home_price}</span>}
                        {o.away_price != null && <span>A: {o.away_price}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
