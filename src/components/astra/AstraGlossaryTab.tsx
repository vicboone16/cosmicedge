import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "model", label: "Model" },
  { key: "astro", label: "Astro" },
  { key: "basketball-stat", label: "Stats" },
];

export default function AstraGlossaryTab() {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");

  const { data: glossary, isLoading } = useQuery({
    queryKey: ["ce-glossary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ce_glossary")
        .select("*")
        .order("display_order")
        .order("term");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const filtered = glossary?.filter((g) => {
    const matchCat = category === "all" || g.category === category;
    const matchSearch =
      !search ||
      g.term.toLowerCase().includes(search.toLowerCase()) ||
      g.short_definition?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search terms..."
          className="w-full bg-secondary rounded-lg pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap border transition-colors",
              category === c.key
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && filtered && (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filtered.map((item) => (
            <div key={item.id} className="cosmic-card rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">{item.term}</p>
                {item.is_featured && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    Featured
                  </span>
                )}
              </div>
              {item.short_definition && (
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {item.short_definition}
                </p>
              )}
              {item.full_definition && (
                <p className="text-[10px] text-foreground/70 leading-relaxed">
                  {item.full_definition}
                </p>
              )}
              {item.category && (
                <span className="inline-block text-[8px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground mt-1">
                  {item.category}
                </span>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No matching terms found.</p>
          )}
        </div>
      )}
    </div>
  );
}
