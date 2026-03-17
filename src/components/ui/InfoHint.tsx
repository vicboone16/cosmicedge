import { Info, HelpCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface InfoHintProps {
  text: string;
  className?: string;
  variant?: "inline" | "icon";
  size?: "xs" | "sm";
}

/** Reusable hover-info icon or inline hint text */
export function InfoHint({ text, className, variant = "icon", size = "xs" }: InfoHintProps) {
  if (variant === "inline") {
    return (
      <span className={cn("text-muted-foreground italic", size === "xs" ? "text-[10px]" : "text-xs", className)}>
        {text}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={cn("inline-flex items-center text-muted-foreground hover:text-foreground transition-colors", className)}>
          <Info className={cn(size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5")} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
