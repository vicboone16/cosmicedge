import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Send } from "lucide-react";

const NFL_TEAMS = [
  "Arizona Cardinals", "Atlanta Falcons", "Baltimore Ravens", "Buffalo Bills",
  "Carolina Panthers", "Chicago Bears", "Cincinnati Bengals", "Cleveland Browns",
  "Dallas Cowboys", "Denver Broncos", "Detroit Lions", "Green Bay Packers",
  "Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Kansas City Chiefs",
  "Las Vegas Raiders", "Los Angeles Chargers", "Los Angeles Rams", "Miami Dolphins",
  "Minnesota Vikings", "New England Patriots", "New Orleans Saints", "New York Giants",
  "New York Jets", "Philadelphia Eagles", "Pittsburgh Steelers", "San Francisco 49ers",
  "Seattle Seahawks", "Tampa Bay Buccaneers", "Tennessee Titans", "Washington Commanders",
];

interface StatRow {
  id: string;
  name: string;
  team: string;
  datetime: string;
  homeTeam: string;
  awayTeam: string;
  targets: string;
  receivingYards: string;
  receivingTouchdowns: string;
  passingAttempts: string;
  completions: string;
  passingYards: string;
  passingTouchdowns: string;
  rushingAttempts: string;
  rushingYards: string;
  rushingTouchdowns: string;
}

const emptyRow = (): StatRow => ({
  id: crypto.randomUUID(),
  name: "",
  team: "",
  datetime: "",
  homeTeam: "",
  awayTeam: "",
  targets: "",
  receivingYards: "",
  receivingTouchdowns: "",
  passingAttempts: "",
  completions: "",
  passingYards: "",
  passingTouchdowns: "",
  rushingAttempts: "",
  rushingYards: "",
  rushingTouchdowns: "",
});

const STAT_COLUMNS = [
  { key: "targets", label: "Tgt", width: "w-14" },
  { key: "receivingYards", label: "RecYd", width: "w-16" },
  { key: "receivingTouchdowns", label: "RecTD", width: "w-16" },
  { key: "passingAttempts", label: "PaAtt", width: "w-16" },
  { key: "completions", label: "Cmp", width: "w-14" },
  { key: "passingYards", label: "PaYd", width: "w-16" },
  { key: "passingTouchdowns", label: "PaTD", width: "w-16" },
  { key: "rushingAttempts", label: "RuAtt", width: "w-16" },
  { key: "rushingYards", label: "RuYd", width: "w-16" },
  { key: "rushingTouchdowns", label: "RuTD", width: "w-16" },
] as const;

interface ManualStatsEntryProps {
  league: string;
  onLog: (msg: string) => void;
}

export function ManualStatsEntry({ league, onLog }: ManualStatsEntryProps) {
  const [rows, setRows] = useState<StatRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  // Shared game context — auto-fill for new rows
  const [sharedDate, setSharedDate] = useState("");
  const [sharedHome, setSharedHome] = useState("");
  const [sharedAway, setSharedAway] = useState("");

  const updateRow = (id: string, field: keyof StatRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { ...emptyRow(), datetime: sharedDate, homeTeam: sharedHome, awayTeam: sharedAway },
    ]);
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
    onLog(`Submitting ${validRows.length} player stats rows...`);

    try {
      // Build CSV text from the rows
      const header = "Name,Team,Date and Time (PST),HomeTeam,AwayTeam,Targets,Receiving Yards,Receiving Touchdowns,Passing Attempts,Completions,Passing Yards,Passing Touchdowns,Rushing Attempts,Rushing Yards,Rushing Touchdowns";
      const csvLines = validRows.map((r) =>
        [
          r.name, r.team, r.datetime || sharedDate, r.homeTeam || sharedHome, r.awayTeam || sharedAway,
          r.targets, r.receivingYards, r.receivingTouchdowns,
          r.passingAttempts, r.completions, r.passingYards, r.passingTouchdowns,
          r.rushingAttempts, r.rushingYards, r.rushingTouchdowns,
        ].join(",")
      );
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
        // Clear rows on success
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
          <label className="text-[10px] text-muted-foreground font-medium">Home Team</label>
          <Select value={sharedHome} onValueChange={setSharedHome}>
            <SelectTrigger className="h-8 text-xs w-48"><SelectValue placeholder="Select home..." /></SelectTrigger>
            <SelectContent>
              {NFL_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground font-medium">Away Team</label>
          <Select value={sharedAway} onValueChange={setSharedAway}>
            <SelectTrigger className="h-8 text-xs w-48"><SelectValue placeholder="Select away..." /></SelectTrigger>
            <SelectContent>
              {NFL_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Spreadsheet table */}
      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-40">Name</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-44">Team</th>
              {STAT_COLUMNS.map((c) => (
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
                  <Input
                    value={row.name}
                    onChange={(e) => updateRow(row.id, "name", e.target.value)}
                    placeholder="Player name"
                    className="h-7 text-xs border-0 bg-transparent px-1"
                  />
                </td>
                <td className="px-1 py-0.5">
                  <Select value={row.team} onValueChange={(v) => updateRow(row.id, "team", v)}>
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent px-1">
                      <SelectValue placeholder="Team..." />
                    </SelectTrigger>
                    <SelectContent>
                      {NFL_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                {STAT_COLUMNS.map((c) => (
                  <td key={c.key} className="px-0.5 py-0.5">
                    <Input
                      type="number"
                      value={row[c.key as keyof StatRow]}
                      onChange={(e) => updateRow(row.id, c.key as keyof StatRow, e.target.value)}
                      className="h-7 text-xs text-center border-0 bg-transparent px-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                ))}
                <td className="px-0.5 py-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeRow(row.id)}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addRow} className="text-xs">
          <Plus className="h-3 w-3 mr-1" /> Add Row
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleSubmit}
          disabled={submitting}
          className="text-xs"
        >
          <Send className="h-3 w-3 mr-1" /> {submitting ? "Submitting..." : `Submit ${rows.filter((r) => r.name.trim()).length} Rows`}
        </Button>
      </div>
    </div>
  );
}
