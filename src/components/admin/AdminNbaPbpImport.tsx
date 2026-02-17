import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, CheckCircle2, Loader2, XCircle, Trash2, RotateCcw } from "lucide-react";
import { Progress } from "@/components/ui/progress";

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

interface FileEntry {
  name: string;
  content: string;
  preview: { away: string; home: string; date: string; rows: number } | null;
  status: "pending" | "importing" | "done" | "error";
  result?: ImportResult;
  error?: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function AdminNbaPbpImport() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsePreview = (text: string) => {
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length <= 1) return null;
    const headers = lines[0].split(",");
    const awayIdx = headers.indexOf("away_team");
    const homeIdx = headers.indexOf("home_team");
    const dateIdx = headers.indexOf("date");
    const firstData = lines[1].split(",");
    return {
      away: awayIdx >= 0 ? firstData[awayIdx] : "?",
      home: homeIdx >= 0 ? firstData[homeIdx] : "?",
      date: dateIdx >= 0 ? firstData[dateIdx] : "?",
      rows: lines.length - 1,
    };
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    const readers: Promise<FileEntry>[] = [];
    for (let i = 0; i < selected.length; i++) {
      const file = selected[i];
      readers.push(
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const text = ev.target?.result as string;
            resolve({
              name: file.name,
              content: text,
              preview: parsePreview(text),
              status: "pending",
            });
          };
          reader.readAsText(file);
        })
      );
    }

    Promise.all(readers).then((entries) => {
      setFiles((prev) => [...prev, ...entries]);
    });

    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearDone = () => {
    setFiles((prev) => prev.filter((f) => f.status !== "done"));
  };

  const retryFailed = () => {
    setFiles((prev) =>
      prev.map((f) => (f.status === "error" ? { ...f, status: "pending" as const, error: undefined } : f))
    );
  };

  const importFile = async (entry: FileEntry, idx: number) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, status: "importing" } : f))
    );

    try {
      const resp = await supabase.functions.invoke("import-nba-pbp-csv", {
        body: { csv: entry.content },
      });

      if (resp.error) {
        // Try to extract the actual error body
        let errMsg = resp.error.message;
        try {
          const ctx = resp.error as any;
          if (ctx.context?.body) {
            const bodyText = await new Response(ctx.context.body).text();
            const parsed = JSON.parse(bodyText);
            if (parsed.error) errMsg = parsed.error;
          }
        } catch { /* use default message */ }
        throw new Error(errMsg);
      }

      const data = resp.data as ImportResult;
      if (data?.error) throw new Error(data.error);

      setFiles((prev) =>
        prev.map((f, i) =>
          i === idx ? { ...f, status: "done", result: data } : f
        )
      );
    } catch (err: any) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === idx ? { ...f, status: "error", error: err.message } : f
        )
      );
    }
  };

  const importAll = async () => {
    setImporting(true);
    const pending = files
      .map((f, i) => ({ ...f, idx: i }))
      .filter((f) => f.status === "pending");

    for (let j = 0; j < pending.length; j++) {
      const entry = pending[j];
      await importFile(entry, entry.idx);
      // Add 500ms delay between requests to avoid rate limiting
      if (j < pending.length - 1) await sleep(500);
    }

    setImporting(false);
    const done = files.filter((f) => f.status === "done").length;
    toast({ title: "Batch import complete", description: `${pending.length} processed` });
  };

  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const pendingCount = files.filter((f) => f.status === "pending").length;
  const progress = files.length > 0 ? ((doneCount + errorCount) / files.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">NBA PBP Batch Import</h2>
        <Badge variant="outline" className="text-[9px]">Multi-file</Badge>
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded-lg p-4 hover:bg-accent/30 transition-colors">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Click to select one or more NBA PBP CSV files
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      </div>

      {files.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground uppercase font-medium">
              {files.length} file{files.length !== 1 ? "s" : ""} queued
              {doneCount > 0 && ` · ${doneCount} done`}
              {errorCount > 0 && ` · ${errorCount} failed`}
            </span>
            <div className="flex gap-1">
              {errorCount > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={retryFailed}>
                  <RotateCcw className="h-3 w-3" /> Retry failed
                </Button>
              )}
              {doneCount > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={clearDone}>
                  <Trash2 className="h-3 w-3" /> Clear done
                </Button>
              )}
            </div>
          </div>

          {importing && <Progress value={progress} className="h-1.5" />}

          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {files.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs p-2 rounded-md border border-border bg-card"
              >
                {f.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                {f.status === "error" && <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                {f.status === "importing" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                {f.status === "pending" && <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}

                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{f.name}</div>
                  {f.preview && (
                    <div className="text-[10px] text-muted-foreground">
                      {f.preview.away} @ {f.preview.home} · {f.preview.date} · {f.preview.rows} rows
                    </div>
                  )}
                  {f.status === "done" && f.result && (
                    <div className="text-[10px] text-green-600">
                      ✓ {f.result.plays_imported} plays · {f.result.final_score}
                    </div>
                  )}
                  {f.status === "error" && (
                    <div className="text-[10px] text-destructive truncate">{f.error}</div>
                  )}
                </div>

                {f.status === "pending" && !importing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => removeFile(i)}
                  >
                    <XCircle className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Button
        onClick={importAll}
        disabled={pendingCount === 0 || importing}
        className="w-full gap-2"
      >
        {importing ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Importing {doneCount + errorCount + 1}/{files.length}...</>
        ) : (
          <><Upload className="h-4 w-4" /> Import {pendingCount} File{pendingCount !== 1 ? "s" : ""}</>
        )}
      </Button>
    </div>
  );
}
