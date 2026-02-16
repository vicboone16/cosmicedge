import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Plus, Save, Trash2 } from "lucide-react";

interface PeriodScore {
  quarter: number;
  home_score: string;
  away_score: string;
}

interface Props {
  gameId: string;
  league: string;
  homeAbbr: string;
  awayAbbr: string;
}

function getPeriodConfig(league: string) {
  switch (league) {
    case "NBA":
      return { label: "Quarter", labels: ["Q1", "Q2", "Q3", "Q4"], otLabel: "OT", count: 4 };
    case "NFL":
      return { label: "Quarter", labels: ["Q1", "Q2", "Q3", "Q4"], otLabel: "OT", count: 4 };
    case "NHL":
      return { label: "Period", labels: ["P1", "P2", "P3"], otLabel: "OT", count: 3 };
    case "MLB":
      return { label: "Inning", labels: Array.from({ length: 9 }, (_, i) => `${i + 1}`), otLabel: "Extra", count: 9 };
    default:
      return { label: "Period", labels: ["P1", "P2", "P3", "P4"], otLabel: "OT", count: 4 };
  }
}

export default function PeriodScoresEditor({ gameId, league, homeAbbr, awayAbbr }: Props) {
  const queryClient = useQueryClient();
  const config = getPeriodConfig(league);

  const [enabled, setEnabled] = useState(false);
  const [periods, setPeriods] = useState<PeriodScore[]>([]);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["game-quarters", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_quarters")
        .select("quarter, home_score, away_score")
        .eq("game_id", gameId)
        .order("quarter", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Initialize from existing data
  useEffect(() => {
    if (isLoading) return;
    if (existing && existing.length > 0) {
      setEnabled(true);
      setPeriods(
        existing.map((e) => ({
          quarter: e.quarter,
          home_score: e.home_score?.toString() ?? "",
          away_score: e.away_score?.toString() ?? "",
        }))
      );
    } else {
      // Pre-fill standard periods with empty values
      setPeriods(
        Array.from({ length: config.count }, (_, i) => ({
          quarter: i + 1,
          home_score: "",
          away_score: "",
        }))
      );
    }
  }, [existing, isLoading, config.count]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Delete existing then insert
      await supabase.from("game_quarters").delete().eq("game_id", gameId);

      const rows = periods
        .filter((p) => p.home_score !== "" || p.away_score !== "")
        .map((p) => ({
          game_id: gameId,
          quarter: p.quarter,
          home_score: p.home_score ? Number(p.home_score) : null,
          away_score: p.away_score ? Number(p.away_score) : null,
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from("game_quarters").insert(rows);
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["game-quarters", gameId] });
      toast({ title: `${count} period scores saved` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const getPeriodLabel = (q: number) => {
    if (q <= config.count) return config.labels[q - 1];
    const otNum = q - config.count;
    return league === "MLB"
      ? `${q}`
      : otNum === 1
        ? config.otLabel
        : `${config.otLabel}${otNum}`;
  };

  const addOT = () => {
    const nextQ = periods.length > 0 ? Math.max(...periods.map((p) => p.quarter)) + 1 : config.count + 1;
    setPeriods((prev) => [...prev, { quarter: nextQ, home_score: "", away_score: "" }]);
  };

  const removeOT = () => {
    if (periods.length > config.count) {
      setPeriods((prev) => prev.slice(0, -1));
    }
  };

  const updatePeriod = (idx: number, field: "home_score" | "away_score", val: string) => {
    setPeriods((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p)));
  };

  if (isLoading) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-foreground">
          {config.label} Scores
        </label>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[50px_1fr_1fr] gap-1 text-[10px] text-muted-foreground font-medium">
            <span></span>
            <span className="text-center">{awayAbbr}</span>
            <span className="text-center">{homeAbbr}</span>
          </div>

          {periods.map((p, i) => (
            <div key={p.quarter} className="grid grid-cols-[50px_1fr_1fr] gap-1 items-center">
              <Badge variant={p.quarter > config.count ? "destructive" : "secondary"} className="text-[10px] justify-center">
                {getPeriodLabel(p.quarter)}
              </Badge>
              <Input
                type="number"
                value={p.away_score}
                onChange={(e) => updatePeriod(i, "away_score", e.target.value)}
                className="h-7 text-xs text-center"
                placeholder="–"
              />
              <Input
                type="number"
                value={p.home_score}
                onChange={(e) => updatePeriod(i, "home_score", e.target.value)}
                className="h-7 text-xs text-center"
                placeholder="–"
              />
            </div>
          ))}

          {/* OT buttons + save */}
          <div className="flex items-center gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" className="text-[10px] h-6 gap-1" onClick={addOT}>
              <Plus className="h-3 w-3" />
              {league === "MLB" ? "Extra Inning" : "OT"}
            </Button>
            {periods.length > config.count && (
              <Button type="button" variant="ghost" size="sm" className="text-[10px] h-6 gap-1 text-destructive" onClick={removeOT}>
                <Trash2 className="h-3 w-3" /> Remove
              </Button>
            )}
            <div className="flex-1" />
            <Button
              type="button"
              size="sm"
              className="text-[10px] h-6 gap-1"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save className="h-3 w-3" /> Save Periods
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
