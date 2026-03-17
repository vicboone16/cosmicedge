import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, BookOpen, Compass, Info } from "lucide-react";
import MarkdownBody from "./MarkdownBody";

const FALLBACK_METHODOLOGY = [
  {
    title: "1. Data Collection",
    summary: "Player stats (season averages, L10, L5), game context (pace, venue), injuries, and depth charts are fetched from multiple sources and normalized into the CosmicEdge pipeline.",
  },
  {
    title: "2. Projection Engine",
    summary: "A weighted blend of recent performance (μ = w₁·Season + w₂·L10 + w₃·L5) produces a projected mean for each stat. Pace, matchup quality, and environment factors adjust the baseline.",
  },
  {
    title: "3. Edge Calculation",
    summary: "Edge = μ - Line. The raw delta is normalized using standard deviation (σ) to produce a z-score, then transformed via logistic function into a probability estimate.",
  },
  {
    title: "4. Probability & Hit Rate",
    summary: "P(over) = 1/(1+e^(-k·z)) where k=1.5 is the calibration constant. Historical hit rates from L10 and streak data provide a secondary confidence check.",
  },
  {
    title: "5. Risk Assessment",
    summary: "Volatility (σ), minutes security, foul risk, blowout risk, and trap detection combine into a composite risk grade (A through D).",
  },
  {
    title: "6. Simulation",
    summary: "Monte Carlo simulation (1000+ iterations) models the full distribution of outcomes, producing P10/P50/P90 ranges for each prop.",
  },
  {
    title: "7. Cosmic Overlay (Optional)",
    summary: "Planetary transits and celestial alignments provide an overlay modifier (TransitLift). This is a supplementary signal, not a primary driver.",
  },
  {
    title: "8. Astra Decision Engine",
    summary: "All signals are synthesized into a final verdict: Strong Yes / Lean / Pass / Avoid. The engine considers your active mode (Aggressive, Selective, etc.) to personalize recommendations.",
  },
];

export default function AstraMethodologyTab() {
  const { data: pages, isLoading } = useQuery({
    queryKey: ["ce-info-pages", "methodology"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ce_info_pages")
        .select("*")
        .eq("page_type", "methodology")
        .eq("is_published", true)
        .order("display_order");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasDbContent = pages && pages.length > 0;

  return (
    <div className="space-y-4">
      <div className="cosmic-card rounded-xl p-5 text-center space-y-2">
        <Compass className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-base font-bold text-foreground">Behind the Stars</h2>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
          Step-by-step explanation of how CosmicEdge evaluates props, builds projections,
          runs simulations, and identifies edges.
        </p>
      </div>

      {/* Helper note */}
      <div className="flex items-start gap-2 px-1">
        <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Find this under <strong className="text-foreground/80">Astra AI → Behind the Stars</strong> tab. 
          For formula details, switch to the <strong className="text-foreground/80">Celestial Engines</strong> tab.
          For technical variable reference, admins can use <strong className="text-foreground/80">Machina → Reference</strong>.
        </p>
      </div>

      {hasDbContent ? (
        <div className="space-y-3">
          {pages.map((page, i) => (
            <div key={page.id} className="cosmic-card rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">{page.title}</h3>
              </div>
              {page.summary && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">{page.summary}</p>
              )}
              {page.content_md && <MarkdownBody md={page.content_md} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {FALLBACK_METHODOLOGY.map((step) => (
            <div key={step.title} className="cosmic-card rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.summary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
