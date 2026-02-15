import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Send, Upload } from "lucide-react";

interface PlayerRecord {
  id: string;
  name: string;
  team: string | null;
}

/* ── League-specific stat column definitions ─────────────────────────── */

interface StatCol {
  key: string;
  label: string;
  csvHeader: string;
  width: string;
}

const NFL_COLUMNS: StatCol[] = [
  { key: "targets", label: "Tgt", csvHeader: "Targets", width: "w-14" },
  { key: "receivingYards", label: "RecYd", csvHeader: "Receiving Yards", width: "w-16" },
  { key: "receivingTouchdowns", label: "RecTD", csvHeader: "Receiving Touchdowns", width: "w-16" },
  { key: "passingAttempts", label: "PaAtt", csvHeader: "Passing Attempts", width: "w-16" },
  { key: "completions", label: "Cmp", csvHeader: "Completions", width: "w-14" },
  { key: "passingYards", label: "PaYd", csvHeader: "Passing Yards", width: "w-16" },
  { key: "passingTouchdowns", label: "PaTD", csvHeader: "Passing Touchdowns", width: "w-16" },
  { key: "rushingAttempts", label: "RuAtt", csvHeader: "Rushing Attempts", width: "w-16" },
  { key: "rushingYards", label: "RuYd", csvHeader: "Rushing Yards", width: "w-16" },
  { key: "rushingTouchdowns", label: "RuTD", csvHeader: "Rushing Touchdowns", width: "w-16" },
];

const NBA_COLUMNS: StatCol[] = [
  { key: "minutes", label: "MIN", csvHeader: "Minutes", width: "w-14" },
  { key: "points", label: "PTS", csvHeader: "Points", width: "w-14" },
  { key: "rebounds", label: "REB", csvHeader: "Rebounds", width: "w-14" },
  { key: "assists", label: "AST", csvHeader: "Assists", width: "w-14" },
  { key: "steals", label: "STL", csvHeader: "Steals", width: "w-14" },
  { key: "blocks", label: "BLK", csvHeader: "Blocks", width: "w-14" },
  { key: "turnovers", label: "TO", csvHeader: "Turnovers", width: "w-14" },
  { key: "fgMade", label: "FGM", csvHeader: "FG Made", width: "w-14" },
  { key: "fgAttempted", label: "FGA", csvHeader: "FG Attempted", width: "w-14" },
  { key: "threeMade", label: "3PM", csvHeader: "3P Made", width: "w-14" },
  { key: "threeAttempted", label: "3PA", csvHeader: "3P Attempted", width: "w-14" },
  { key: "ftMade", label: "FTM", csvHeader: "FT Made", width: "w-14" },
  { key: "ftAttempted", label: "FTA", csvHeader: "FT Attempted", width: "w-14" },
];

const NHL_COLUMNS: StatCol[] = [
  { key: "goals", label: "G", csvHeader: "Goals", width: "w-14" },
  { key: "assists", label: "A", csvHeader: "Assists", width: "w-14" },
  { key: "points", label: "PTS", csvHeader: "Points", width: "w-14" },
  { key: "shots", label: "SOG", csvHeader: "Shots on Goal", width: "w-14" },
  { key: "plusMinus", label: "+/-", csvHeader: "Plus Minus", width: "w-14" },
  { key: "pim", label: "PIM", csvHeader: "Penalty Minutes", width: "w-14" },
  { key: "hits", label: "HIT", csvHeader: "Hits", width: "w-14" },
  { key: "blocks", label: "BLK", csvHeader: "Blocked Shots", width: "w-14" },
  { key: "toi", label: "TOI", csvHeader: "Time on Ice", width: "w-16" },
];

const MLB_COLUMNS: StatCol[] = [
  { key: "atBats", label: "AB", csvHeader: "At Bats", width: "w-14" },
  { key: "hits", label: "H", csvHeader: "Hits", width: "w-14" },
  { key: "runs", label: "R", csvHeader: "Runs", width: "w-14" },
  { key: "rbi", label: "RBI", csvHeader: "RBI", width: "w-14" },
  { key: "homeRuns", label: "HR", csvHeader: "Home Runs", width: "w-14" },
  { key: "stolenBases", label: "SB", csvHeader: "Stolen Bases", width: "w-14" },
  { key: "walks", label: "BB", csvHeader: "Walks", width: "w-14" },
  { key: "strikeouts", label: "K", csvHeader: "Strikeouts", width: "w-14" },
  { key: "inningsPitched", label: "IP", csvHeader: "Innings Pitched", width: "w-14" },
  { key: "earnedRuns", label: "ER", csvHeader: "Earned Runs", width: "w-14" },
];

function getLeagueColumns(league: string): StatCol[] {
  switch (league) {
    case "NFL": return NFL_COLUMNS;
    case "NBA": return NBA_COLUMNS;
    case "NHL": return NHL_COLUMNS;
    case "MLB": return MLB_COLUMNS;
    default: return NBA_COLUMNS;
  }
}

