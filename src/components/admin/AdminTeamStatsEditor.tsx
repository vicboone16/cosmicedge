import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Save, RefreshCw, Loader2, Search } from "lucide-react";

interface TeamPaceRow {
  team_abbr: string;
  season: number;
  league: string;
  games_played: number | null;
  avg_pace: number | null;
  avg_points: number | null;
  avg_points_allowed: number | null;
  off_rating: number | null;
  def_rating: number | null;
  net_rating: number | null;
  ts_pct: number | null;
  efg_pct: number | null;
  off_efg_pct: number | null;
  def_efg_pct: number | null;
  tov_pct: number | null;
  off_tov_pct: number | null;
  def_tov_pct: number | null;
  updated_at: string | null;
}

const FIELDS: { key: keyof TeamPaceRow; label: string; step: string }[] = [
  { key: "games_played", label: "GP", step: "1" },
  { key: "avg_points", label: "PPG", step: "0.1" },
  { key: "avg_points_allowed", label: "OPP PPG", step: "0.1" },
  { key: "off_rating", label: "ORTG", step: "0.1" },
  { key: "def_rating", label: "DRTG", step: "0.1" },
  { key: "net_rating", label: "NET", step: "0.1" },
  { key: "avg_pace", label: "PACE", step: "0.1" },
  { key: "ts_pct", label: "TS%", step: "0.001" },
  { key: "efg_pct", label: "eFG%", step: "0.001" },
  { key: "off_efg_pct", label: "OFG%", step: "0.001" },
  { key: "def_efg_pct", label: "DFG%", step: "0.001" },
  { key: "tov_pct", label: "TOV%", step: "0.1" },
  { key: "off_tov_pct", label: "OTOV%", step: "0.1" },
  { key: "def_tov_pct", label: "DTOV%", step: "0.1" },
];

export default function AdminTeamStatsEditor() {
  const [rows, setRows] = useState<TeamPaceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [league] = useState("NBA");
  const [season] = useState(2025);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("team_season_pace")
      .select("*")
      .eq("league", league)
      .eq("season", season)
      .order("team_abbr");
    if (error) {
      toast({ title: "Error loading", description: error.message, variant: "destructive" });
    } else {
      setRows((data as TeamPaceRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [league, season]);

  const updateField = (abbr: string, field: keyof TeamPaceRow, value: string) => {
    setRows(prev =>
      prev.map(r =>
        r.team_abbr === abbr
          ? { ...r, [field]: value === "" ? null : Number(value) }
          : r
      )
    );
  };

  const saveRow = async (row: TeamPaceRow) => {
    setSaving(row.team_abbr);
    const { error } = await supabase
      .from("team_season_pace")
      .upsert({
        team_abbr: row.team_abbr,
        season: row.season,
        league: row.league,
        games_played: row.games_played,
        avg_pace: row.avg_pace,
        avg_points: row.avg_points,
        avg_points_allowed: row.avg_points_allowed,
        avg_possessions: row.avg_pace, // keep in sync
        off_rating: row.off_rating,
        def_rating: row.def_rating,
        net_rating: row.net_rating,
        ts_pct: row.ts_pct,
        efg_pct: row.efg_pct,
        off_efg_pct: row.off_efg_pct,
        def_efg_pct: row.def_efg_pct,
        tov_pct: row.tov_pct,
        off_tov_pct: row.off_tov_pct,
        def_tov_pct: row.def_tov_pct,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "team_abbr,season,league" });

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${row.team_abbr} saved` });
    }
    setSaving(null);
  };

  const addTeam = async () => {
    const abbr = search.toUpperCase().trim();
    if (!abbr || abbr.length < 2 || abbr.length > 4) return;
    if (rows.find(r => r.team_abbr === abbr)) {
      toast({ title: "Already exists" });
      return;
    }
    const newRow: TeamPaceRow = {
      team_abbr: abbr, season, league,
      games_played: 0, avg_pace: 100, avg_points: 110,
      avg_points_allowed: 110, off_rating: 110, def_rating: 110,
      net_rating: 0, ts_pct: null, efg_pct: null, off_efg_pct: null, def_efg_pct: null, tov_pct: null, off_tov_pct: null, def_tov_pct: null,
      updated_at: null,
    };
    setRows(prev => [...prev, newRow].sort((a, b) => a.team_abbr.localeCompare(b.team_abbr)));
  };

  const filtered = rows.filter(r =>
    r.team_abbr.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-foreground">Team Stats & Ratings</h2>
          <Badge variant="outline" className="text-[9px]">{league} {season}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7 text-[10px] gap-1">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Reload
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Filter or add team (e.g. BOS)..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 pl-8 text-xs"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Header */}
           <div className="grid grid-cols-[60px_repeat(14,1fr)_40px] gap-1 text-[9px] text-muted-foreground font-semibold uppercase px-1">
            <div>Team</div>
            {FIELDS.map(f => <div key={f.key} className="text-center">{f.label}</div>)}
            <div></div>
          </div>

          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {filtered.map(row => (
              <div
                key={row.team_abbr}
                className="grid grid-cols-[60px_repeat(14,1fr)_40px] gap-1 items-center p-1 rounded border border-border bg-card"
              >
                <span className="text-xs font-bold text-foreground">{row.team_abbr}</span>
                {FIELDS.map(f => (
                  <Input
                    key={f.key}
                    type="number"
                    step={f.step}
                    value={row[f.key] ?? ""}
                    onChange={e => updateField(row.team_abbr, f.key, e.target.value)}
                    className="h-7 text-[11px] text-center px-1 tabular-nums"
                  />
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => saveRow(row)}
                  disabled={saving === row.team_abbr}
                >
                  {saving === row.team_abbr ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>

          {search && !filtered.length && (
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={addTeam}>
              Add "{search.toUpperCase()}" as new team
            </Button>
          )}

          {/* Save All button */}
          <Button
            onClick={async () => {
              for (const row of filtered) {
                await saveRow(row);
              }
              toast({ title: "All teams saved" });
            }}
            className="w-full gap-2"
            disabled={!!saving}
          >
            <Save className="h-4 w-4" /> Save All {filtered.length} Teams
          </Button>
        </>
      )}
    </div>
  );
}
