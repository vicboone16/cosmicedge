import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  hasBaseProps: boolean;
  hasOverlay: boolean;
  latestPredTs: string | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export function ModelStatusBanner({ hasBaseProps, hasOverlay, latestPredTs, isLoading, onRefresh }: Props) {
  let message: string;
  let variant: "waiting" | "pending" | "ready";

  if (!hasBaseProps) {
    message = "Waiting for lines";
    variant = "waiting";
  } else if (!hasOverlay) {
    message = "Lines found. Model run pending.";
    variant = "pending";
  } else {
    const ts = latestPredTs ? new Date(latestPredTs).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }) : "";
    message = `Model updated ${ts}`;
    variant = "ready";
  }

  return (
    <div className={cn(
      "cosmic-card rounded-xl p-3 flex items-center justify-between",
      variant === "waiting" && "border-l-2 border-l-muted-foreground",
      variant === "pending" && "border-l-2 border-l-accent",
      variant === "ready" && "border-l-2 border-l-primary",
    )}>
      <div className="flex items-center gap-2">
        <div className={cn(
          "h-2 w-2 rounded-full",
          variant === "waiting" && "bg-muted-foreground",
          variant === "pending" && "bg-accent animate-pulse",
          variant === "ready" && "bg-primary",
        )} />
        <span className="text-xs text-foreground font-medium">{message}</span>
      </div>
      <button
        onClick={onRefresh}
        disabled={isLoading}
        className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
      </button>
    </div>
  );
}