/* ── Dynamic row type using Record ──────────────────────────────────── */

interface StatRow {
  id: string;
  name: string;
  team: string;
  datetime: string;
  homeTeam: string;
  awayTeam: string;
  period: string;
  [key: string]: string; // dynamic stat fields
}

const PERIOD_OPTIONS = [
  { value: "full", label: "Full Game" },
  { value: "1H", label: "1st Half" },
  { value: "2H", label: "2nd Half" },
  { value: "Q1", label: "Q1" },
  { value: "Q2", label: "Q2" },
  { value: "Q3", label: "Q3" },
  { value: "Q4", label: "Q4" },
  { value: "OT", label: "OT" },
];

function getPeriodOptions(league: string) {
  switch (league) {
    case "NHL":
      return [
        { value: "full", label: "Full Game" },
        { value: "P1", label: "1st Period" },
        { value: "P2", label: "2nd Period" },
        { value: "P3", label: "3rd Period" },
        { value: "OT", label: "OT" },
      ];
    case "MLB":
      return [
        { value: "full", label: "Full Game" },
        { value: "1-3", label: "Inn 1–3" },
        { value: "4-6", label: "Inn 4–6" },
        { value: "7-9", label: "Inn 7–9" },
        { value: "extra", label: "Extra" },
      ];
    default:
      return PERIOD_OPTIONS;
  }
}

const emptyRow = (): StatRow => ({
  id: crypto.randomUUID(),
  name: "", team: "", datetime: "", homeTeam: "", awayTeam: "", period: "full",
});

interface ManualStatsEntryProps {
  league: string;
  onLog: (msg: string) => void;
}

