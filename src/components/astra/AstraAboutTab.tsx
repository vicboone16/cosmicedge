import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, Layers, Brain, Telescope } from "lucide-react";

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

      {/* Info pages */}
      {pages && pages.length > 0 ? (
        <div className="space-y-3">
          {pages.map((page, i) => {
            const Icon = icons[i % icons.length];
            return (
              <div key={page.id} className="cosmic-card rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                  <h3 className="text-sm font-semibold text-foreground">{page.title}</h3>
                </div>
                {page.summary && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{page.summary}</p>
                )}
              {page.body_md && (
                <div className="text-xs text-foreground/80 leading-relaxed space-y-2">
                  {page.body_md.split('\n\n').map((para: string, pi: number) => (
                    <p key={pi}>{para}</p>
                  ))}
                </div>
              )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-8">No content available yet.</p>
      )}
    </div>
  );
}
