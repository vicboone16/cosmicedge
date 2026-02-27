import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Save, RefreshCw, Loader2, Search, ChevronDown, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PERIODS = ["Q1", "Q2", "Q3", "Q4", "1H", "2H", "OT"] as const;

interface PeriodRow {
  team_abbr: string;
  season: number;
  league: string;
  period: string;
  avg_points: number | null;
  avg_points_allowed: number | null;
  avg_pace: number | null;
  avg_fg_pct: number | null;
  avg_three_pct: number | null;
  avg_ft_pct: number | null;
  games_played: number | null;
}

type TeamPeriodMap = Record<string, Record<string, PeriodRow>>;

const NBA_TEAMS = [
  "ATL","BOS","BKN","CHA","CHI","CLE","DAL","DEN","DET","GSW",
  "HOU","IND","LAC","LAL","MEM","MIA","MIL","MIN","NOP","NYK",
  "OKC","ORL","PHI","PHX","POR","SAC","SAS","TOR","UTA","WAS"
];

export default function AdminPeriodAveragesEditor() {
  const [data, setData] = useState<TeamPeriodMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [league] = useState("NBA");
  const [season] = useState(2025);

  const load = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from("team_period_averages")
      .select("*")
      .eq("league", league)
      .eq("season", season)
      .order("team_abbr");

    if (error) {
      toast({ title: "Error loading", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const map: TeamPeriodMap = {};
    for (const row of (rows || []) as PeriodRow[]) {
      if (!map[row.team_abbr]) map[row.team_abbr] = {};
      map[row.team_abbr][row.period] = row;
    }
    setData(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, [league, season]);

  const getRow = (team: string, period: string): PeriodRow => {
    return data[team]?.[period] || {
      team_abbr: team, season, league, period,
      avg_points: null, avg_points_allowed: null, avg_pace: null,
      avg_fg_pct: null, avg_three_pct: null, avg_ft_pct: null,
      games_played: null,
    };
  };

  const updateField = (team: string, period: string, field: keyof PeriodRow, value: string) => {
    setData(prev => {
      const next = { ...prev };
      if (!next[team]) next[team] = {};
      const row = { ...getRow(team, period) };
      (row as any)[field] = value === "" ? null : Number(value);
      next[team] = { ...next[team], [period]: row };
      return next;
    });
  };

  const saveTeam = async (team: string) => {
    setSaving(team);
    const rows: any[] = [];
    for (const period of PERIODS) {
      const row = getRow(team, period);
      if (row.avg_points != null || row.avg_points_allowed != null || row.games_played != null) {
        rows.push({
          team_abbr: team, season, league, period,
          avg_points: row.avg_points,
          avg_points_allowed: row.avg_points_allowed,
          avg_pace: row.avg_pace,
          avg_fg_pct: row.avg_fg_pct,
          avg_three_pct: row.avg_three_pct,
          avg_ft_pct: row.avg_ft_pct,
          games_played: row.games_played,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (rows.length === 0) {
      toast({ title: "No data to save for " + team });
      setSaving(null);
      return;
    }

    const { error } = await supabase
      .from("team_period_averages")
      .upsert(rows as any, { onConflict: "team_abbr,season,league,period" });

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${team} period averages saved (${rows.length} periods)` });
    }
    setSaving(null);
  };

  const toggleTeam = (team: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team); else next.add(team);
      return next;
    });
  };

  const teams = NBA_TEAMS.filter(t => t.toLowerCase().includes(search.toLowerCase()));

  const FIELDS: { key: keyof PeriodRow; label: string; step: string }[] = [
    { key: "games_played", label: "GP", step: "1" },
    { key: "avg_points", label: "PPG", step: "0.1" },
    { key: "avg_points_allowed", label: "OPP", step: "0.1" },
    { key: "avg_pace", label: "Pace", step: "0.1" },
    { key: "avg_fg_pct", label: "FG%", step: "0.001" },
    { key: "avg_three_pct", label: "3P%", step: "0.001" },
    { key: "avg_ft_pct", label: "FT%", step: "0.001" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-foreground">Period Averages (Q/H/OT)</h2>
          <Badge variant="outline" className="text-[9px]">{league} {season}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7 text-[10px] gap-1">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Reload
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Filter teams..."
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
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {teams.map(team => {
            const isExpanded = expandedTeams.has(team);
            const hasPeriodData = PERIODS.some(p => data[team]?.[p]?.avg_points != null);

            return (
              <div key={team} className="border border-border rounded bg-card">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-foreground hover:bg-muted/50"
                  onClick={() => toggleTeam(team)}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {team}
                    {hasPeriodData && <Badge variant="secondary" className="text-[8px] h-4">Has Data</Badge>}
                  </div>
                  <Button
                    variant="ghost" size="sm" className="h-6 text-[10px] gap-1"
                    onClick={e => { e.stopPropagation(); saveTeam(team); }}
                    disabled={saving === team}
                  >
                    {saving === team ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </Button>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-1">
                    {/* Header */}
                    <div className="grid grid-cols-[50px_repeat(7,1fr)] gap-1 text-[8px] text-muted-foreground font-semibold uppercase">
                      <div>Period</div>
                      {FIELDS.map(f => <div key={f.key} className="text-center">{f.label}</div>)}
                    </div>

                    {PERIODS.map(period => {
                      const row = getRow(team, period);
                      return (
                        <div key={period} className="grid grid-cols-[50px_repeat(7,1fr)] gap-1 items-center">
                          <span className="text-[10px] font-semibold text-muted-foreground">{period}</span>
                          {FIELDS.map(f => (
                            <Input
                              key={f.key}
                              type="number"
                              step={f.step}
                              value={row[f.key] ?? ""}
                              onChange={e => updateField(team, period, f.key, e.target.value)}
                              className="h-6 text-[10px] text-center px-1 tabular-nums"
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Button
        onClick={async () => {
          for (const team of teams) {
            await saveTeam(team);
          }
          toast({ title: "All teams saved" });
        }}
        className="w-full gap-2"
        disabled={!!saving}
      >
        <Save className="h-4 w-4" /> Save All Teams
      </Button>
    </div>
  );
}
