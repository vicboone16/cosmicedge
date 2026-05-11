import { cn } from "@/lib/utils";
import { freshnessLabel, freshnessColor, type WatchdogRow } from "@/hooks/use-pbp-watchdog";

interface Props {
  row: WatchdogRow | undefined;
  className?: string;
}

function fmtAge(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s ago`;
  return `${Math.floor(sec / 60)}m ago`;
}

export function PbpFreshnessBadge({ row, className }: Props) {
  const status = row?.status ?? "no_data";
  const label = freshnessLabel(status);
  const dot = freshnessColor(status);

  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border border-border bg-background/60", className)}
      title={row ? `Last event: ${fmtAge(row.ageSec)} · WP: ${fmtAge(row.wpAgeSec)}` : "No PBP data"}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
