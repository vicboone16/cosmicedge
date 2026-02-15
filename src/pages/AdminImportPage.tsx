import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import * as XLSX from "xlsx";

const BREF_TEAMS = [
  { abbr: "ATL", name: "Atlanta Hawks" },
  { abbr: "BOS", name: "Boston Celtics" },
  { abbr: "BRK", name: "Brooklyn Nets" },
  { abbr: "CHI", name: "Chicago Bulls" },
  { abbr: "CHO", name: "Charlotte Hornets" },
  { abbr: "CLE", name: "Cleveland Cavaliers" },
  { abbr: "DAL", name: "Dallas Mavericks" },
  { abbr: "DEN", name: "Denver Nuggets" },
  { abbr: "DET", name: "Detroit Pistons" },
  { abbr: "GSW", name: "Golden State Warriors" },
  { abbr: "HOU", name: "Houston Rockets" },
  { abbr: "IND", name: "Indiana Pacers" },
  { abbr: "LAC", name: "Los Angeles Clippers" },
  { abbr: "LAL", name: "Los Angeles Lakers" },
  { abbr: "MEM", name: "Memphis Grizzlies" },
  { abbr: "MIA", name: "Miami Heat" },
  { abbr: "MIL", name: "Milwaukee Bucks" },
  { abbr: "MIN", name: "Minnesota Timberwolves" },
  { abbr: "NOP", name: "New Orleans Pelicans" },
  { abbr: "NYK", name: "New York Knicks" },
  { abbr: "OKC", name: "Oklahoma City Thunder" },
  { abbr: "ORL", name: "Orlando Magic" },
  { abbr: "PHI", name: "Philadelphia 76ers" },
  { abbr: "PHO", name: "Phoenix Suns" },
  { abbr: "POR", name: "Portland Trail Blazers" },
  { abbr: "SAC", name: "Sacramento Kings" },
  { abbr: "SAS", name: "San Antonio Spurs" },
  { abbr: "TOR", name: "Toronto Raptors" },
  { abbr: "UTA", name: "Utah Jazz" },
  { abbr: "WAS", name: "Washington Wizards" },
];

// Team ID ranges per league
function detectLeague(homeTeamId: number): string | null {
  if (homeTeamId >= 2000 && homeTeamId < 3000) return "NFL";
  if (homeTeamId >= 3000 && homeTeamId < 4000) return "NHL";
  if (homeTeamId >= 4000 && homeTeamId < 5000) return "MLB";
  return null;
}

