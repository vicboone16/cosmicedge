import { cn } from "@/lib/utils";
import { Lightbulb, X } from "lucide-react";
import { useState } from "react";

interface GuidanceCardProps {
  title: string;
  children: React.ReactNode;
  dismissKey?: string;
  icon?: React.ReactNode;
  className?: string;
  variant?: "default" | "tip" | "onboarding";
}

/** Dismissible guidance/onboarding card with local storage persistence */
export function GuidanceCard({ title, children, dismissKey, icon, className, variant = "default" }: GuidanceCardProps) {
  const storageKey = dismissKey ? `ce_dismissed_${dismissKey}` : null;
  const [dismissed, setDismissed] = useState(() => storageKey ? localStorage.getItem(storageKey) === "1" : false);

  if (dismissed) return null;

  const handleDismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setDismissed(true);
  };

  return (
    <div className={cn(
      "rounded-xl p-3.5 space-y-1.5 border",
      variant === "tip" && "bg-primary/5 border-primary/20",
      variant === "onboarding" && "bg-cosmic-cyan/5 border-cosmic-cyan/20",
      variant === "default" && "bg-secondary/30 border-border/50",
      className,
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon || <Lightbulb className={cn("h-3.5 w-3.5 shrink-0", variant === "tip" ? "text-primary" : "text-cosmic-cyan")} />}
          <p className="text-xs font-semibold text-foreground">{title}</p>
        </div>
        {dismissKey && (
          <button
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground p-0.5 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}