// ── Player Name Autocomplete ──────────────────────────────────────────
function PlayerAutocomplete({
  value,
  players,
  onChange,
  onSelectPlayer,
}: {
  value: string;
  players: PlayerRecord[];
  onChange: (v: string) => void;
  onSelectPlayer: (p: PlayerRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.length >= 2
    ? players.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 15)
    : [];

  return (
    <div ref={ref} className="relative">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(e.target.value.length >= 2);
        }}
        onFocus={() => { if (query.length >= 2) setOpen(true); }}
        placeholder="Player name"
        className="h-7 text-xs border-0 bg-transparent px-1"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 w-64 max-h-48 overflow-y-auto bg-popover border border-border rounded-md shadow-lg mt-0.5">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground flex justify-between"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelectPlayer(p);
                setQuery(p.name);
                setOpen(false);
              }}
            >
              <span className="font-medium">{p.name}</span>
              {p.team && <span className="text-muted-foreground">{p.team}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ManualStatsEntry({ league, onLog }: ManualStatsEntryProps) {
  const [rows, setRows] = useState<StatRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [teams, setTeams] = useState<string[]>([]);

  const [sharedDate, setSharedDate] = useState("");
  const [sharedHome, setSharedHome] = useState("");
  const [sharedAway, setSharedAway] = useState("");
  const [sharedPeriod, setSharedPeriod] = useState("full");

  const periodOptions = getPeriodOptions(league);

  const statColumns = getLeagueColumns(league);

  // Reset rows when league changes (clear old stat fields)
  useEffect(() => {
    setRows([emptyRow(), emptyRow(), emptyRow()]);
    setSharedHome("");
    setSharedAway("");
  }, [league]);

  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  const fetchPlayersAndTeams = useCallback(async () => {
    let allPlayers: PlayerRecord[] = [];
    let offset = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await supabase
        .from("players")
        .select("id, name, team")
        .eq("league", league)
        .order("name")
        .range(offset, offset + PAGE - 1);
      if (!data || data.length === 0) break;
      allPlayers = allPlayers.concat(data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    setPlayers(allPlayers);

    const uniqueTeams = [...new Set(allPlayers.map((p) => p.team).filter(Boolean))] as string[];
    uniqueTeams.sort();
    setTeams(uniqueTeams);

    onLogRef.current(`📋 Loaded ${allPlayers.length} players and ${uniqueTeams.length} teams for ${league}`);
  }, [league]);

  useEffect(() => {
    fetchPlayersAndTeams();
  }, [fetchPlayersAndTeams]);

  const updateRow = (id: string, field: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleSelectPlayer = (rowId: string, player: PlayerRecord) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, name: player.name, team: player.team || r.team } : r
      )
    );
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { ...emptyRow(), datetime: sharedDate, homeTeam: sharedHome, awayTeam: sharedAway, period: sharedPeriod },
    ]);
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setSubmitting(true);
    onLog(`📂 Uploading ${file.name} to period stats importer...`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("league", league);
      formData.append("season", "2025");

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-period-stats-csv`,
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
        onLog(`❌ ${result.error || "Upload failed"}`);
      } else {
        onLog(`✅ ${result.rows_parsed} rows → ${result.stats_inserted} inserted, ${result.players_created} players created, ${result.skipped} skipped`);
        if (result.errors?.length) result.errors.slice(0, 5).forEach((err: string) => onLog(`  ⚠️ ${err}`));
      }
    } catch (err: any) {
      onLog(`❌ ${err.message}`);
    }
    setSubmitting(false);
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleSubmit = async () => {
    const validRows = rows.filter((r) => r.name.trim());
    if (validRows.length === 0) {
      onLog("No rows with a player name to submit");
      return;
    }

    setSubmitting(true);
    onLog(`Submitting ${validRows.length} ${league} player stats rows...`);

    try {
      const headerParts = ["Name", "Team", "Date and Time (PST)", "HomeTeam", "AwayTeam", "Period", ...statColumns.map((c) => c.csvHeader)];
      const header = headerParts.join(",");

      const csvLines = validRows.map((r) => {
        const statValues = statColumns.map((c) => r[c.key] || "");
        return [
          r.name, r.team, r.datetime || sharedDate, r.homeTeam || sharedHome, r.awayTeam || sharedAway,
          r.period || sharedPeriod,
          ...statValues,
        ].join(",");
      });
      const csvText = [header, ...csvLines].join("\n");

      const blob = new Blob([csvText], { type: "text/csv" });
      const file = new File([blob], "manual-entry.csv", { type: "text/csv" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("league", league);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-player-gamelog-csv`,
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
        onLog(`❌ ${result.error || "Submit failed"}`);
      } else {
        onLog(`✅ ${result.rows_parsed} rows → ${result.stats_inserted} inserted, ${result.players_created} players created, ${result.games_not_found} unmatched`);
        if (result.errors?.length) result.errors.slice(0, 5).forEach((e: string) => onLog(`  ⚠️ ${e}`));
        setRows([emptyRow(), emptyRow(), emptyRow()]);
      }
    } catch (e: any) {
      onLog(`❌ ${e.message}`);
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-3">
      {/* Shared game context */}
      <div className="flex gap-2 items-end flex-wrap">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground font-medium">Game Date/Time (PST)</label>
          <Input
            value={sharedDate}
            onChange={(e) => setSharedDate(e.target.value)}
            placeholder="9/4/2025 5:20PM"
            className="h-8 text-xs w-44"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground font-medium">Period</label>
          <Select value={sharedPeriod} onValueChange={setSharedPeriod}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {periodOptions.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground font-medium">Home Team</label>
          <Select value={sharedHome} onValueChange={setSharedHome}>
            <SelectTrigger className="h-8 text-xs w-48"><SelectValue placeholder="Select home..." /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground font-medium">Away Team</label>
          <Select value={sharedAway} onValueChange={setSharedAway}>
            <SelectTrigger className="h-8 text-xs w-48"><SelectValue placeholder="Select away..." /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        💡 Showing <span className="font-semibold text-foreground">{league}</span> stat fields ({statColumns.length} columns). Type 2+ characters to search {players.length} players.
      </p>

      {/* Spreadsheet table */}
      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-44">Name</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-36">Team</th>
              <th className="px-1 py-1.5 text-center font-medium text-muted-foreground w-16">Period</th>
              {statColumns.map((c) => (
                <th key={c.key} className={`px-1 py-1.5 text-center font-medium text-muted-foreground ${c.width}`}>
                  {c.label}
                </th>
              ))}
              <th className="px-1 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                <td className="px-1 py-0.5">
                  <PlayerAutocomplete
                    value={row.name}
                    players={players}
                    onChange={(v) => updateRow(row.id, "name", v)}
                    onSelectPlayer={(p) => handleSelectPlayer(row.id, p)}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <Select value={row.team} onValueChange={(v) => updateRow(row.id, "team", v)}>
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent px-1">
                      <SelectValue placeholder="Team..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-1 py-0.5">
                  <Select value={row.period || sharedPeriod} onValueChange={(v) => updateRow(row.id, "period", v)}>
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent px-1 w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      {periodOptions.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                {statColumns.map((c) => (
                  <td key={c.key} className="px-0.5 py-0.5">
                    <Input
                      type="number"
                      value={row[c.key] || ""}
                      onChange={(e) => updateRow(row.id, c.key, e.target.value)}
                      className="h-7 text-xs text-center border-0 bg-transparent px-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                ))}
                <td className="px-0.5 py-0.5">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(row.id)}>
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={addRow} className="text-xs">
          <Plus className="h-3 w-3 mr-1" /> Add Row
        </Button>
        <Button variant="outline" size="sm" className="text-xs" asChild>
          <label className="cursor-pointer">
            <Upload className="h-3 w-3 mr-1" /> Upload CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          </label>
        </Button>
        <Button variant="default" size="sm" onClick={handleSubmit} disabled={submitting} className="text-xs">
          <Send className="h-3 w-3 mr-1" /> {submitting ? "Submitting..." : `Submit ${rows.filter((r) => r.name.trim()).length} Rows`}
        </Button>
        <Button variant="ghost" size="sm" onClick={fetchPlayersAndTeams} className="text-xs text-muted-foreground">
          ↻ Refresh Players
        </Button>
      </div>
    </div>
  );
}
