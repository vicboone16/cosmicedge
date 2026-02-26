import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Search, Save, Shield, Trash2 } from "lucide-react";
import PeriodScoresEditor from "@/components/admin/PeriodScoresEditor";
import { format, addDays, subDays } from "date-fns";
import { useTimezone } from "@/hooks/use-timezone";

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

export default function AdminGamesPage() {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { userTimezone, formatInUserTZ, getTZAbbrev } = useTimezone();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(new Date());
  const [league, setLeague] = useState("ALL");
  const [search, setSearch] = useState("");
  const [editGame, setEditGame] = useState<GameRow | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editHomeScore, setEditHomeScore] = useState("");
  const [editAwayScore, setEditAwayScore] = useState("");

  const dateStr = format(date, "yyyy-MM-dd");

  const { data: games = [], isLoading } = useQuery({
    queryKey: ["admin-games", dateStr, league, userTimezone],
    queryFn: async () => {
      // Use timezone-aware day boundaries (same logic as use-games.ts)
      const y = date.getFullYear();
      const m = date.getMonth();
      const d = date.getDate();

      let offsetHours = 0;
      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: userTimezone,
          timeZoneName: "shortOffset",
        });
        const parts = formatter.formatToParts(date);
        const tzPart = parts.find((p) => p.type === "timeZoneName")?.value || "";
        const match = tzPart.match(/GMT([+-]?)(\d+)?(?::(\d+))?/);
        if (match) {
          const sign = match[1] === "-" ? -1 : 1;
          const hrs = parseInt(match[2] || "0", 10);
          const mins = parseInt(match[3] || "0", 10);
          offsetHours = sign * (hrs + mins / 60);
        }
      } catch {}

      const startOfDay = new Date(Date.UTC(y, m, d, -offsetHours, 0, 0, 0));
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

      let q = supabase
        .from("games")
        .select("id, league, home_team, away_team, home_abbr, away_abbr, home_score, away_score, status, start_time")
        .gte("start_time", startOfDay.toISOString())
        .lt("start_time", endOfDay.toISOString())
        .order("start_time", { ascending: true });
      if (league !== "ALL") q = q.eq("league", league);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as GameRow[];
    },
    enabled: isAdmin,
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

  const deleteMutation = useMutation({
    mutationFn: async (gameId: string) => {
      // Delete related records first
      await supabase.from("odds_snapshots").delete().eq("game_id", gameId);
      await supabase.from("game_quarters").delete().eq("game_id", gameId);
      await supabase.from("play_by_play").delete().eq("game_id", gameId);
      await supabase.from("game_state_snapshots").delete().eq("game_id", gameId);
      await supabase.from("game_referees").delete().eq("game_id", gameId);
      await supabase.from("player_game_stats").delete().eq("game_id", gameId);
      await supabase.from("player_props").delete().eq("game_id", gameId);
      await supabase.from("historical_odds").delete().eq("game_id", gameId);
      await supabase.from("player_projections").delete().eq("game_id", gameId);
      await supabase.from("alerts").delete().eq("game_id", gameId);
      await supabase.from("intel_notes").delete().eq("game_id", gameId);
      await supabase.from("bets").delete().eq("game_id", gameId);
      const { error } = await supabase.from("games").delete().eq("id", gameId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-games"] });
      toast({ title: "Game deleted" });
      setEditGame(null);
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
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

  if (adminLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!isAdmin) return <div className="p-6 text-destructive font-bold">Admin access required</div>;

  const filtered = search
    ? games.filter(g =>
        g.home_abbr.toLowerCase().includes(search.toLowerCase()) ||
        g.away_abbr.toLowerCase().includes(search.toLowerCase()) ||
        g.home_team.toLowerCase().includes(search.toLowerCase()) ||
        g.away_team.toLowerCase().includes(search.toLowerCase())
      )
    : games;

  const scheduledWithScores = games.filter(g => g.status === "scheduled" && g.home_score != null && g.away_score != null && new Date(g.start_time) < new Date());

  return (
    <div className="min-h-screen bg-background p-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Game Manager</h1>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setDate(d => subDays(d, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-foreground min-w-[100px] text-center">{format(date, "MMM d, yyyy")}</span>
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
            <SelectItem value="NCAAB">NCAAB</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[150px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams..." className="pl-8 h-9 text-xs" />
        </div>
      </div>

      {/* Bulk fix */}
      {scheduledWithScores.length > 0 && (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => bulkFinalize.mutate()}
          disabled={bulkFinalize.isPending}
          className="text-xs"
        >
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
            <Card
              key={g.id}
              className="p-3 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => openEdit(g)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{g.league}</Badge>
                  <span className="text-sm font-medium text-foreground">
                    {g.away_abbr} @ {g.home_abbr}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {(g.away_score != null && g.home_score != null) ? (
                    <span className="text-xs text-muted-foreground">{g.away_score} - {g.home_score}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No score</span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {formatInUserTZ(g.start_time)} {getTZAbbrev()}
                  </span>
                </div>
              </div>
              <Badge
                variant={g.status === "final" ? "default" : g.status === "scheduled" ? "secondary" : "outline"}
                className="text-[10px] uppercase"
              >
                {g.status}
              </Badge>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editGame} onOpenChange={(open) => !open && setEditGame(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Edit: {editGame?.away_abbr} @ {editGame?.home_abbr}
            </DialogTitle>
            {editGame && (
              <p className="text-[11px] text-muted-foreground">
                {new Date(editGame.start_time).toLocaleDateString("en-US", { timeZone: userTimezone, month: "short", day: "numeric", year: "numeric" })}
                {" · "}
                {formatInUserTZ(editGame.start_time)} {getTZAbbrev()}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-3">
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
            {editGame && (
              <PeriodScoresEditor
                gameId={editGame.id}
                league={editGame.league}
                homeAbbr={editGame.home_abbr}
                awayAbbr={editGame.away_abbr}
              />
            )}
          </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="destructive"
              size="sm"
              className="gap-1"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (editGame && confirm(`Delete ${editGame.away_abbr} @ ${editGame.home_abbr}? This cannot be undone.`)) {
                  deleteMutation.mutate(editGame.id);
                }
              }}
            >
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending} size="sm" className="gap-1">
              <Save className="h-3 w-3" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
