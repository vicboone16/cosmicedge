import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Upload, Loader2, FileJson, CheckCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * JSON Upload for quarter/half period averages.
 *
 * Expected JSON format (array of objects):
 * [
 *   {
 *     "team_abbr": "BOS",
 *     "period": "Q1",
 *     "avg_points": 29.5,
 *     "avg_points_allowed": 26.2,
 *     "avg_pace": 98.1,
 *     "avg_fg_pct": 0.472,
 *     "avg_three_pct": 0.381,
 *     "avg_ft_pct": 0.812,
 *     "games_played": 55
 *   },
 *   ...
 * ]
 *
 * Or keyed by team:
 * {
 *   "BOS": {
 *     "Q1": { "avg_points": 29.5, ... },
 *     "1H": { "avg_points": 55.2, ... }
 *   }
 * }
 */

const VALID_PERIODS = new Set(["Q1", "Q2", "Q3", "Q4", "1H", "2H", "OT"]);

const PERIOD_OPTIONS = [
  { value: "auto", label: "Auto (from JSON)" },
  { value: "Q1", label: "Q1" },
  { value: "Q2", label: "Q2" },
  { value: "Q3", label: "Q3" },
  { value: "Q4", label: "Q4" },
  { value: "1H", label: "1st Half" },
  { value: "2H", label: "2nd Half" },
  { value: "OT", label: "OT" },
];

export default function AdminPeriodAveragesEditor() {
  const [jsonText, setJsonText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ upserted: number; errors: string[] } | null>(null);
  const [league] = useState("NBA");
  const [season] = useState(2025);
  const [periodOverride, setPeriodOverride] = useState("auto");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setJsonText(ev.target?.result as string || "");
      setResult(null);
    };
    reader.readAsText(file);
  };

  const parseJson = (text: string): any[] => {
    const parsed = JSON.parse(text);

    // Format 1: Array of flat objects
    if (Array.isArray(parsed)) return parsed;

    // Format 2: Keyed by team → period → stats
    if (typeof parsed === "object") {
      const rows: any[] = [];
      for (const [team, periods] of Object.entries(parsed)) {
        if (typeof periods !== "object" || periods === null) continue;
        for (const [period, stats] of Object.entries(periods as Record<string, any>)) {
          rows.push({ team_abbr: team, period, ...stats });
        }
      }
      return rows;
    }

    throw new Error("Unrecognized JSON format");
  };

  const handleUpload = async () => {
    if (!jsonText.trim()) {
      toast({ title: "No JSON provided", variant: "destructive" });
      return;
    }

    setUploading(true);
    setResult(null);
    const errors: string[] = [];

    try {
      const rows = parseJson(jsonText);
      if (rows.length === 0) {
        toast({ title: "No rows found in JSON", variant: "destructive" });
        setUploading(false);
        return;
      }

      const upsertRows: any[] = [];

      // Map numeric periods from BDL format to named periods
      const NUMERIC_PERIOD_MAP: Record<string, string> = {
        "0": "full", "1": "Q1", "2": "Q2", "3": "Q3", "4": "Q4",
        "5": "OT", "6": "OT2", "7": "OT3", "8": "OT4",
        "9": "1H", "10": "2H",
      };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const team = row.team_abbr?.toUpperCase();
        let period = String(row.period ?? "").toUpperCase();

        // Auto-map numeric periods
        if (NUMERIC_PERIOD_MAP[row.period?.toString()]) {
          period = NUMERIC_PERIOD_MAP[row.period.toString()];
        }

        // Skip "full" period — not relevant for period averages
        if (period === "FULL") continue;

        if (!team) { errors.push(`Row ${i + 1}: missing team_abbr`); continue; }
        if (!VALID_PERIODS.has(period)) {
          errors.push(`Row ${i + 1}: invalid period "${row.period}" → "${period}" (valid: ${[...VALID_PERIODS].join(", ")})`);
          continue;
        }

        upsertRows.push({
          team_abbr: team,
          season,
          league,
          period,
          avg_points: row.avg_points ?? null,
          avg_points_allowed: row.avg_points_allowed ?? null,
          avg_pace: row.avg_pace ?? null,
          avg_fg_pct: row.avg_fg_pct ?? null,
          avg_three_pct: row.avg_three_pct ?? null,
          avg_ft_pct: row.avg_ft_pct ?? null,
          games_played: row.games_played ?? null,
          updated_at: new Date().toISOString(),
        });
      }

      if (upsertRows.length === 0) {
        toast({ title: "No valid rows to upsert", description: errors.join("; "), variant: "destructive" });
        setUploading(false);
        setResult({ upserted: 0, errors });
        return;
      }

      // Batch upsert in chunks of 100
      let upserted = 0;
      for (let i = 0; i < upsertRows.length; i += 100) {
        const chunk = upsertRows.slice(i, i + 100);
        const { error } = await supabase
          .from("team_period_averages")
          .upsert(chunk as any, { onConflict: "team_abbr,season,league,period" });

        if (error) {
          errors.push(`Batch ${Math.floor(i / 100) + 1}: ${error.message}`);
        } else {
          upserted += chunk.length;
        }
      }

      setResult({ upserted, errors });
      toast({
        title: `Uploaded ${upserted} period averages`,
        description: errors.length > 0 ? `${errors.length} errors` : undefined,
        variant: errors.length > 0 ? "destructive" : "default",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      setResult({ upserted: 0, errors });
      toast({ title: "JSON parse error", description: msg, variant: "destructive" });
    }

    setUploading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-foreground">Period Averages (Q/H/OT)</h2>
          <Badge variant="outline" className="text-[9px]">{league} {season}</Badge>
        </div>
      </div>

      {/* JSON Input */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="relative cursor-pointer">
            <input type="file" accept=".json" onChange={handleFileUpload} className="sr-only" />
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors">
              <FileJson className="h-3.5 w-3.5" /> Upload JSON file
            </span>
          </label>
          <span className="text-[10px] text-muted-foreground">or paste below</span>
        </div>

        <Textarea
          placeholder={`Paste JSON array or object:\n[\n  { "team_abbr": "BOS", "period": "Q1", "avg_points": 29.5, ... },\n  ...\n]\n\nOr keyed format:\n{\n  "BOS": {\n    "Q1": { "avg_points": 29.5, ... },\n    "1H": { "avg_points": 55.2, ... }\n  }\n}`}
          value={jsonText}
          onChange={(e) => { setJsonText(e.target.value); setResult(null); }}
          className="h-48 font-mono text-xs"
        />

        <p className="text-[9px] text-muted-foreground">
          Valid periods: {[...VALID_PERIODS].join(", ")}. Fields: avg_points, avg_points_allowed, avg_pace, avg_fg_pct, avg_three_pct, avg_ft_pct, games_played
        </p>
      </div>

      <Button
        onClick={handleUpload}
        disabled={uploading || !jsonText.trim()}
        className="w-full gap-2"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? "Uploading..." : "Upload Period Averages"}
      </Button>

      {/* Result */}
      {result && (
        <div className={`rounded-lg p-3 text-xs space-y-1 ${result.errors.length > 0 ? "bg-destructive/10 border border-destructive/20" : "bg-primary/10 border border-primary/20"}`}>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">{result.upserted} rows upserted</span>
          </div>
          {result.errors.length > 0 && (
            <div className="space-y-0.5 text-destructive">
              {result.errors.slice(0, 10).map((e, i) => (
                <p key={i} className="text-[10px]">• {e}</p>
              ))}
              {result.errors.length > 10 && (
                <p className="text-[10px]">...and {result.errors.length - 10} more</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
