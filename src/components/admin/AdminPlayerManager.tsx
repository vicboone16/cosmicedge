import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Pencil, Trash2, Merge, Save, X } from "lucide-react";

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
  const [leagueFilter, setLeagueFilter] = useState("ALL");
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [mergeSource, setMergeSource] = useState<Player | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Player | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Player | null>(null);

  const { data: players = [], isLoading } = useQuery({
    queryKey: ["admin-players", search, leagueFilter],
    queryFn: async () => {
      if (search.length < 2) return [];
      let q = supabase.from("players").select("*").ilike("name", `%${search}%`).order("name").limit(50);
      if (leagueFilter !== "ALL") q = q.eq("league", leagueFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Player[];
    },
    enabled: search.length >= 2,
  });

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
      const { error } = await supabase.from("players").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Player deleted");
      setDeleteConfirm(null);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search players (min 2 chars)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs"
          />
        </div>
        <Select value={leagueFilter} onValueChange={setLeagueFilter}>
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

      {mergeSource && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-2 text-xs flex items-center justify-between">
          <span>Merge source: <strong>{mergeSource.name}</strong> ({mergeSource.league}/{mergeSource.team}) — click another player to merge into</span>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setMergeSource(null)}>
            <X className="h-3 w-3 mr-1" /> Cancel
          </Button>
        </div>
      )}

      {isLoading && <p className="text-xs text-muted-foreground">Searching...</p>}

      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-colors">
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
        {search.length >= 2 && players.length === 0 && !isLoading && (
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

      {/* Delete Confirmation */}
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
