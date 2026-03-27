import { cn } from "@/lib/utils";
import { Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface GuidanceCardProps {
  title: string;
  children: React.ReactNode;
  dismissKey?: string;
  icon?: React.ReactNode;
  className?: string;
  variant?: "default" | "tip" | "onboarding";
}

/** Minimizable guidance/onboarding card with local storage persistence */
export function GuidanceCard({ title, children, dismissKey, icon, className, variant = "default" }: GuidanceCardProps) {
  const storageKey = dismissKey ? `ce_minimized_${dismissKey}` : null;
  const [minimized, setMinimized] = useState(() => storageKey ? localStorage.getItem(storageKey) === "1" : false);

  const handleToggle = () => {
    const next = !minimized;
    if (storageKey) localStorage.setItem(storageKey, next ? "1" : "0");
    setMinimized(next);
  };

  if (minimized) {
    return (
      <button
        onClick={handleToggle}
        className={cn(
          "w-full rounded-xl px-3 py-2 border flex items-center justify-between gap-2 transition-colors",
          variant === "tip" && "bg-primary/5 border-primary/20 hover:bg-primary/10",
          variant === "onboarding" && "bg-cosmic-cyan/5 border-cosmic-cyan/20 hover:bg-cosmic-cyan/10",
          variant === "default" && "bg-secondary/30 border-border/50 hover:bg-secondary/40",
          className,
        )}
      >
        <div className="flex items-center gap-2">
          {icon || <Lightbulb className={cn("h-3.5 w-3.5 shrink-0", variant === "tip" ? "text-primary" : "text-cosmic-cyan")} />}
          <p className="text-xs font-semibold text-foreground">{title}</p>
        </div>
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>
    );
  }

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
          <button onClick={handleToggle} className="text-muted-foreground hover:text-foreground p-0.5">
            <ChevronUp className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}
