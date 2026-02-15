import { useState, useRef } from "react";
import { DataHealthDashboard } from "@/components/admin/DataHealthDashboard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ManualStatsEntry } from "@/components/admin/ManualStatsEntry";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink } from "lucide-react";
import * as XLSX from "xlsx";

const BREF_TEAMS = [
  { abbr: "ATL", bref: "ATL", name: "Atlanta Hawks" },
  { abbr: "BOS", bref: "BOS", name: "Boston Celtics" },
  { abbr: "BKN", bref: "BRK", name: "Brooklyn Nets" },
  { abbr: "CHA", bref: "CHO", name: "Charlotte Hornets" },
  { abbr: "CHI", bref: "CHI", name: "Chicago Bulls" },
  { abbr: "CLE", bref: "CLE", name: "Cleveland Cavaliers" },
  { abbr: "DAL", bref: "DAL", name: "Dallas Mavericks" },
  { abbr: "DEN", bref: "DEN", name: "Denver Nuggets" },
  { abbr: "DET", bref: "DET", name: "Detroit Pistons" },
  { abbr: "GSW", bref: "GSW", name: "Golden State Warriors" },
  { abbr: "HOU", bref: "HOU", name: "Houston Rockets" },
  { abbr: "IND", bref: "IND", name: "Indiana Pacers" },
  { abbr: "LAC", bref: "LAC", name: "Los Angeles Clippers" },
  { abbr: "LAL", bref: "LAL", name: "Los Angeles Lakers" },
  { abbr: "MEM", bref: "MEM", name: "Memphis Grizzlies" },
  { abbr: "MIA", bref: "MIA", name: "Miami Heat" },
  { abbr: "MIL", bref: "MIL", name: "Milwaukee Bucks" },
  { abbr: "MIN", bref: "MIN", name: "Minnesota Timberwolves" },
  { abbr: "NOP", bref: "NOP", name: "New Orleans Pelicans" },
  { abbr: "NYK", bref: "NYK", name: "New York Knicks" },
  { abbr: "OKC", bref: "OKC", name: "Oklahoma City Thunder" },
  { abbr: "ORL", bref: "ORL", name: "Orlando Magic" },
  { abbr: "PHI", bref: "PHI", name: "Philadelphia 76ers" },
  { abbr: "PHX", bref: "PHO", name: "Phoenix Suns" },
  { abbr: "POR", bref: "POR", name: "Portland Trail Blazers" },
  { abbr: "SAC", bref: "SAC", name: "Sacramento Kings" },
  { abbr: "SAS", bref: "SAS", name: "San Antonio Spurs" },
  { abbr: "TOR", bref: "TOR", name: "Toronto Raptors" },
  { abbr: "UTA", bref: "UTA", name: "Utah Jazz" },
  { abbr: "WAS", bref: "WAS", name: "Washington Wizards" },
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
  const rosterCsvRef = useRef<HTMLInputElement>(null);
  const birthTimeCsvRef = useRef<HTMLInputElement>(null);
  const [rosterLeague, setRosterLeague] = useState<string>("NFL");
  const gamelogCsvRef = useRef<HTMLInputElement>(null);
  const [gamelogLeague, setGamelogLeague] = useState<string>("NFL");
  const nbaBoxscoreRef = useRef<HTMLInputElement>(null);
  const [manualLeague, setManualLeague] = useState<string>("NFL");
  const nbaTxtRef = useRef<HTMLInputElement>(null);
  const [nbaTxtType, setNbaTxtType] = useState<string>("auto");
  const nbaSeasonRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => setLog((prev) => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);

  const importScheduleBatch = async (league: string, records: any[]) => {
    addLog(`Importing ${league} schedule (${records.length} games)...`);

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

    addLog(`✅ ${league}: Inserted/Updated ${totalInserted}, Skipped ${totalSkipped}`);
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
            // Pass through score fields for upsert
            homeScore: row.homeScore ?? row.homeTeamScore ?? row.HomeScore,
            awayScore: row.awayScore ?? row.awayTeamScore ?? row.AwayScore,
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
  const [gameLogTeam, setGameLogTeam] = useState<string>("");

  const handleGameLogUpload = async () => {
    const files = gameLogRef.current?.files;
    if (!files || files.length === 0) { addLog("No files selected"); return; }

    setLoading(true);
    for (let f = 0; f < files.length; f++) {
      const file = files[f];
      addLog(`Reading game log: ${file.name}${gameLogTeam ? ` (team: ${gameLogTeam})` : " (auto-detect)"}`);
      try {
        const text = await file.text();
        const body: Record<string, string> = { html_content: text, filename: file.name };
        if (gameLogTeam && gameLogTeam !== "auto") body.team_abbr = gameLogTeam;
        const { data, error } = await supabase.functions.invoke("import-team-gamelog", { body });
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

  // ── CSV Schedule + Scores Import (all leagues) ──
  const csvRef = useRef<HTMLInputElement>(null);
  const [csvLeague, setCsvLeague] = useState<string>("NFL");

  const handleCsvScheduleUpload = async () => {
    const file = csvRef.current?.files?.[0];
    if (!file) { addLog("No CSV file selected"); return; }

    setLoading(true);
    addLog(`Uploading ${csvLeague} schedule CSV: ${file.name}`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("league", csvLeague);
      formData.append("data_type", "games");

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-historical-csv`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: formData,
        }
      );
      const result = await res.json();

      if (!res.ok || result.error) {
        addLog(`❌ ${result.error || "Upload failed"}`);
      } else {
        addLog(`✅ ${csvLeague}: Inserted ${result.rowsInserted || 0}, Skipped ${result.rowsSkipped || 0}`);
        if (result.errors?.length) {
          result.errors.slice(0, 5).forEach((e: string) => addLog(`  ⚠️ ${e}`));
          if (result.errors.length > 5) addLog(`  ... and ${result.errors.length - 5} more`);
        }
      }
    } catch (e: any) {
      addLog(`❌ ${e.message}`);
    }
    setLoading(false);
  };

  const handleRosterCsvUpload = async () => {
    const file = rosterCsvRef.current?.files?.[0];
    if (!file) { addLog("No roster CSV selected"); return; }
    setLoading(true);
    addLog(`Uploading ${rosterLeague} roster CSV: ${file.name}`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "roster");
      formData.append("league", rosterLeague);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-players-csv`,
        { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, body: formData }
      );
      const result = await res.json();
      if (!res.ok || result.error) addLog(`❌ ${result.error || "Upload failed"}`);
      else {
        addLog(`✅ Inserted ${result.inserted}, Updated ${result.updated}, Skipped ${result.skipped}`);
        if (result.errors?.length) result.errors.slice(0, 5).forEach((e: string) => addLog(`  ⚠️ ${e}`));
      }
    } catch (e: any) { addLog(`❌ ${e.message}`); }
    setLoading(false);
  };

  const handleBirthTimeCsvUpload = async () => {
    const file = birthTimeCsvRef.current?.files?.[0];
    if (!file) { addLog("No birth time CSV selected"); return; }
    setLoading(true);
    addLog(`Uploading birth time CSV: ${file.name}`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "birthtime");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-players-csv`,
        { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, body: formData }
      );
      const result = await res.json();
      if (!res.ok || result.error) addLog(`❌ ${result.error || "Upload failed"}`);
      else {
        addLog(`✅ Updated ${result.updated} birth times, Skipped ${result.skipped}`);
        if (result.errors?.length) result.errors.slice(0, 5).forEach((e: string) => addLog(`  ⚠️ ${e}`));
      }
    } catch (e: any) { addLog(`❌ ${e.message}`); }
    setLoading(false);
  };

  const handleGeocode = async (league: string) => {
    setLoading(true);
    addLog(`Geocoding ${league || "all"} player birth places (batch of 15, ~1s per player)...`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-players?mode=geocode&league=${league}&limit=15`,
        { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const result = await res.json();
      if (!res.ok || result.error) addLog(`❌ ${result.error}`);
      else {
        addLog(`✅ Geocoded ${result.geocoded}/${result.total} players (${result.failed} failed)`);
        if (result.errors?.length) result.errors.slice(0, 5).forEach((e: string) => addLog(`  ⚠️ ${e}`));
        if (result.geocoded > 0) addLog(`ℹ️ Click again to geocode the next batch`);
      }
    } catch (e: any) { addLog(`❌ ${e.message}`); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background p-6 space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Data Import Admin</h1>
      <DataHealthDashboard />
      <div className="space-y-4">
        {/* CSV Schedule + Scores — all leagues */}
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">League Schedule + Scores CSV Import</h2>
          <p className="text-xs text-muted-foreground">
            Upload a .csv with game schedules and scores. Completed games get final scores; future games are marked as scheduled.
            Existing games are updated with scores on re-import (upsert).
          </p>
          <p className="text-xs text-muted-foreground italic">
            Expected columns (flexible names): Date, HomeTeam, AwayTeam, HomeScore, AwayScore, Venue, Status
          </p>
          <div className="flex gap-3 items-center flex-wrap">
            <Select value={csvLeague} onValueChange={setCsvLeague}>
              <SelectTrigger className="w-32 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NFL">NFL</SelectItem>
                <SelectItem value="NHL">NHL</SelectItem>
                <SelectItem value="MLB">MLB</SelectItem>
                <SelectItem value="NBA">NBA</SelectItem>
              </SelectContent>
            </Select>
            <input ref={csvRef} type="file" accept=".csv" className="text-xs" />
            <Button onClick={handleCsvScheduleUpload} disabled={loading} variant="default">
              {loading ? "Importing..." : "Import CSV Schedule"}
            </Button>
          </div>
        </Card>

        <div className="flex gap-3 flex-wrap items-end">
          <Button onClick={importNbaSchedule} disabled={loading} variant="secondary">
            {loading ? "Importing..." : "Import NBA 2025-26 Schedule (built-in CSV)"}
          </Button>
        </div>

        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Team Game Logs (Basketball Reference)</h2>
          <p className="text-xs text-muted-foreground">
            Upload .xls game log files exported from Basketball Reference (basic or advanced).
            Select the team below, or leave as "Auto-detect" if the filename contains the team name.
          </p>
          <div className="flex gap-3 items-center flex-wrap">
            <Select value={gameLogTeam} onValueChange={setGameLogTeam}>
              <SelectTrigger className="w-48 h-9 text-xs">
                <SelectValue placeholder="Auto-detect team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                {BREF_TEAMS.map((t) => (
                  <SelectItem key={t.abbr} value={t.abbr}>{t.abbr} — {t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  href={`https://www.basketball-reference.com/teams/${t.bref}/2026/gamelog/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                >
                  Basic <ExternalLink className="h-2.5 w-2.5" />
                </a>
                <a
                  href={`https://www.basketball-reference.com/teams/${t.bref}/2026/gamelog-advanced/`}
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
            (NFL: 2000s, NHL: 3000s, MLB: 4000s). Scores are now preserved on re-import (upsert).
          </p>
          <div className="flex gap-3 items-center">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="text-xs" />
            <Button onClick={handleExcelUpload} disabled={loading} variant="secondary">
              {loading ? "Importing..." : "Import Excel Schedules"}
            </Button>
          </div>
        </Card>

        {/* Roster CSV Import */}
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">🏟️ Player Roster CSV Import</h2>
          <p className="text-xs text-muted-foreground">
            Upload a .csv with player rosters. Matches existing players by name+league; creates new ones if not found.
          </p>
          <p className="text-xs text-muted-foreground italic">
            Columns: Name, Team, Position, League, BirthDate, BirthPlace (optional: BirthTime, ExternalId)
          </p>
          <div className="flex gap-3 items-center flex-wrap">
            <Select value={rosterLeague} onValueChange={setRosterLeague}>
              <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NFL">NFL</SelectItem>
                <SelectItem value="NHL">NHL</SelectItem>
                <SelectItem value="MLB">MLB</SelectItem>
                <SelectItem value="NBA">NBA</SelectItem>
              </SelectContent>
            </Select>
            <input ref={rosterCsvRef} type="file" accept=".csv" className="text-xs" />
            <Button onClick={handleRosterCsvUpload} disabled={loading} variant="default">
              {loading ? "Importing..." : "Import Roster CSV"}
            </Button>
          </div>
        </Card>

        {/* Birth Time CSV Import */}
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">🕐 Birth Time CSV Update</h2>
          <p className="text-xs text-muted-foreground">
            Upload a .csv to update birth times for existing players. Matches by Name + League.
          </p>
          <p className="text-xs text-muted-foreground italic">
            Columns: Name, League, BirthTime (HH:MM 24hr), BirthPlace (optional)
          </p>
          <div className="flex gap-3 items-center flex-wrap">
            <input ref={birthTimeCsvRef} type="file" accept=".csv" className="text-xs" />
            <Button onClick={handleBirthTimeCsvUpload} disabled={loading} variant="default">
              {loading ? "Updating..." : "Update Birth Times"}
            </Button>
          </div>
        </Card>

        {/* Geocode Birth Places */}
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">📍 Geocode Birth Places → Coordinates</h2>
          <p className="text-xs text-muted-foreground">
            Converts birth_place text to lat/lng coordinates for natal charts.
            Processes 50 players at a time (~1 sec each). Run multiple times until all are done.
          </p>
          <div className="flex gap-2 flex-wrap">
            {["NBA", "NFL", "NHL", "MLB"].map((l) => (
              <Button key={l} onClick={() => handleGeocode(l)} disabled={loading} variant="secondary" size="sm">
                Geocode {l}
              </Button>
            ))}
            <Button onClick={() => handleGeocode("")} disabled={loading} variant="outline" size="sm">
              Geocode All
            </Button>
          </div>
        </Card>

        {/* NFL Data Warehouse (Rolling Insights) */}
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">🏈 NFL Data Warehouse (Rolling Insights API)</h2>
          <p className="text-xs text-muted-foreground">
            Backfill schedules, fetch injuries, and ingest play-by-play from Rolling Insights.
            Cache-first design — won't re-fetch data already stored.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={async () => {
              setLoading(true);
              addLog("Backfilling NFL schedules (2024 + 2025 seasons)...");
              try {
                const { data, error } = await supabase.functions.invoke("nfl-backfill-schedules", {
                  body: { action: "backfill", years: [2024, 2025] },
                });
                if (error) addLog(`❌ ${error.message}`);
                else {
                  addLog(`✅ Backfill complete`);
                  (data?.results ?? []).forEach((r: any) => addLog(`  Season ${r.year}: ${r.games} games (${r.status})`));
                }
              } catch (e: any) { addLog(`❌ ${e.message}`); }
              setLoading(false);
            }} disabled={loading} variant="default" size="sm">
              Backfill Schedules (2024+2025)
            </Button>
            <Button onClick={async () => {
              setLoading(true);
              addLog("Refreshing NFL weekly schedule...");
              try {
                const { data, error } = await supabase.functions.invoke("nfl-backfill-schedules", {
                  body: { action: "weekly" },
                });
                if (error) addLog(`❌ ${error.message}`);
                else addLog(`✅ Weekly refresh: ${data?.results?.[0]?.updated ?? 0} games updated`);
              } catch (e: any) { addLog(`❌ ${e.message}`); }
              setLoading(false);
            }} disabled={loading} variant="secondary" size="sm">
              Refresh This Week
            </Button>
            <Button onClick={async () => {
              setLoading(true);
              addLog("Fetching NFL injuries...");
              try {
                const { data, error } = await supabase.functions.invoke("nfl-refresh-injuries");
                if (error) addLog(`❌ ${error.message}`);
                else addLog(`✅ Injuries: ${data?.upserted ?? 0} records upserted`);
              } catch (e: any) { addLog(`❌ ${e.message}`); }
              setLoading(false);
            }} disabled={loading} variant="secondary" size="sm">
              Fetch Injuries
            </Button>
          </div>
        </Card>

        {/* Player Game Stats CSV Import (NFL etc.) */}
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">🏈 Player Game Stats CSV Import</h2>
          <p className="text-xs text-muted-foreground">
            Upload per-game player stats. Auto-creates player records if they don't exist.
            Matches games by HomeTeam + AwayTeam + Date.
          </p>
          <p className="text-xs text-muted-foreground italic">
            Columns: Name, Team, DateTime PST (or Date), HomeTeam, AwayTeam, Targets, ReceivingYards,
            ReceivingTouchdowns, PassingAttempts, Completions, PassingYards, PassingTouchdowns,
            RushingAttempts, RushingYards, RushingTouchdowns
          </p>
          <div className="flex gap-3 items-center flex-wrap">
            <Select value={gamelogLeague} onValueChange={setGamelogLeague}>
              <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NFL">NFL</SelectItem>
                <SelectItem value="NHL">NHL</SelectItem>
                <SelectItem value="MLB">MLB</SelectItem>
                <SelectItem value="NBA">NBA</SelectItem>
              </SelectContent>
            </Select>
            <input ref={gamelogCsvRef} type="file" accept=".csv" className="text-xs" />
            <Button onClick={async () => {
              const file = gamelogCsvRef.current?.files?.[0];
              if (!file) { addLog("No CSV selected"); return; }
              setLoading(true);
              addLog(`Uploading ${gamelogLeague} player game stats: ${file.name}`);
              try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("league", gamelogLeague);
                const { data: { session } } = await supabase.auth.getSession();
                const res = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-player-gamelog-csv`,
                  { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, body: formData }
                );
                const result = await res.json();
                if (!res.ok || result.error) addLog(`❌ ${result.error || "Upload failed"}`);
                else {
                  addLog(`✅ ${result.rows_parsed} rows → ${result.stats_inserted} stats inserted, ${result.players_created} players created, ${result.games_not_found} games unmatched`);
                  if (result.errors?.length) result.errors.slice(0, 5).forEach((e: string) => addLog(`  ⚠️ ${e}`));
                }
              } catch (e: any) { addLog(`❌ ${e.message}`); }
              setLoading(false);
            }} disabled={loading} variant="default">
              {loading ? "Importing..." : "Import Player Game Stats"}
            </Button>
          </div>
        </Card>

        {/* NBA Box Score TXT Import */}
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">🏀 NBA Box Score TXT Import</h2>
          <p className="text-xs text-muted-foreground">
            Upload the NBA.com fixed-width player box score text file.
            Auto-creates players and matches games by team + opponent + date.
          </p>
          <p className="text-xs text-muted-foreground italic">
            Format: DATE TM OPP NAME (POS) G MIN FG FGA FG3 F3A FT FTA OFF DEF TRB AST PF DQ STL TO BLK PTS
          </p>
          <div className="flex gap-3 items-center flex-wrap">
            <input ref={nbaBoxscoreRef} type="file" accept=".txt,.csv" className="text-xs" />
            <Button onClick={async () => {
              const file = nbaBoxscoreRef.current?.files?.[0];
              if (!file) { addLog("No file selected"); return; }
              setLoading(true);
              addLog(`Uploading NBA box scores: ${file.name}`);
              try {
                const formData = new FormData();
                formData.append("file", file);
                const { data: { session } } = await supabase.auth.getSession();
                const res = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-nba-boxscore-txt`,
                  { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, body: formData }
                );
                const result = await res.json();
                if (!res.ok || result.error) addLog(`❌ ${result.error || "Upload failed"}`);
                else {
                  addLog(`✅ ${result.rows_parsed} rows → ${result.stats_inserted} stats inserted, ${result.players_created} players created, ${result.games_not_found} games unmatched`);
                  if (result.unmatched_games_sample?.length) addLog(`  Unmatched: ${result.unmatched_games_sample.join(", ")}`);
                  if (result.errors?.length) result.errors.slice(0, 5).forEach((e: string) => addLog(`  ⚠️ ${e}`));
                }
              } catch (e: any) { addLog(`❌ ${e.message}`); }
              setLoading(false);
            }} disabled={loading} variant="default">
              {loading ? "Importing..." : "Import NBA Box Scores"}
            </Button>
          </div>
        </Card>

        {/* NBA Player Season Stats CSV Import */}
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">🏀 NBA Player Season Stats CSV Import</h2>
          <p className="text-xs text-muted-foreground">
            Upload NBA player season totals or averages CSV (Basketball Reference format).
            Auto-detects totals vs averages. Multi-team rows (2TM/3TM) are skipped.
          </p>
          <p className="text-xs text-muted-foreground italic">
            Columns: Player/Name, Age, Team, Pos, G, GS, MP, FG, FGA, FG%, 3P, 3PA, 3P%, 2P, 2PA, 2P%, eFG%, FT, FTA, FT%, ORB, DRB, TRB, AST, STL, BLK, TOV, PF, PTS, Trp-Dbl
          </p>
          <div className="flex gap-3 items-center flex-wrap">
            <input ref={nbaSeasonRef} type="file" accept=".csv" multiple className="text-xs" />
            <Button onClick={async () => {
              const files = nbaSeasonRef.current?.files;
              if (!files || files.length === 0) { addLog("No files selected"); return; }
              setLoading(true);
              for (let f = 0; f < files.length; f++) {
                const file = files[f];
                addLog(`Uploading NBA season stats: ${file.name}`);
                try {
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("stat_type", "auto");
                  const { data: { session } } = await supabase.auth.getSession();
                  const res = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-player-season-stats`,
                    { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, body: formData }
                  );
                  const result = await res.json();
                  if (!res.ok || result.error) addLog(`❌ ${file.name}: ${result.error || "Upload failed"}`);
                  else {
                    addLog(`✅ ${file.name}: Type=${result.stat_type}, ${result.upserted} upserted, ${result.players_created} players created, ${result.skipped} skipped`);
                    if (result.errors?.length) result.errors.slice(0, 5).forEach((e: string) => addLog(`  ⚠️ ${e}`));
                  }
                } catch (e: any) { addLog(`❌ ${file.name}: ${e.message}`); }
              }
              setLoading(false);
            }} disabled={loading} variant="default">
              {loading ? "Importing..." : "Import Player Season Stats"}
            </Button>
          </div>
        </Card>

        {/* NBA Team Stats / Standings / Misc TXT Import */}
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">🏀 NBA Team Data TXT Import</h2>
          <p className="text-xs text-muted-foreground">
            Upload NBA.com text files: team stats, opponent stats, standings, misc, points breakdown, ratios, or daily scores.
            Auto-detects format or select manually.
          </p>
          <div className="flex gap-3 items-center flex-wrap">
            <Select value={nbaTxtType} onValueChange={setNbaTxtType}>
              <SelectTrigger className="w-40 h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                <SelectItem value="team_stats">Team Stats</SelectItem>
                <SelectItem value="team_misc">Team Misc</SelectItem>
                <SelectItem value="pts_breakdown">Paint/FastBreak</SelectItem>
                <SelectItem value="standings">Standings</SelectItem>
                <SelectItem value="standings_h2h">Head-to-Head</SelectItem>
                <SelectItem value="ratios">Ratios</SelectItem>
                <SelectItem value="day_scores">Daily Scores</SelectItem>
              </SelectContent>
            </Select>
            <input ref={nbaTxtRef} type="file" accept=".txt,.csv" multiple className="text-xs" />
            <Button onClick={async () => {
              const files = nbaTxtRef.current?.files;
              if (!files || files.length === 0) { addLog("No files selected"); return; }
              setLoading(true);
              for (let f = 0; f < files.length; f++) {
                const file = files[f];
                addLog(`Uploading NBA data: ${file.name} (type: ${nbaTxtType})`);
                try {
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("file_type", nbaTxtType);
                  const { data: { session } } = await supabase.auth.getSession();
                  const res = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-nba-txt`,
                    { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, body: formData }
                  );
                  const result = await res.json();
                  if (!res.ok || result.error) addLog(`❌ ${file.name}: ${result.error || "Upload failed"}`);
                  else {
                    const parts = [];
                    if (result.type) parts.push(`Type: ${result.type}`);
                    if (result.upserted) parts.push(`${result.upserted} upserted`);
                    if (result.teams) parts.push(`${result.teams} teams`);
                    if (result.games_updated) parts.push(`${result.games_updated} games updated`);
                    if (result.quarters_inserted) parts.push(`${result.quarters_inserted} quarters`);
                    addLog(`✅ ${file.name}: ${parts.join(", ")}`);
                    if (result.errors?.length) result.errors.slice(0, 5).forEach((e: string) => addLog(`  ⚠️ ${e}`));
                  }
                } catch (e: any) { addLog(`❌ ${file.name}: ${e.message}`); }
              }
              setLoading(false);
            }} disabled={loading} variant="default">
              {loading ? "Importing..." : "Import NBA Team Data"}
            </Button>
          </div>
        </Card>

        {/* Manual Player Stats Entry */}
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">📝 Manual Player Stats Entry</h2>
          <p className="text-xs text-muted-foreground">
            Fill in the spreadsheet below to manually enter per-game player stats. Select the league to change stat fields, players, and teams.
          </p>
          <div className="flex gap-2 items-center">
            <label className="text-[10px] text-muted-foreground font-medium">League</label>
            <Select value={manualLeague} onValueChange={setManualLeague}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NFL">NFL</SelectItem>
                <SelectItem value="NBA">NBA</SelectItem>
                <SelectItem value="NHL">NHL</SelectItem>
                <SelectItem value="MLB">MLB</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ManualStatsEntry league={manualLeague} onLog={addLog} />
        </Card>
      </div>

      <Card className="p-4 bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground">Import Log</h2>
          {log.length > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setLog([])}>
              Clear
            </Button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto border border-border rounded-lg bg-background p-3">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
            {log.length ? log.join("\n") : "No activity yet. Click a button above to start importing."}
          </pre>
        </div>
      </Card>
    </div>
  );
}