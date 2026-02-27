import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Search, Plus, Loader2, Save, Trash2 } from "lucide-react";
import { format } from "date-fns";

const MARKET_KEYS = [
  "player_points", "player_rebounds", "player_assists", "player_steals",
  "player_blocks", "player_threes", "player_turnovers",
  "player_pts_reb_ast", "player_pts_reb", "player_pts_ast", "player_reb_ast",
  "player_double_double", "player_first_basket",
];

interface PropRow {
  id: string;
  game_id: string | null;
  player_name: string;
  market_key: string;
  market_label: string | null;
  bookmaker: string;
  line: number | null;
  over_price: number | null;
  under_price: number | null;
  captured_at: string;
}

export default function AdminManualPropsEntry() {
  const qc = useQueryClient();
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string; team: string } | null>(null);
  const [gameDate, setGameDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  // New prop form
  const [marketKey, setMarketKey] = useState("player_points");
  const [bookmaker, setBookmaker] = useState("consensus");
  const [line, setLine] = useState("");
  const [overPrice, setOverPrice] = useState("-110");
  const [underPrice, setUnderPrice] = useState("-110");

  // Search players
  const { data: searchResults } = useQuery({
    queryKey: ["admin-prop-player-search", playerSearch],
    queryFn: async () => {
      if (playerSearch.length < 2) return [];
      const { data } = await supabase.from("players").select("id, name, team").ilike("name", `%${playerSearch}%`).limit(10);
      return data || [];
    },
    enabled: playerSearch.length >= 2,
  });

  // Games for player's team on selected date
  const { data: availableGames = [] } = useQuery({
    queryKey: ["admin-prop-games", selectedPlayer?.team, gameDate],
    queryFn: async () => {
      if (!selectedPlayer?.team) return [];
      const dateStart = `${gameDate}T00:00:00Z`;
      const dateEnd = `${gameDate}T23:59:59Z`;
      const { data } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time, status")
        .or(`home_abbr.eq.${selectedPlayer.team},away_abbr.eq.${selectedPlayer.team}`)
        .gte("start_time", dateStart)
        .lte("start_time", dateEnd)
        .limit(5);
      return data || [];
    },
    enabled: !!selectedPlayer?.team && gameDate.length === 10,
  });

  // Existing props for selected game + player
  const { data: existingProps = [], refetch: refetchProps } = useQuery({
    queryKey: ["admin-existing-props", selectedGameId, selectedPlayer?.name],
    queryFn: async () => {
      if (!selectedGameId || !selectedPlayer) return [];
      const { data } = await supabase
        .from("player_props")
        .select("*")
        .eq("game_id", selectedGameId)
        .eq("player_name", selectedPlayer.name)
        .order("market_key");
      return (data || []) as PropRow[];
    },
    enabled: !!selectedGameId && !!selectedPlayer,
  });

  const addPropMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlayer || !selectedGameId || !line) throw new Error("Fill all fields");
      const { error } = await supabase.from("player_props").insert({
        game_id: selectedGameId,
        player_name: selectedPlayer.name,
        market_key: marketKey,
        market_label: marketKey.replace("player_", "").replace(/_/g, " "),
        bookmaker,
        line: Number(line),
        over_price: overPrice ? Number(overPrice) : null,
        under_price: underPrice ? Number(underPrice) : null,
        captured_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Prop added" });
      setLine("");
      refetchProps();
      qc.invalidateQueries({ queryKey: ["player-props"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePropMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("player_props").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Prop deleted" });
      refetchProps();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-foreground">Manual Player Props</h3>

      {/* Player search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search player..."
          value={playerSearch}
          onChange={e => { setPlayerSearch(e.target.value); setSelectedPlayer(null); setSelectedGameId(null); }}
          className="pl-8 h-8 text-xs"
        />
        {searchResults && searchResults.length > 0 && !selectedPlayer && (
          <div className="absolute z-50 top-full left-0 right-0 bg-popover border border-border rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto">
            {searchResults.map(p => (
              <button
                key={p.id}
                onClick={() => { setSelectedPlayer({ id: p.id, name: p.name, team: p.team || "" }); setPlayerSearch(""); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex justify-between"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">{p.team}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedPlayer && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{selectedPlayer.name}</Badge>
            <Badge variant="secondary" className="text-[10px]">{selectedPlayer.team}</Badge>
          </div>

          {/* Date & game selector */}
          <div className="flex items-center gap-2">
            <Input type="date" value={gameDate} onChange={e => { setGameDate(e.target.value); setSelectedGameId(null); }} className="h-8 text-xs w-40" />
            {availableGames.length > 0 && (
              <Select value={selectedGameId || ""} onValueChange={setSelectedGameId}>
                <SelectTrigger className="h-8 text-xs w-48">
                  <SelectValue placeholder="Select game..." />
                </SelectTrigger>
                <SelectContent>
                  {availableGames.map(g => (
                    <SelectItem key={g.id} value={g.id} className="text-xs">
                      {g.away_abbr} @ {g.home_abbr} · {g.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {availableGames.length === 0 && gameDate.length === 10 && (
              <span className="text-[10px] text-muted-foreground">No games found</span>
            )}
          </div>

          {/* Add prop form */}
          {selectedGameId && (
            <div className="border border-border rounded-md p-3 bg-secondary/20 space-y-2">
              <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Add Prop</p>
              <div className="grid grid-cols-2 gap-2">
                <Select value={marketKey} onValueChange={setMarketKey}>
                  <SelectTrigger className="h-7 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKET_KEYS.map(k => (
                      <SelectItem key={k} value={k} className="text-xs">{k.replace("player_", "").replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={bookmaker} onChange={e => setBookmaker(e.target.value)} placeholder="Book" className="h-7 text-[10px]" />
                <Input type="number" value={line} onChange={e => setLine(e.target.value)} placeholder="Line (e.g. 24.5)" className="h-7 text-[10px]" step="0.5" />
                <div className="flex gap-1">
                  <Input type="number" value={overPrice} onChange={e => setOverPrice(e.target.value)} placeholder="Over" className="h-7 text-[10px]" />
                  <Input type="number" value={underPrice} onChange={e => setUnderPrice(e.target.value)} placeholder="Under" className="h-7 text-[10px]" />
                </div>
              </div>
              <Button size="sm" className="h-7 text-[10px] w-full gap-1" onClick={() => addPropMutation.mutate()} disabled={addPropMutation.isPending || !line}>
                {addPropMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Add Prop
              </Button>
            </div>
          )}

          {/* Existing props */}
          {existingProps.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">Existing Props ({existingProps.length})</p>
              {existingProps.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-card border border-border rounded px-2 py-1.5 text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.market_key.replace("player_", "")}</span>
                    <span className="tabular-nums">{p.line}</span>
                    <span className="text-muted-foreground">O {p.over_price} / U {p.under_price}</span>
                    <Badge variant="outline" className="text-[8px]">{p.bookmaker}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0"
                    onClick={() => deletePropMutation.mutate(p.id)}
                    disabled={deletePropMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
