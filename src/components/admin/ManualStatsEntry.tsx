import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Send } from "lucide-react";

interface PlayerRecord {
  id: string;
  name: string;
  team: string | null;
}

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
  name: "", team: "", datetime: "", homeTeam: "", awayTeam: "",
  targets: "", receivingYards: "", receivingTouchdowns: "",
  passingAttempts: "", completions: "", passingYards: "", passingTouchdowns: "",
  rushingAttempts: "", rushingYards: "", rushingTouchdowns: "",
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

  // Close on outside click
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

  // Fetch players & teams for the selected league
  const fetchPlayersAndTeams = useCallback(async () => {
    // Fetch players (paginate past 1000 limit)
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

    // Extract unique teams
    const uniqueTeams = [...new Set(allPlayers.map((p) => p.team).filter(Boolean))] as string[];
    uniqueTeams.sort();
    setTeams(uniqueTeams);

    onLog(`📋 Loaded ${allPlayers.length} players and ${uniqueTeams.length} teams for ${league}`);
  }, [league, onLog]);

  useEffect(() => {
    fetchPlayersAndTeams();
  }, [fetchPlayersAndTeams]);

  const updateRow = (id: string, field: keyof StatRow, value: string) => {
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
        💡 Type 2+ characters to search {players.length} {league} players. Selecting a player auto-fills their team.
      </p>

      {/* Spreadsheet table */}
      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-44">Name</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-36">Team</th>
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
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(row.id)}>
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
