import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { usePropLast10 } from "@/hooks/use-prop-last10";

interface Props {
  playerId: string | null;
  propType: string | null;
  line: number | null;
}

export function PropLast10Splits({ playerId, propType, line }: Props) {
  const { rows, hits, total, avg, loading } = usePropLast10(playerId, propType, line);

  if (loading) return <Skeleton className="h-32 rounded-xl" />;
  if (rows.length === 0) return <p className="text-xs text-muted-foreground py-2">No recent games found.</p>;

  return (
    <div className="space-y-2">
      {/* Summary row */}
      <div className="flex items-center gap-3 text-xs">
        <span className="font-semibold text-foreground">L10: {hits}/{total}</span>
        {avg != null && <span className="text-muted-foreground">Avg {avg}</span>}
        {line != null && <span className="text-muted-foreground">Line {line}</span>}
      </div>

      {/* Hit-rate bar */}
      <div className="h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", hits / Math.max(total, 1) >= 0.6 ? "bg-emerald-500" : "bg-rose-500")}
          style={{ width: total > 0 ? `${(hits / total) * 100}%` : "0%" }}
        />
      </div>

      {/* Game rows */}
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.game_id} className="flex items-center py-1.5 gap-2 text-xs">
            <span className="text-muted-foreground w-12 shrink-0">
              {new Date(r.game_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
            <span className="text-muted-foreground w-14 shrink-0">
              {r.is_home ? "vs " : "@ "}{r.opponent ?? "—"}
            </span>
            <span className="flex-1 font-semibold tabular-nums text-center">{r.stat ?? "—"}</span>
            <span className={cn("w-6 text-center font-bold", r.hit == null ? "text-muted-foreground" : r.hit ? "text-emerald-500" : "text-rose-500")}>
              {r.hit == null ? "—" : r.hit ? "✓" : "✗"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
