import { Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface InfoHintProps {
  text: string;
  ariaLabel?: string;
  className?: string;
  variant?: "inline" | "icon";
  size?: "xs" | "sm";
}

/** Reusable hover/focus-info icon or inline hint text.
 *  Trigger is fully keyboard accessible: Tab to focus, Escape closes tooltip. */
export function InfoHint({
  text,
  ariaLabel,
  className,
  variant = "icon",
  size = "xs",
}: InfoHintProps) {
  if (variant === "inline") {
    return (
      <span
        className={cn(
          "text-muted-foreground italic",
          size === "xs" ? "text-[10px]" : "text-xs",
          className,
        )}
      >
        {text}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? "More information"}
          className={cn(
            "inline-flex items-center text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm transition-colors",
            className,
          )}
        >
          <Info
            className={cn(size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5")}
            aria-hidden="true"
          />
        </button>
      </TooltipTrigger>
      {/* role="tooltip" is applied automatically by Radix; Escape closes it */}
      <TooltipContent
        side="top"
        className="max-w-[260px] text-xs leading-relaxed"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
