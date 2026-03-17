import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, Layers, Brain, Telescope, Info } from "lucide-react";
import MarkdownBody from "./MarkdownBody";

const FALLBACK_ABOUT = [
  {
    title: "What is CosmicEdge?",
    icon: Sparkles,
    summary: "CosmicEdge is an AI-powered sports intelligence platform that combines quantitative projection models, real-time momentum analysis, and optional celestial overlays to help you evaluate betting opportunities with greater clarity.",
  },
  {
    title: "Layered Intelligence",
    icon: Layers,
    summary: "Every prop evaluation passes through multiple layers: base projection (season/L10/L5 weighted mean), environment adjustment (pace, matchup, venue), risk assessment (volatility, minutes, fouls), simulation (Monte Carlo P10-P90), and Astra AI synthesis.",
  },
  {
    title: "AI Decision Engine",
    icon: Brain,
    summary: "Astra AI synthesizes all signals into actionable verdicts. Ask natural-language questions like 'Should I take Brunson Over 24.5 points?' and get structured analysis with confidence grades, edge scores, and risk factors.",
  },
  {
    title: "Celestial Overlay",
    icon: Telescope,
    summary: "Optional planetary transit analysis adds a supplementary signal layer. TransitLift modifiers are clearly labeled and never override quantitative data — they're a tiebreaker, not a driver.",
  },
];

export default function AstraAboutTab() {
  const { data: pages, isLoading } = useQuery({
    queryKey: ["ce-info-pages", "info"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ce_info_pages")
        .select("*")
        .eq("page_type", "info")
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

  const icons = [Sparkles, Layers, Brain, Telescope];
  const hasDbContent = pages && pages.length > 0;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="cosmic-card rounded-xl p-5 text-center space-y-2">
        <Sparkles className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-base font-bold text-foreground">CosmicEdge Intelligence</h2>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
          A layered sports intelligence system combining projection logic, momentum, streaks,
          contextual modifiers, astro overlays, and simulation-based reasoning.
        </p>
      </div>

      {/* Helper note */}
      <div className="flex items-start gap-2 px-1">
        <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Find this under <strong className="text-foreground/80">Astra AI → About CosmicEdge</strong> tab. 
          For detailed formulas, see <strong className="text-foreground/80">Celestial Engines</strong>. 
          For step-by-step methodology, see <strong className="text-foreground/80">Behind the Stars</strong>.
        </p>
      </div>

      {hasDbContent ? (
        <div className="space-y-3">
          {pages.map((page, i) => {
            const Icon = icons[i % icons.length];
            return (
              <div key={page.id} className="cosmic-card rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <h3 className="text-sm font-semibold text-foreground">{page.title}</h3>
                </div>
                {page.summary && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{page.summary}</p>
                )}
                {page.content_md && <MarkdownBody md={page.content_md} />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {FALLBACK_ABOUT.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="cosmic-card rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.summary}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