export default function AdminImportPage() {
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => setLog((prev) => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);

  const importScheduleBatch = async (league: string, records: any[]) => {
    addLog(`Importing ${league} schedule (${records.length} games)...`);

    // Send in chunks to avoid payload limits
    const CHUNK = 300;
    let totalInserted = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const { data, error } = await supabase.functions.invoke("import-sdio-bulk", {
        body: { action: "schedule", league, records: chunk },
      });
      if (error) {
        addLog(`❌ ${league} chunk ${i}: ${error.message}`);
        allErrors.push(error.message);
      } else {
        totalInserted += data.inserted || 0;
        totalSkipped += data.skipped || 0;
        if (data.errors?.length) allErrors.push(...data.errors);
      }
    }

    addLog(`✅ ${league}: Inserted ${totalInserted}, Skipped ${totalSkipped}`);
    if (allErrors.length) {
      allErrors.slice(0, 5).forEach((e) => addLog(`  ⚠️ ${e}`));
      if (allErrors.length > 5) addLog(`  ... and ${allErrors.length - 5} more errors`);
    }
  };

  const importNbaSchedule = async () => {
    setLoading(true);
    addLog("Fetching NBA schedule CSV...");
    try {
      const res = await fetch("/data/schedule-2025-26.csv");
      const csvText = await res.text();
      const lines = csvText.trim().split("\n");
      addLog(`Loaded ${lines.length - 1} rows from CSV`);
      const { data, error } = await supabase.functions.invoke("import-sdio-bulk", {
        body: { action: "schedule", league: "NBA", csv_text: csvText },
      });
      if (error) addLog(`❌ ${error.message}`);
      else {
        addLog(`✅ NBA: Inserted ${data.inserted}, Skipped ${data.skipped}`);
        if (data.errors?.length) data.errors.forEach((e: string) => addLog(`  ⚠️ ${e}`));
      }
    } catch (e: any) {
      addLog(`❌ ${e.message}`);
    }
    setLoading(false);
  };

  const handleExcelUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { addLog("No file selected"); return; }

    setLoading(true);
    addLog(`Reading Excel file: ${file.name}`);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });

      // Group records by detected league
      const leagueRecords: Record<string, any[]> = {};

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet);
        addLog(`Sheet "${sheetName}": ${rows.length} rows`);

        for (const row of rows) {
          const homeId = Number(row.hometeamId || row.homeTeamId);
          const league = detectLeague(homeId);
          if (!league) continue;
          if (!leagueRecords[league]) leagueRecords[league] = [];

          // Normalize field names for the edge function
          leagueRecords[league].push({
            gameId: row.gameId,
            gameDateTimeEst: row.gameDateTimeEst,
            hometeamId: row.hometeamId || row.homeTeamId,
            awayteamId: row.awayteamId || row.awayTeamId,
            homeTeamName: row.homeTeamName,
            awayTeamName: row.awayTeamName,
            arenaName: row.arenaName,
            venueName: row.venueName,
            venueLatitude: row.venueLatitude,
            venueLongitude: row.venueLongitude,
            gameLabel: row.gameLabel,
          });
        }
      }

      const leagues = Object.keys(leagueRecords);
      if (leagues.length === 0) {
        addLog("❌ No recognized league data found in file");
      } else {
        addLog(`Found leagues: ${leagues.map(l => `${l} (${leagueRecords[l].length})`).join(", ")}`);
        for (const league of leagues) {
          await importScheduleBatch(league, leagueRecords[league]);
        }
      }
    } catch (e: any) {
      addLog(`❌ ${e.message}`);
    }
    setLoading(false);
  };

  const gameLogRef = useRef<HTMLInputElement>(null);

  const handleGameLogUpload = async () => {
    const files = gameLogRef.current?.files;
    if (!files || files.length === 0) { addLog("No files selected"); return; }

    setLoading(true);
    for (let f = 0; f < files.length; f++) {
      const file = files[f];
      addLog(`Reading game log: ${file.name}`);
      try {
        const text = await file.text();
        const { data, error } = await supabase.functions.invoke("import-team-gamelog", {
          body: { html_content: text, filename: file.name },
        });
        if (error) {
          addLog(`❌ ${file.name}: ${error.message}`);
        } else {
          addLog(`✅ ${file.name}: ${data.inserted} stats inserted, ${data.skipped} skipped (${data.total} games total)`);
          if (data.errors?.length) {
            data.errors.slice(0, 5).forEach((e: string) => addLog(`  ⚠️ ${e}`));
            if (data.errors.length > 5) addLog(`  ... and ${data.errors.length - 5} more`);
          }
        }
      } catch (e: any) {
        addLog(`❌ ${file.name}: ${e.message}`);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background p-6 space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Data Import Admin</h1>

      <div className="space-y-4">
        <div className="flex gap-3 flex-wrap items-end">
          <Button onClick={importNbaSchedule} disabled={loading}>
            {loading ? "Importing..." : "Import NBA 2025-26 Schedule"}
          </Button>
        </div>

        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Team Game Logs (Basketball Reference)</h2>
          <p className="text-xs text-muted-foreground">
            Upload .xls game log files exported from Basketball Reference (basic or advanced).
            Team is auto-detected from filename. Basic and advanced stats are merged automatically.
            You can select multiple files at once.
          </p>
          <div className="flex gap-3 items-center">
            <input ref={gameLogRef} type="file" accept=".xls,.xlsx,.html" multiple className="text-xs" />
            <Button onClick={handleGameLogUpload} disabled={loading} variant="secondary">
              {loading ? "Importing..." : "Import Game Logs"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground italic">
            💡 Tip: Export both the "Game Log" (basic) and "Advanced Game Log" pages from Basketball Reference 
            for complete data (box scores + advanced metrics).
          </p>
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Basketball Reference Download Links</h2>
          <p className="text-xs text-muted-foreground">
            Click to open game log pages. Use "Share & Export" → download as .xls, then upload above.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-[400px] overflow-y-auto">
            {BREF_TEAMS.map((t) => (
              <div key={t.abbr} className="flex items-center gap-2 py-1">
                <span className="text-xs font-medium text-foreground w-8">{t.abbr}</span>
                <span className="text-xs text-muted-foreground truncate flex-1">{t.name}</span>
                <a
                  href={`https://www.basketball-reference.com/teams/${t.abbr}/2026/gamelog/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                >
                  Basic <ExternalLink className="h-2.5 w-2.5" />
                </a>
                <a
                  href={`https://www.basketball-reference.com/teams/${t.abbr}/2026/gamelog-advanced/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                >
                  Advanced <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Multi-League Schedule Import (Excel)</h2>
          <p className="text-xs text-muted-foreground">
            Upload an .xlsx file with NFL/NHL/MLB schedules. Teams are auto-detected by ID range 
            (NFL: 2000s, NHL: 3000s, MLB: 4000s). Each league is imported separately.
          </p>
          <div className="flex gap-3 items-center">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="text-xs" />
            <Button onClick={handleExcelUpload} disabled={loading} variant="secondary">
              {loading ? "Importing..." : "Import Excel Schedules"}
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-4 bg-muted/30 max-h-96 overflow-y-auto">
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
          {log.length ? log.join("\n") : "No activity yet. Click a button above to start importing."}
        </pre>
      </Card>
    </div>
  );
}
