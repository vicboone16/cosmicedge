import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, BookOpen, Compass } from "lucide-react";

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

      {pages && pages.length > 0 ? (
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
              {page.body_md && (
                <p className="text-xs text-foreground/80 leading-relaxed">{page.body_md}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-8">No methodology content available yet.</p>
      )}
    </div>
  );
}
