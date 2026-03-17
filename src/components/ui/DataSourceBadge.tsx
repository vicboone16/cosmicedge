import { cn } from "@/lib/utils";
import { Database, Cpu, Zap, BookOpen, Shield, Activity } from "lucide-react";

type SourceType = "provider" | "model" | "runtime" | "reference" | "admin" | "live";

const SOURCE_CONFIG: Record<SourceType, { label: string; icon: typeof Database; className: string }> = {
  provider:  { label: "Provider Data",      icon: Database, className: "bg-cosmic-cyan/10 text-cosmic-cyan border-cosmic-cyan/20" },
  model:     { label: "Model Output",       icon: Cpu,      className: "bg-primary/10 text-primary border-primary/20" },
  runtime:   { label: "Runtime Prediction", icon: Zap,      className: "bg-cosmic-green/10 text-cosmic-green border-cosmic-green/20" },
  reference: { label: "Reference Only",     icon: BookOpen, className: "bg-muted text-muted-foreground border-border" },
  admin:     { label: "Admin Only",         icon: Shield,   className: "bg-cosmic-gold/10 text-cosmic-gold border-cosmic-gold/20" },
  live:      { label: "Live Signal",        icon: Activity, className: "bg-cosmic-red/10 text-cosmic-red border-cosmic-red/20" },
};

interface DataSourceBadgeProps {
  source: SourceType;
  compact?: boolean;
  className?: string;
}

/** Badge distinguishing provider data, model output, runtime prediction, docs, admin, and live signals */
export function DataSourceBadge({ source, compact = false, className }: DataSourceBadgeProps) {
  const config = SOURCE_CONFIG[source];
  const Icon = config.icon;

  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border font-semibold",
      compact ? "text-[7px] px-1.5 py-0 h-4" : "text-[9px] px-2 py-0.5",
      config.className,
      className,
    )}>
      <Icon className={cn(compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
      {config.label}
    </span>
  );
}
