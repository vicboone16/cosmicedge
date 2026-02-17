import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Save, Search } from "lucide-react";
import { toast } from "sonner";

interface Player {
  id: string;
  name: string;
  team: string | null;
  position: string | null;
  league: string;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
}

type FilterMode = "missing" | "all";

export function PlayerBirthDateEditor() {
  const [expanded, setExpanded] = useState(false);
  const [league, setLeague] = useState("NBA");
  const [filterMode, setFilterMode] = useState<FilterMode>("missing");
  const [search, setSearch] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState<Record<string, Partial<Player>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("players")
      .select("id, name, team, position, league, birth_date, birth_time, birth_place")
      .eq("league", league)
      .order("name")
      .limit(200);

    if (filterMode === "missing") {
      q = q.is("birth_date", null);
    }

    if (search.trim()) {
      q = q.ilike("name", `%${search.trim()}%`);
    }

    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
    } else {
      // Normalize: strip accents + convert "Last, First" → "first last"
      const normName = (n: string) => {
        let s = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        // Handle "Last, First" format
        if (s.includes(",")) {
          const parts = s.split(",").map((p) => p.trim());
          s = parts.reverse().join(" ");
        }
        // Collapse multiple spaces
        return s.replace(/\s+/g, " ");
      };

      // Deduplicate by normalized name
      const seen = new Map<string, Player>();
      for (const p of (data || []) as Player[]) {
        const norm = normName(p.name);
        // Keep the one with more data (birth_date filled > position filled > first seen)
        const existing = seen.get(norm);
        if (!existing || (!existing.birth_date && p.birth_date) || (!existing.position && p.position)) {
          seen.set(norm, p);
        }
      }
      // Sort by normalized name (always first-name order)
      const deduped = Array.from(seen.values()).sort((a, b) =>
        normName(a.name).localeCompare(normName(b.name))
      );
      setPlayers(deduped);
    }
    setLoading(false);
  }, [league, filterMode, search]);

  const handleEdit = (id: string, field: string, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const handleSave = async (player: Player) => {
    const changes = edits[player.id];
    if (!changes) return;

    // Convert empty strings to null for the DB
    const dbChanges: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(changes)) {
      dbChanges[k] = (v as string) || null;
    }

    setSaving(player.id);
    const { error } = await supabase
      .from("players")
      .update(dbChanges)
      .eq("id", player.id);

    if (error) {
      toast.error(`Failed to save ${player.name}: ${error.message}`);
    } else {
      toast.success(`${player.name} updated`);
      // Convert empty strings to null for DB but keep display values
      const displayChanges: Partial<Player> = {};
      for (const [k, v] of Object.entries(changes)) {
        (displayChanges as any)[k] = v || null;
      }
      // Update local state — remove from list if in "missing" mode and DOB was filled
      setPlayers((prev) => {
        const updated = prev.map((p) =>
          p.id === player.id ? { ...p, ...displayChanges } : p
        );
        if (filterMode === "missing" && displayChanges.birth_date) {
          return updated.filter((p) => p.id !== player.id);
        }
        return updated;
      });
      // Clear edits for this player
      setEdits((prev) => {
        const copy = { ...prev };
        delete copy[player.id];
        return copy;
      });
    }
    setSaving(null);
  };

  return (
    <Card className="p-4 space-y-3">
      <button
        onClick={() => {
          setExpanded((v) => !v);
          if (!expanded && players.length === 0) fetchPlayers();
        }}
        className="flex items-center justify-between w-full"
      >
        <h2 className="text-sm font-semibold text-foreground">🎂 Player Birth Date Editor</h2>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={league} onValueChange={(v) => { setLeague(v); setPlayers([]); }}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NBA">NBA</SelectItem>
                <SelectItem value="NFL">NFL</SelectItem>
                <SelectItem value="NHL">NHL</SelectItem>
                <SelectItem value="MLB">MLB</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterMode} onValueChange={(v) => { setFilterMode(v as FilterMode); setPlayers([]); }}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="missing">Missing DOB</SelectItem>
                <SelectItem value="all">All Players</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-[120px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                className="h-8 text-xs pl-7"
                placeholder="Search name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchPlayers()}
              />
            </div>

            <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={fetchPlayers} disabled={loading}>
              {loading ? "Loading..." : "Search"}
            </Button>
          </div>

          {/* Results */}
          {players.length === 0 && !loading ? (
            <p className="text-xs text-muted-foreground italic">
              {filterMode === "missing" ? "No players missing birth dates (or search to filter)." : "Click Search to load players."}
            </p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {players.map((p) => {
                const edit = edits[p.id] || {};
                const birthDate = edit.birth_date !== undefined ? edit.birth_date : p.birth_date;
                const birthTime = edit.birth_time !== undefined ? edit.birth_time : p.birth_time;
                const birthPlace = edit.birth_place !== undefined ? edit.birth_place : p.birth_place;
                const hasChanges = !!edits[p.id];

                return (
                  <div key={p.id} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                    <div className="flex-shrink-0 w-28">
                      <span className="text-xs font-medium text-foreground truncate block">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground">{p.team} · {p.position}</span>
                    </div>

                    <Input
                      type="date"
                      className="h-7 text-xs w-32 flex-shrink-0"
                      value={birthDate || ""}
                      onChange={(e) => handleEdit(p.id, "birth_date", e.target.value)}
                      placeholder="YYYY-MM-DD"
                    />

                    <Input
                      type="time"
                      className="h-7 text-xs w-24 flex-shrink-0"
                      value={birthTime || ""}
                      onChange={(e) => handleEdit(p.id, "birth_time", e.target.value)}
                      placeholder="HH:MM"
                    />

                    <Input
                      className="h-7 text-xs flex-1 min-w-[80px]"
                      value={birthPlace || ""}
                      onChange={(e) => handleEdit(p.id, "birth_place", e.target.value)}
                      placeholder="City, State"
                    />

                    <Button
                      size="sm"
                      variant={hasChanges ? "default" : "ghost"}
                      className="h-7 w-7 p-0 flex-shrink-0"
                      disabled={!hasChanges || saving === p.id}
                      onClick={() => handleSave(p)}
                    >
                      <Save className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {players.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Showing {players.length} players · {Object.keys(edits).length} unsaved changes
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
