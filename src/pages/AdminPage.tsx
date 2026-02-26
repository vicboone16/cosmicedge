import { useIsAdmin } from "@/hooks/use-admin";
import { Shield } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AdminImportContent from "@/components/admin/AdminImportContent";
import AdminGameManager from "@/components/admin/AdminGameManager";
import AdminBacktest from "@/components/admin/AdminBacktest";
import AdminBackend from "@/components/admin/AdminBackend";
import AdminPBPImport from "@/components/admin/AdminPBPImport";
import AdminNbaPbpImport from "@/components/admin/AdminNbaPbpImport";
import AdminPlayerManager from "@/components/admin/AdminPlayerManager";
import AdminExportPanel from "@/components/admin/AdminExportPanel";
import PlayerGameStatsEditor from "@/components/admin/PlayerGameStatsEditor";
import AdminTeamStatsEditor from "@/components/admin/AdminTeamStatsEditor";
export default function AdminPage() {
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!isAdmin) return <div className="p-6 text-destructive font-bold">Admin access required</div>;

  return (
    <div className="min-h-screen pb-24 bg-background">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <h1 className="text-lg font-bold font-display flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Admin
        </h1>
      </header>

      <div className="px-4 py-4">
        <Tabs defaultValue="imports" className="w-full">
          <TabsList className="w-full grid grid-cols-8 h-9">
            <TabsTrigger value="imports" className="text-[10px]">Imports</TabsTrigger>
            <TabsTrigger value="games" className="text-[10px]">Games</TabsTrigger>
            <TabsTrigger value="players" className="text-[10px]">Players</TabsTrigger>
            <TabsTrigger value="teams" className="text-[10px]">Teams</TabsTrigger>
            <TabsTrigger value="pbp" className="text-[10px]">PBP</TabsTrigger>
            <TabsTrigger value="nba-pbp" className="text-[10px]">NBA PBP</TabsTrigger>
            <TabsTrigger value="backtest" className="text-[10px]">Backtest</TabsTrigger>
            <TabsTrigger value="backend" className="text-[10px]">Backend</TabsTrigger>
          </TabsList>

          <TabsContent value="imports" className="mt-4">
            <AdminImportContent />
          </TabsContent>

          <TabsContent value="games" className="mt-4 space-y-6">
            <AdminGameManager />
            <div className="border-t border-border/50 pt-4">
              <AdminExportPanel />
            </div>
          </TabsContent>

          <TabsContent value="players" className="mt-4 space-y-6">
            <AdminPlayerManager />
            <div className="border-t border-border/50 pt-4">
              <PlayerGameStatsEditor />
            </div>
          </TabsContent>

          <TabsContent value="teams" className="mt-4">
            <AdminTeamStatsEditor />
          </TabsContent>

          <TabsContent value="pbp" className="mt-4">
            <AdminPBPImport />
          </TabsContent>

          <TabsContent value="nba-pbp" className="mt-4">
            <AdminNbaPbpImport />
          </TabsContent>

          <TabsContent value="backtest" className="mt-4">
            <AdminBacktest />
          </TabsContent>

          <TabsContent value="backend" className="mt-4">
            <AdminBackend />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
