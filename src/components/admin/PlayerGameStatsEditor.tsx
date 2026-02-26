import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Save, Loader2, Trash2, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface GameStat {
  id: string;
  game_id: string;
  player_id: string;
  team_abbr: string;
  period: string;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fg_made: number | null;
  fg_attempted: number | null;
  three_made: number | null;
  three_attempted: number | null;
  ft_made: number | null;
  ft_attempted: number | null;
  plus_minus: number | null;
  fouls: number | null;
  games: { start_time: string; home_abbr: string; away_abbr: string } | null;
}

const STAT_COLS = [
  { key: "minutes", label: "MIN" },
  { key: "points", label: "PTS" },
  { key: "rebounds", label: "REB" },
  { key: "assists", label: "AST" },
  { key: "steals", label: "STL" },
  { key: "blocks", label: "BLK" },
  { key: "turnovers", label: "TO" },
  { key: "fg_made", label: "FGM" },
  { key: "fg_attempted", label: "FGA" },
  { key: "three_made", label: "3PM" },
  { key: "three_attempted", label: "3PA" },
  { key: "ft_made", label: "FTM" },
  { key: "ft_attempted", label: "FTA" },
  { key: "plus_minus", label: "+/-" },
  { key: "fouls", label: "PF" },
] as const;

export default function PlayerGameStatsEditor() {
  const [search, setSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedPlayerName, setSelectedPlayerName] = useState("");
  const [selectedPlayerTeam, setSelectedPlayerTeam] = useState("");
  const [editedCells, setEditedCells] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAddGame, setShowAddGame] = useState(false);
  const [addGameDate, setAddGameDate] = useState("");
  const [addingGame, setAddingGame] = useState(false);
  const queryClient = useQueryClient();

  const { data: searchResults } = useQuery({
    queryKey: ["admin-player-search", search],
    queryFn: async () => {
      if (search.length < 2) return [];
      const { data } = await supabase
        .from("players")
        .select("id, name, team")
        .ilike("name", `%${search}%`)
        .limit(10);
      return data || [];
    },
    enabled: search.length >= 2,
  });

  const { data: gameLogs, refetch } = useQuery({
    queryKey: ["admin-player-game-logs", selectedPlayerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("player_game_stats")
        .select("*, games!player_game_stats_game_id_fkey(start_time, home_abbr, away_abbr)")
        .eq("player_id", selectedPlayerId!)
        .eq("period", "full")
        .not("points", "is", null)
        .order("created_at", { ascending: false })
        .limit(82);
      const sorted = (data || []).sort((a: any, b: any) => {
        const aT = a.games?.start_time || "";
        const bT = b.games?.start_time || "";
        return bT.localeCompare(aT);
      });
      return sorted as GameStat[];
    },
    enabled: !!selectedPlayerId,
  });

  // Available games for the player's team (for adding stats)
  const { data: availableGames } = useQuery({
    queryKey: ["admin-available-games", selectedPlayerTeam, addGameDate],
    queryFn: async () => {
      if (!selectedPlayerTeam || !addGameDate) return [];
      const dateStart = `${addGameDate}T00:00:00Z`;
      const dateEnd = `${addGameDate}T23:59:59Z`;
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time, status")
        .or(`home_abbr.eq.${selectedPlayerTeam},away_abbr.eq.${selectedPlayerTeam}`)
        .gte("start_time", dateStart)
        .lte("start_time", dateEnd)
        .limit(5);
      return data || [];
    },
    enabled: !!selectedPlayerTeam && addGameDate.length === 10,
  });

  const selectPlayer = useCallback((id: string, name: string, team: string) => {
    setSelectedPlayerId(id);
    setSelectedPlayerName(name);
    setSelectedPlayerTeam(team || "");
    setSearch("");
    setEditedCells({});
    setShowAddGame(false);
  }, []);

  const handleCellChange = (rowId: string, key: string, value: string) => {
    setEditedCells((prev) => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), [key]: value },
    }));
  };

  const getCellValue = (row: GameStat, key: string): string => {
    if (editedCells[row.id]?.[key] !== undefined) return editedCells[row.id][key];
    const val = (row as any)[key];
    return val != null ? String(val) : "";
  };

  const hasEdits = (rowId: string) => Object.keys(editedCells[rowId] || {}).length > 0;

  const saveRow = async (row: GameStat) => {
    const edits = editedCells[row.id];
    if (!edits) return;
    setSaving(row.id);
    const update: Record<string, number | null> = {};
    for (const [key, val] of Object.entries(edits)) {
      update[key] = val === "" ? null : Number(val);
    }
    const { error } = await supabase
      .from("player_game_stats")
      .update(update)
      .eq("id", row.id)
      .select("id");
    if (error) {
      console.error("Save failed:", error.message);
    } else {
      setEditedCells((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["player-game-logs", selectedPlayerId] });
    }
    setSaving(null);
  };

  const deleteRow = async (row: GameStat) => {
    if (!confirm(`Delete stat row for ${row.team_abbr} on this game?`)) return;
    setDeleting(row.id);
    const { error } = await supabase
      .from("player_game_stats")
      .delete()
      .eq("id", row.id);
    if (error) {
      console.error("Delete failed:", error.message);
    } else {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["player-game-logs", selectedPlayerId] });
    }
    setDeleting(null);
  };

  const addGameStat = async (gameId: string, homeAbbr: string, awayAbbr: string) => {
    if (!selectedPlayerId || !selectedPlayerTeam) return;
    setAddingGame(true);
    // Check if stat already exists
    const { data: existing } = await supabase
      .from("player_game_stats")
      .select("id")
      .eq("player_id", selectedPlayerId)
      .eq("game_id", gameId)
      .eq("period", "full")
      .maybeSingle();
    if (existing) {
      alert("Stat row already exists for this game.");
      setAddingGame(false);
      return;
    }
    const { error } = await supabase
      .from("player_game_stats")
      .insert({
        player_id: selectedPlayerId,
        game_id: gameId,
        team_abbr: selectedPlayerTeam,
        period: "full",
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fg_made: 0,
        fg_attempted: 0,
        three_made: 0,
        three_attempted: 0,
        ft_made: 0,
        ft_attempted: 0,
        plus_minus: 0,
        fouls: 0,
        minutes: 0,
      });
    if (error) {
      console.error("Add game stat failed:", error.message);
      alert(`Failed: ${error.message}`);
    } else {
      setShowAddGame(false);
      setAddGameDate("");
      refetch();
    }
    setAddingGame(false);
  };

  // Detect duplicate matchups (same game date + matchup appearing more than once)
  const duplicateGameIds = new Set<string>();
  if (gameLogs) {
    const seen = new Map<string, string>();
    for (const row of gameLogs) {
      const game = row.games as any;
      const key = `${game?.start_time?.slice(0, 10)}_${game?.home_abbr}_${game?.away_abbr}`;
      if (seen.has(key)) {
        duplicateGameIds.add(row.game_id);
        duplicateGameIds.add(seen.get(key)!);
      } else {
        seen.set(key, row.game_id);
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Edit Player Game Stats</h3>
        {selectedPlayerId && (
          <Button size="sm" variant="outline" onClick={() => setShowAddGame(!showAddGame)} className="h-7 text-xs gap-1">
            <Plus className="h-3 w-3" /> Add Game
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedPlayerId(null); }}
          placeholder="Search player by name..."
          className="pl-8 h-9 text-sm"
        />
        {searchResults && searchResults.length > 0 && !selectedPlayerId && (
          <div className="absolute z-50 top-full left-0 right-0 bg-popover border border-border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
            {searchResults.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPlayer(p.id, p.name, p.team || "")}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground text-xs">{p.team}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedPlayerId && (
        <p className="text-xs text-muted-foreground">
          Editing: <span className="font-semibold text-foreground">{selectedPlayerName}</span> · {gameLogs?.length ?? 0} games
        </p>
      )}

      {/* Add Game Panel */}
      {showAddGame && selectedPlayerId && (
        <div className="border border-border rounded-md p-3 bg-secondary/30 space-y-2">
          <p className="text-xs font-semibold text-foreground">Add Game Stat</p>
          <Input
            type="date"
            value={addGameDate}
            onChange={(e) => setAddGameDate(e.target.value)}
            className="h-8 text-xs w-48"
            placeholder="Game date"
          />
          {availableGames && availableGames.length > 0 && (
            <div className="space-y-1">
              {availableGames.map((g) => (
                <div key={g.id} className="flex items-center justify-between bg-background rounded px-2 py-1.5 text-xs">
                  <span>{g.away_abbr} @ {g.home_abbr} · {g.status}</span>
                  <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={addingGame} onClick={() => addGameStat(g.id, g.home_abbr, g.away_abbr)}>
                    {addingGame ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {availableGames && availableGames.length === 0 && addGameDate.length === 10 && (
            <p className="text-[10px] text-muted-foreground">No games found for {selectedPlayerTeam} on {addGameDate}</p>
          )}
        </div>
      )}

      {/* Stats table */}
      {gameLogs && gameLogs.length > 0 && (
        <div className="overflow-x-auto border border-border rounded-md">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-20 sticky left-0 bg-muted/50">Date</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-20">Matchup</th>
                {STAT_COLS.map((c) => (
                  <th key={c.key} className="px-1 py-1.5 text-center font-medium text-muted-foreground w-14">{c.label}</th>
                ))}
                <th className="px-1 py-1.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {gameLogs.map((row) => {
                const game = row.games as any;
                const dateStr = game?.start_time ? format(new Date(game.start_time), "M/d") : "—";
                const matchup = game ? `${game.away_abbr}@${game.home_abbr}` : "";
                const edited = hasEdits(row.id);
                const isDupe = duplicateGameIds.has(row.game_id);

                return (
                  <tr key={row.id} className={cn(
                    "border-b border-border/30",
                    edited && "bg-primary/5",
                    isDupe && "bg-destructive/10"
                  )}>
                    <td className="px-2 py-1 text-[10px] font-medium sticky left-0 bg-background">
                      {dateStr}
                      {isDupe && <span className="ml-1 text-destructive text-[8px]">DUP</span>}
                    </td>
                    <td className="px-2 py-1 text-[10px] text-muted-foreground">{matchup}</td>
                    {STAT_COLS.map((c) => (
                      <td key={c.key} className="px-0.5 py-0.5">
                        <Input
                          value={getCellValue(row, c.key)}
                          onChange={(e) => handleCellChange(row.id, c.key, e.target.value)}
                          className="h-6 text-[11px] text-center px-1 border-0 bg-transparent focus:bg-secondary/50 tabular-nums w-14"
                        />
                      </td>
                    ))}
                    <td className="px-1 py-0.5 flex items-center gap-0.5">
                      {edited && (
                        <Button size="sm" variant="ghost" onClick={() => saveRow(row)} disabled={saving === row.id} className="h-6 w-6 p-0">
                          {saving === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 text-primary" />}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteRow(row)} disabled={deleting === row.id} className="h-6 w-6 p-0">
                        {deleting === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 text-destructive" />}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedPlayerId && gameLogs?.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No game logs found for this player.</p>
      )}
    </div>
  );
}
