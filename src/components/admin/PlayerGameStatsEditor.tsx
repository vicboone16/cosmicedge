import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Save, Loader2 } from "lucide-react";
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
  const [editedCells, setEditedCells] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
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

  const selectPlayer = useCallback((id: string, name: string) => {
    setSelectedPlayerId(id);
    setSelectedPlayerName(name);
    setSearch("");
    setEditedCells({});
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

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-foreground">Edit Player Game Stats</h3>

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
                onClick={() => selectPlayer(p.id, p.name)}
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
                <th className="px-1 py-1.5 w-12" />
              </tr>
            </thead>
            <tbody>
              {gameLogs.map((row) => {
                const game = row.games as any;
                const dateStr = game?.start_time ? format(new Date(game.start_time), "M/d") : "—";
                const matchup = game ? `${game.away_abbr}@${game.home_abbr}` : "";
                const edited = hasEdits(row.id);

                return (
                  <tr key={row.id} className={cn("border-b border-border/30", edited && "bg-primary/5")}>
                    <td className="px-2 py-1 text-[10px] font-medium sticky left-0 bg-background">{dateStr}</td>
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
                    <td className="px-1 py-0.5">
                      {edited && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => saveRow(row)}
                          disabled={saving === row.id}
                          className="h-6 w-6 p-0"
                        >
                          {saving === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 text-primary" />}
                        </Button>
                      )}
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
