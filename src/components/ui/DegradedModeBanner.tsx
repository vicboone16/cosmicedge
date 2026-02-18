/**
 * DegradedModeBanner — shown when a provider is disabled or in fallback mode.
 * Used by any page that consumes live provider data.
 */

import { AlertTriangle } from "lucide-react";
import type { ProviderName } from "@/lib/provider-adapter";

const PROVIDER_LABELS: Record<ProviderName, string> = {
  odds:        "Live odds",
  stats:       "Player stats",
  injuries:    "Injury reports",
  news:        "Player news",
  astro:       "Astro calculations",
  supabase:    "Database",
  live_scores: "Live scores",
};

interface DegradedModeBannerProps {
  providers: ProviderName[];
  lastUpdated?: string | null;
}

export function DegradedModeBanner({ providers, lastUpdated }: DegradedModeBannerProps) {
  if (providers.length === 0) return null;

  const labels = providers.map((p) => PROVIDER_LABELS[p] ?? p).join(", ");

  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-foreground">
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
      <p className="text-xs">
        <span className="font-semibold">{labels}</span> temporarily unavailable. Showing last updated data.
        {lastUpdated && (
          <span className="text-muted-foreground ml-1">
            (as of {new Date(lastUpdated).toLocaleTimeString()})
          </span>
        )}
      </p>
    </div>
  );
}
