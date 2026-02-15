import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Server, HardDrive } from "lucide-react";

export default function AdminBackend() {
  const { data: tableStats } = useQuery({
    queryKey: ["admin-table-stats"],
    queryFn: async () => {
      const tables = ["games", "players", "odds_snapshots", "bets", "player_game_stats", "player_props", "historical_odds", "injuries", "alerts", "player_news"];
      const results: { table: string; count: number }[] = [];
      for (const t of tables) {
        const { count } = await supabase.from(t as any).select("*", { count: "exact", head: true });
        results.push({ table: t, count: count || 0 });
      }
      return results;
    },
    staleTime: 60000,
  });

  const { data: edgeFns } = useQuery({
    queryKey: ["admin-edge-functions"],
    queryFn: async () => {
      // List known edge functions
      return [
        "fetch-odds", "fetch-live-scores", "fetch-player-props", "fetch-injuries-lineups",
        "fetch-news", "fetch-stats", "fetch-historical-odds", "fetch-projections",
        "quant-engine", "astro-batch", "astro-interpret", "check-alerts",
        "import-historical-csv", "import-sdio-bulk", "import-schedule-xlsx",
        "backfill-scores", "aggregate-period-stats",
      ];
    },
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-primary" />
          Database Tables
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {tableStats?.map(t => (
            <div key={t.table} className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2">
              <span className="text-xs text-foreground">{t.table}</span>
              <Badge variant="outline" className="text-[10px]">{t.count.toLocaleString()}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Server className="h-4 w-4 text-primary" />
          Backend Functions
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {edgeFns?.map(fn => (
            <Badge key={fn} variant="secondary" className="text-[10px]">{fn}</Badge>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <HardDrive className="h-4 w-4 text-primary" />
          Storage Buckets
        </h2>
        <div className="space-y-1">
          <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2">
            <span className="text-xs text-foreground">csv-imports</span>
            <Badge variant="outline" className="text-[10px]">Private</Badge>
          </div>
          <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2">
            <span className="text-xs text-foreground">avatars</span>
            <Badge variant="outline" className="text-[10px]">Public</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
