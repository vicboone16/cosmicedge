import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Unified glossary item shape ── */
interface GlossaryItem {
  id: string;
  term: string;
  category: string;
  short_definition: string | null;
  full_definition: string | null;
  is_featured: boolean;
  source: "db" | "api";
}

/* ── Category chips ── */
const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "model", label: "Model" },
  { key: "astro", label: "Astro" },
  { key: "basketball-stat", label: "Stats" },
  { key: "traditional", label: "Traditional" },
  { key: "dignities", label: "Dignities" },
  { key: "horary", label: "Horary" },
];

/* ── Normalise API glossary responses into GlossaryItems ── */
function normalizeApiTerms(
  raw: unknown,
  category: string,
  typeLabel: string
): GlossaryItem[] {
  if (!raw) return [];

  // API returns different shapes depending on the type – handle the common ones
  // Array of objects with name/description or term/definition
  if (Array.isArray(raw)) {
    return raw.map((item: any, idx: number) => ({
      id: `api-${category}-${idx}`,
      term:
        item.name ||
        item.term ||
        item.title ||
        item.point ||
        item.consideration ||
        item.category_name ||
        String(item),
      category,
      short_definition:
        item.description ||
        item.definition ||
        item.meaning ||
        item.summary ||
        item.explanation ||
        null,
      full_definition: item.details || item.full_description || null,
      is_featured: false,
      source: "api" as const,
    }));
  }

  // Object with key/value pairs (e.g. dignities)
  if (typeof raw === "object" && raw !== null) {
    return Object.entries(raw).map(([key, val], idx) => ({
      id: `api-${category}-${idx}`,
      term: key,
      category,
      short_definition: typeof val === "string" ? val : JSON.stringify(val),
      full_definition: null,
      is_featured: false,
      source: "api" as const,
    }));
  }

  return [];
}

/* ── Fetch all API glossary types ── */
async function fetchApiGlossary(): Promise<GlossaryItem[]> {
  const types = [
    { type: "traditional-points", category: "traditional", label: "Traditional Points" },
    { type: "dignities", category: "dignities", label: "Dignities" },
    { type: "horary-considerations", category: "horary", label: "Horary Considerations" },
    { type: "horary-categories", category: "horary", label: "Horary Categories" },
  ];

  const results = await Promise.allSettled(
    types.map(async (t) => {
      const { data, error } = await supabase.functions.invoke("astrologyapi", {
        body: { mode: "glossary", type: t.type },
      });
      if (error) {
        console.warn(`Glossary API fetch failed for ${t.type}:`, error);
        return [];
      }
      return normalizeApiTerms(data?.result, t.category, t.label);
    })
  );

  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

export default function AstraGlossaryTab() {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");

  /* ── DB glossary (ce_glossary table) ── */
  const { data: dbGlossary, isLoading: dbLoading } = useQuery({
    queryKey: ["ce-glossary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ce_glossary")
        .select("*")
        .order("display_order")
        .order("term");
      if (error) throw error;
      return (data ?? []).map((g) => ({
        ...g,
        category: g.category ?? "general",
        source: "db" as const,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  /* ── API glossary (astrology API) ── */
  const { data: apiGlossary, isLoading: apiLoading } = useQuery({
    queryKey: ["astro-api-glossary"],
    queryFn: fetchApiGlossary,
    staleTime: 30 * 60 * 1000, // cache longer – rarely changes
    retry: 1,
  });

  const isLoading = dbLoading;
  const allTerms: GlossaryItem[] = [
    ...(dbGlossary ?? []),
    ...(apiGlossary ?? []),
  ];

  /* ── Filter ── */
  const filtered = allTerms.filter((g) => {
    const matchCat = category === "all" || g.category === category;
    const matchSearch =
      !search ||
      g.term.toLowerCase().includes(search.toLowerCase()) ||
      g.short_definition?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  /* ── Active categories (only show chips that have items) ── */
  const activeCats = new Set(allTerms.map((g) => g.category));
  const visibleCategories = CATEGORIES.filter(
    (c) => c.key === "all" || activeCats.has(c.key)
  );

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
        {visibleCategories.map((c) => (
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

      {!isLoading && (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {apiLoading && (
            <div className="flex items-center gap-2 text-muted-foreground py-1 px-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-[10px]">Loading astrology terms…</span>
            </div>
          )}

          {filtered.map((item) => (
            <div key={item.id} className="cosmic-card rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">{item.term}</p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {item.is_featured && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                      Featured
                    </span>
                  )}
                  {item.source === "api" && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-accent/60 text-accent-foreground font-semibold">
                      Astro API
                    </span>
                  )}
                </div>
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
            <p className="text-xs text-muted-foreground text-center py-6">
              No matching terms found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
