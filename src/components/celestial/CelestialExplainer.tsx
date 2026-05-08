import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface CelestialExplainerProps {
  title: string;
  body: string;
  /** Optional extra detail shown below the body */
  detail?: string;
  /** Icon label on the trigger chip */
  label?: string;
  className?: string;
  /** Side the popover opens on (default "top") */
  side?: "top" | "bottom" | "left" | "right";
}

/**
 * Popover-based explainer for celestial terms and astrological concepts.
 *
 * Fully keyboard accessible:
 *  - Tab / Shift-Tab moves focus to/from the trigger
 *  - Enter / Space opens the popover
 *  - Escape closes the popover and returns focus to trigger  (Radix)
 *  - Focus is trapped inside popover content while open      (Radix)
 *  - aria-expanded and aria-haspopup are applied by Radix PopoverTrigger
 *  - popover content has role="dialog" and aria-label        (explicit)
 */
export function CelestialExplainer({
  title,
  body,
  detail,
  label,
  className,
  side = "top",
}: CelestialExplainerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Learn about ${title}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            "border border-[#c4b0e0]/50 bg-[#f3eef9]/60 text-[#6b4c9a]",
            "dark:border-[#6b4c9a]/40 dark:bg-[#2a1a45]/50 dark:text-[#c4a8f0]",
            "hover:bg-[#e8dff5] dark:hover:bg-[#3a2560]/60 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            className,
          )}
        >
          <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
          {label ?? title}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side={side}
        sideOffset={6}
        align="start"
        role="dialog"
        aria-label={title}
        className={cn(
          "w-72 rounded-2xl border border-[#c4b0e0]/50 p-0 shadow-xl",
          "bg-[#f9f5ff] dark:bg-[#1e1433]",
          "dark:border-[#6b4c9a]/40",
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles
              className="h-4 w-4 text-[#a78bda] dark:text-[#c4a8f0]"
              aria-hidden="true"
            />
            <span className="text-sm font-bold text-[#6b4c9a] dark:text-[#c4a8f0]">
              {title}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pb-4 space-y-2">
          <p className="text-xs text-foreground/80 leading-relaxed">{body}</p>
          {detail && (
            <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border/40 pt-2">
              {detail}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
