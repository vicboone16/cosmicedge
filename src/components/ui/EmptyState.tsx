import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  reason?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Teaching empty state — explains why empty, what to expect, and what to do next */
export function EmptyState({ icon: Icon, title, description, reason, action, className }: EmptyStateProps) {
  return (
    <div className={cn("text-center py-12 px-4", className)}>
      <Icon className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
      <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xs mx-auto">{description}</p>
      {reason && (
        <p className="text-[10px] text-muted-foreground/70 mt-2 italic max-w-xs mx-auto">{reason}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
