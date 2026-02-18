import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Search, Pencil, Trash2, Merge, Save, X, CheckSquare, Square } from "lucide-react";

interface Player {
  id: string;
  name: string;
  team: string | null;
  league: string | null;
  position: string | null;
  birth_date: string | null;
  birth_place: string | null;
  birth_time: string | null;
  external_id: string | null;
  headshot_url: string | null;
  natal_data_quality: string | null;
}

export default function AdminPlayerManager() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("ALL");
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [mergeSource, setMergeSource] = useState<Player | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Player | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Player | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [massDeleteOpen, setMassDeleteOpen] = useState(false);

  const canSearch = search.length >= 2 || teamSearch.length >= 2 || leagueFilter !== "ALL";

  const { data: players = [], isLoading } = useQuery({
    queryKey: ["admin-players", search, teamSearch, leagueFilter],
    queryFn: async () => {
      let q = supabase.from("players").select("*").order("name").limit(100);
      if (search.length >= 2) q = q.ilike("name", `%${search}%`);
      if (teamSearch.length >= 2) q = q.ilike("team", `%${teamSearch}%`);
      if (leagueFilter !== "ALL") q = q.eq("league", leagueFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Player[];
    },
    enabled: canSearch,
  });

  // Keep selection in sync when results change
  const allIds = players.map(p => p.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  };

  const clearSelection = () => setSelected(new Set());

  const updateMutation = useMutation({
    mutationFn: async (p: Player) => {
      const { error } = await supabase.from("players").update({
        name: p.name,
        team: p.team,
        league: p.league,
        position: p.position,
        birth_date: p.birth_date,
        birth_place: p.birth_place,
        birth_time: p.birth_time,
        headshot_url: p.headshot_url,
        natal_data_quality: p.natal_data_quality,
      }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Player updated");
      setEditPlayer(null);
      qc.invalidateQueries({ queryKey: ["admin-players"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // safe_delete_player RPC fires cascade trigger atomically in DB
      const { error } = await supabase.rpc("safe_delete_player", { p_player_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Player deleted");
      setDeleteConfirm(null);
      qc.invalidateQueries({ queryKey: ["admin-players"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const massDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Delete in parallel; each triggers the DB cascade individually
      const results = await Promise.all(
        ids.map(id => supabase.rpc("safe_delete_player", { p_player_id: id }))
      );
      const failed = results.filter(r => !!r.error);
      if (failed.length > 0) throw new Error(`${failed.length} deletion(s) failed`);
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} player${ids.length !== 1 ? "s" : ""} deleted`);
      setMassDeleteOpen(false);
      clearSelection();
      qc.invalidateQueries({ queryKey: ["admin-players"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      const { error } = await supabase.rpc("merge_players", { source_id: sourceId, target_id: targetId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Players merged successfully");
      setMergeOpen(false);
      setMergeSource(null);
      setMergeTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-players"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startMerge = (player: Player) => {
    if (!mergeSource) {
      setMergeSource(player);
      toast.info(`Selected "${player.name}" as merge source. Now select the target to keep.`);
    } else if (mergeSource.id === player.id) {
      setMergeSource(null);
      toast.info("Merge cancelled");
    } else {
      setMergeTarget(player);
      setMergeOpen(true);
    }
  };

  const selectedPlayers = players.filter(p => selected.has(p.id));

  return (
    <div className="space-y-3">
      {/* Search bar row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name..."
            value={search}
            onChange={e => { setSearch(e.target.value); clearSelection(); }}
            className="pl-9 h-8 text-xs"
          />
        </div>
        <div className="relative w-28">
          <Input
            placeholder="Team abbr..."
            value={teamSearch}
            onChange={e => { setTeamSearch(e.target.value.toUpperCase()); clearSelection(); }}
            className="h-8 text-xs uppercase"
          />
        </div>
        <Select value={leagueFilter} onValueChange={v => { setLeagueFilter(v); clearSelection(); }}>
          <SelectTrigger className="w-20 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="NBA">NBA</SelectItem>
            <SelectItem value="NFL">NFL</SelectItem>
            <SelectItem value="NHL">NHL</SelectItem>
            <SelectItem value="MLB">MLB</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Merge mode banner */}
      {mergeSource && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-2 text-xs flex items-center justify-between">
          <span>Merge source: <strong>{mergeSource.name}</strong> ({mergeSource.league}/{mergeSource.team}) — click another player to merge into</span>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setMergeSource(null)}>
            <X className="h-3 w-3 mr-1" /> Cancel
          </Button>
        </div>
      )}

      {/* Multi-select toolbar */}
      {players.length > 0 && !mergeSource && (
        <div className="flex items-center gap-2 py-1 border-b border-border/40">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {allSelected
              ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
              : <Square className="h-3.5 w-3.5" />
            }
            {allSelected ? "Deselect all" : `Select all (${players.length})`}
          </button>
          {someSelected && (
            <>
              <span className="text-[10px] text-muted-foreground">{selected.size} selected</span>
              <Button
                size="sm"
                variant="destructive"
                className="h-6 text-[10px] ml-auto"
                onClick={() => setMassDeleteOpen(true)}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete {selected.size}
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={clearSelection}>
                <X className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      )}

      {isLoading && <p className="text-xs text-muted-foreground">Searching...</p>}
      {!canSearch && <p className="text-xs text-muted-foreground italic">Enter a name, team abbreviation, or select a league to search.</p>}

      {/* Player list */}
      <div className="space-y-1 max-h-[58vh] overflow-y-auto">
        {players.map(p => (
          <div
            key={p.id}
            className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
              selected.has(p.id) ? "bg-primary/10 border border-primary/20" : "bg-secondary/40 hover:bg-secondary/70"
            }`}
          >
            {!mergeSource && (
              <Checkbox
                checked={selected.has(p.id)}
                onCheckedChange={() => toggleSelect(p.id)}
                className="h-3.5 w-3.5 shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{p.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {p.league} · {p.team || "—"} · {p.position || "—"} · {p.birth_date || "No DOB"}
                {p.external_id && ` · ext:${p.external_id}`}
              </p>
            </div>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditPlayer({ ...p })}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startMerge(p)}>
              <Merge className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteConfirm(p)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {canSearch && players.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground italic">No players found.</p>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editPlayer} onOpenChange={open => !open && setEditPlayer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit Player</DialogTitle>
          </DialogHeader>
          {editPlayer && (
            <div className="space-y-3">
              {([
                { key: "name", label: "Name" },
                { key: "team", label: "Team" },
                { key: "league", label: "League" },
                { key: "position", label: "Position" },
                { key: "birth_date", label: "Birth Date" },
                { key: "birth_time", label: "Birth Time" },
                { key: "birth_place", label: "Birth Place" },
                { key: "headshot_url", label: "Headshot URL" },
                { key: "natal_data_quality", label: "Natal Quality" },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="text-[10px] text-muted-foreground uppercase">{f.label}</label>
                  <Input
                    className="h-8 text-xs"
                    value={(editPlayer as any)[f.key] || ""}
                    onChange={e => setEditPlayer({ ...editPlayer, [f.key]: e.target.value || null })}
                  />
                </div>
              ))}
              <DialogFooter>
                <Button size="sm" className="text-xs" onClick={() => updateMutation.mutate(editPlayer)} disabled={updateMutation.isPending}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={open => !open && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Delete Player?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            This will permanently delete <strong>{deleteConfirm?.name}</strong> ({deleteConfirm?.league}/{deleteConfirm?.team}).
            All associated stats, projections, and references will be orphaned. Consider merging instead.
          </p>
          <DialogFooter>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button size="sm" variant="destructive" className="text-xs" onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mass Delete Confirmation */}
      <Dialog open={massDeleteOpen} onOpenChange={open => !open && setMassDeleteOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Delete {selected.size} Players?</DialogTitle>
          </DialogHeader>
          <div className="text-xs space-y-2">
            <p className="text-muted-foreground">The following players will be permanently deleted:</p>
            <div className="max-h-40 overflow-y-auto space-y-1 bg-secondary/30 rounded-md p-2">
              {selectedPlayers.map(p => (
                <p key={p.id} className="truncate">
                  <strong>{p.name}</strong> <span className="text-muted-foreground">({p.league}/{p.team})</span>
                </p>
              ))}
            </div>
            <p className="text-destructive font-medium">All associated stats and references will be orphaned. This cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setMassDeleteOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              variant="destructive"
              className="text-xs"
              onClick={() => massDeleteMutation.mutate(Array.from(selected))}
              disabled={massDeleteMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete {selected.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Confirmation */}
      <Dialog open={mergeOpen} onOpenChange={open => { if (!open) { setMergeOpen(false); setMergeTarget(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Merge Players</DialogTitle>
          </DialogHeader>
          <div className="text-xs space-y-2">
            <p>All stats and references from:</p>
            <p className="font-semibold text-destructive">{mergeSource?.name} ({mergeSource?.league}/{mergeSource?.team})</p>
            <p>will be moved to:</p>
            <p className="font-semibold text-primary">{mergeTarget?.name} ({mergeTarget?.league}/{mergeTarget?.team})</p>
            <p className="text-muted-foreground">The source player will be deleted. This cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => { setMergeOpen(false); setMergeTarget(null); }}>Cancel</Button>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => mergeSource && mergeTarget && mergeMutation.mutate({ sourceId: mergeSource.id, targetId: mergeTarget.id })}
              disabled={mergeMutation.isPending}
            >
              <Merge className="h-3.5 w-3.5 mr-1" /> Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
