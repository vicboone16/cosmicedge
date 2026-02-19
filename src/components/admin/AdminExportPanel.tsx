import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { arrayToCsv, downloadCsv } from "@/lib/csv-utils";
import { format } from "date-fns";

const GAME_COLUMNS = [
  "id", "league", "home_team", "away_team", "home_abbr", "away_abbr",
  "start_time", "status", "home_score", "away_score", "venue", "source",
] as const;

const PLAYER_COLUMNS = [
  "id", "name", "team", "position", "league",
  "birth_date", "birth_time", "birth_place", "natal_data_quality",
] as const;

async function fetchAllPages<T>(
  buildQuery: (offset: number) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const PAGE = 1000;
  const results: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery(offset);
    if (error) throw error;
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return results;
}

export default function AdminExportPanel() {
  const today = format(new Date(), "yyyy-MM-dd");

  // Games export state
  const [gamesLeague, setGamesLeague] = useState("ALL");
  const [gamesStatus, setGamesStatus] = useState("ALL");
  const [gamesLoading, setGamesLoading] = useState(false);

  // Players export state
  const [playersLeague, setPlayersLeague] = useState("ALL");
  const [playersLoading, setPlayersLoading] = useState(false);

  const exportGames = async () => {
    setGamesLoading(true);
    try {
      const rows = await fetchAllPages(async (offset) => {
        let q = supabase
          .from("games")
          .select(GAME_COLUMNS.join(", "))
          .order("start_time", { ascending: false })
          .range(offset, offset + 999);
        if (gamesLeague !== "ALL") q = q.eq("league", gamesLeague);
        if (gamesStatus !== "ALL") q = q.eq("status", gamesStatus);
        return q as any;
      });

      if (rows.length === 0) {
        toast({ title: "No games found", description: "Try adjusting the filters.", variant: "destructive" });
        return;
      }

      const suffix = gamesLeague === "ALL" ? "ALL" : gamesLeague;
      const filename = `games_${suffix}_${today}.csv`;
      downloadCsv(arrayToCsv(rows as any, [...GAME_COLUMNS]), filename);
      toast({ title: `Exported ${rows.length} games`, description: filename });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setGamesLoading(false);
    }
  };

  const exportPlayers = async () => {
    setPlayersLoading(true);
    try {
      const rows = await fetchAllPages(async (offset) => {
        let q = (supabase as any)
          .from("players")
          .select(PLAYER_COLUMNS.join(", "))
          .order("name", { ascending: true })
          .range(offset, offset + 999);
        if (playersLeague !== "ALL") q = q.eq("league", playersLeague);
        return q;
      });

      if (rows.length === 0) {
        toast({ title: "No players found", description: "Try adjusting the league filter.", variant: "destructive" });
        return;
      }

      const suffix = playersLeague === "ALL" ? "ALL" : playersLeague;
      const filename = `players_${suffix}_${today}.csv`;
      downloadCsv(arrayToCsv(rows as any, [...PLAYER_COLUMNS]), filename);
      toast({ title: `Exported ${rows.length} players`, description: filename });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setPlayersLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">Export</Badge>
        <h3 className="text-sm font-semibold text-foreground">Export to CSV</h3>
      </div>

      {/* Games export */}
      <Card className="p-4 space-y-3">
        <h4 className="text-xs font-semibold text-foreground">Games Table</h4>
        <p className="text-[11px] text-muted-foreground">
          Download the games database as CSV (all leagues, bypasses 1,000-row limit via pagination).
          Columns match the schedule CSV import format for easy re-upload.
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={gamesLeague} onValueChange={setGamesLeague}>
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="NBA">NBA</SelectItem>
              <SelectItem value="NFL">NFL</SelectItem>
              <SelectItem value="NHL">NHL</SelectItem>
              <SelectItem value="MLB">MLB</SelectItem>
            </SelectContent>
          </Select>
          <Select value={gamesStatus} onValueChange={setGamesStatus}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="final">Final</SelectItem>
              <SelectItem value="postponed">Postponed</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={exportGames} disabled={gamesLoading} size="sm" variant="outline" className="gap-1.5 text-xs">
            {gamesLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {gamesLoading ? "Exporting..." : "Download Games CSV"}
          </Button>
        </div>
      </Card>

      {/* Players export */}
      <Card className="p-4 space-y-3">
        <h4 className="text-xs font-semibold text-foreground">Players Table</h4>
        <p className="text-[11px] text-muted-foreground">
          Download the players database as CSV. Includes birth data fields for editing and re-uploading via the Birth Time importer.
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={playersLeague} onValueChange={setPlayersLeague}>
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="NBA">NBA</SelectItem>
              <SelectItem value="NFL">NFL</SelectItem>
              <SelectItem value="NHL">NHL</SelectItem>
              <SelectItem value="MLB">MLB</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={exportPlayers} disabled={playersLoading} size="sm" variant="outline" className="gap-1.5 text-xs">
            {playersLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {playersLoading ? "Exporting..." : "Download Players CSV"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
