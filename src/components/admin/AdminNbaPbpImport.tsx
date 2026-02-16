import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, CheckCircle2, Loader2 } from "lucide-react";

interface ImportResult {
  status: string;
  game_id?: string;
  away_team?: string;
  home_team?: string;
  date?: string;
  plays_imported?: number;
  periods?: number;
  final_score?: string;
  error?: string;
}

export default function AdminNbaPbpImport() {
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<{ away: string; home: string; date: string; rows: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setFileContent(text);

      // Quick preview parse
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length > 1) {
        const headers = lines[0].split(",");
        const awayIdx = headers.indexOf("away_team");
        const homeIdx = headers.indexOf("home_team");
        const dateIdx = headers.indexOf("date");
        const firstData = lines[1].split(",");
        setPreview({
          away: awayIdx >= 0 ? firstData[awayIdx] : "?",
          home: homeIdx >= 0 ? firstData[homeIdx] : "?",
          date: dateIdx >= 0 ? firstData[dateIdx] : "?",
          rows: lines.length - 1,
        });
      }
    };
    reader.readAsText(file);
  }, []);

  const importMutation = useMutation({
    mutationFn: async () => {
      const resp = await supabase.functions.invoke("import-nba-pbp-csv", {
        body: { csv: fileContent },
      });
      if (resp.error) throw new Error(resp.error.message || JSON.stringify(resp.error));
      const data = resp.data as ImportResult;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: "NBA PBP imported!",
        description: `${data.plays_imported} events for ${data.final_score}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">NBA PBP CSV Import</h2>
        <Badge variant="outline" className="text-[9px]">Lineup + Events</Badge>
      </div>

      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase">Upload CSV</label>
        <div className="mt-1">
          <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded-lg p-4 hover:bg-accent/30 transition-colors">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {fileName || "Click to select NBA PBP CSV file"}
            </span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </label>
        </div>
      </div>

      {preview && (
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1">Detected</p>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs">{preview.away} @ {preview.home}</Badge>
            <span className="text-xs text-muted-foreground">{preview.date}</span>
            <span className="text-xs text-muted-foreground">({preview.rows} events)</span>
          </div>
        </Card>
      )}

      <Button
        onClick={() => importMutation.mutate()}
        disabled={!fileContent || importMutation.isPending}
        className="w-full gap-2"
      >
        {importMutation.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</>
        ) : (
          <><Upload className="h-4 w-4" /> Import NBA PBP</>
        )}
      </Button>

      {result && result.status === "success" && (
        <Card className="p-3 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold text-foreground">Import Complete</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <span className="text-muted-foreground">Game</span>
            <span className="font-medium">{result.final_score}</span>
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium">{result.date}</span>
            <span className="text-muted-foreground">Events</span>
            <span className="font-medium">{result.plays_imported}</span>
            <span className="text-muted-foreground">Periods</span>
            <span className="font-medium">{result.periods}</span>
            <span className="text-muted-foreground">Game ID</span>
            <span className="font-medium font-mono text-[10px]">{result.game_id}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
