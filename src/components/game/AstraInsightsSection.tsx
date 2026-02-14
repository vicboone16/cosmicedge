import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AstraStructuredResponse, { type CosmicEdgeResponse, type AstraResponse } from "@/components/astra/AstraStructuredResponse";

interface Props {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  venue: string | null;
  venueLat: number | null;
  venueLng: number | null;
  league: string;
}

export function AstraInsightsSection({
  gameId, homeAbbr, awayAbbr, homeTeam, awayTeam,
  startTime, venue, venueLat, venueLng, league,
}: Props) {
  const [requested, setRequested] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cosmic-edge-insights", gameId],
    queryFn: async () => {
      // Step 1: Fetch quant data
      let quantData = null;
      try {
        const { data: qd } = await supabase.functions.invoke("quant-engine", {
          body: { game_id: gameId },
        });
        if (qd?.success) quantData = qd;
      } catch (e) {
        console.warn("Quant engine unavailable, proceeding with astro only:", e);
      }

      // Step 2: Call astro-interpret with quant context
      const { data: result, error } = await supabase.functions.invoke("astro-interpret", {
        body: {
          mode: "freeform",
          delivery_mode: "chat",
          custom_prompt: `Provide a comprehensive astrological and statistical analysis for this ${league} game: ${awayTeam} (${awayAbbr}) at ${homeTeam} (${homeAbbr}). Game time: ${startTime}. Venue: ${venue || "Unknown"} (${venueLat?.toFixed(2)}°, ${venueLng?.toFixed(2)}°). Cover horary factors, astrocartography, planetary hours, and any relevant transit considerations. Integrate statistical models if available. Focus on betting implications: moneyline, spread, and totals.`,
          game_context: { home_team: homeAbbr, away_team: awayAbbr, date: startTime.slice(0, 10), venue },
          quant_data: quantData,
        },
      });
      if (error) throw error;
      return result;
    },
    enabled: requested,
    staleTime: 30 * 60 * 1000,
  });

  const cosmicEdge: CosmicEdgeResponse | null = data?.cosmic_edge || null;
  const legacyStructured: AstraResponse | null = data?.structured || null;

  if (!requested) {
    return (
      <section>
        <button
          onClick={() => setRequested(true)}
          className="w-full cosmic-card rounded-xl p-4 flex items-center justify-center gap-2 hover:border-primary/30 transition-colors"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Ask Astra for Game Analysis</span>
        </button>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="flex items-center justify-center py-8 gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Astra is reading the stars & crunching the numbers...</span>
      </section>
    );
  }

  if (cosmicEdge) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          CosmicEdge Analysis
        </h3>
        <AstraStructuredResponse data={cosmicEdge} compact />
      </section>
    );
  }

  if (legacyStructured) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Astra Game Analysis
        </h3>
        <AstraStructuredResponse data={legacyStructured} compact />
      </section>
    );
  }

  // Fallback
  const legacyText = data?.interpretation;
  if (legacyText) {
    return (
      <section className="cosmic-card rounded-xl p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <h4 className="text-[10px] font-bold text-primary uppercase tracking-wider">Astra Analysis</h4>
        </div>
        <p className="text-[11px] text-foreground/90 leading-relaxed">{legacyText}</p>
      </section>
    );
  }

  return (
    <section className="text-center py-4">
      <p className="text-xs text-muted-foreground">Unable to generate analysis. Try again later.</p>
      <button onClick={() => setRequested(false)} className="text-xs text-primary mt-2 hover:underline">
        Retry
      </button>
    </section>
  );
}
