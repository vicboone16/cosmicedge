import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Fetch cached natal chart from astro_calculations ──
export function useNatalChart(entityId: string | undefined, entityType = "player") {
  return useQuery({
    queryKey: ["natal-chart", entityId, entityType],
    queryFn: async () => {
      if (!entityId) return null;

      // Try cache first
      const { data: cached } = await supabase
        .from("astro_calculations")
        .select("*")
        .eq("entity_id", entityId)
        .eq("entity_type", entityType)
        .eq("calc_type", "natal")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) return cached.result as NatalChartResult;

      // If not cached, call edge function to compute & cache
      try {
        const { data, error } = await supabase.functions.invoke("astrovisor", {
          body: null,
          headers: {},
        });
        // Use query params approach
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrovisor?mode=natal&entity_id=${entityId}&entity_type=${entityType}`,
          {
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          }
        );
        if (!resp.ok) return null;
        const json = await resp.json();
        return json.result as NatalChartResult || null;
      } catch {
        return null;
      }
    },
    enabled: !!entityId,
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  });
}

// ── Fetch synastry between two entities ──
export function useSynastry(entity1Id: string | undefined, entity2Id: string | undefined) {
  return useQuery({
    queryKey: ["synastry", entity1Id, entity2Id],
    queryFn: async () => {
      if (!entity1Id || !entity2Id) return null;

      // Try cache
      const { data: cached } = await supabase
        .from("astro_calculations")
        .select("*")
        .eq("entity_id", entity1Id)
        .eq("calc_type", "synastry")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) return cached.result as SynastryResult;

      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrovisor?mode=synastry&entity_id=${entity1Id}&entity2_id=${entity2Id}&entity_type=player`,
          {
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          }
        );
        if (!resp.ok) return null;
        const json = await resp.json();
        return json.result as SynastryResult || null;
      } catch {
        return null;
      }
    },
    enabled: !!entity1Id && !!entity2Id,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 1,
  });
}

// ── Fetch current transits ──
export function useTransits(entityId: string | undefined, transitDate?: string) {
  const date = transitDate || new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["transits", entityId, date],
    queryFn: async () => {
      if (!entityId) return null;

      const { data: cached } = await supabase
        .from("astro_calculations")
        .select("*")
        .eq("entity_id", entityId)
        .eq("calc_type", "transits")
        .eq("calc_date", date)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) return cached.result as TransitResult;

      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrovisor?mode=transits&entity_id=${entityId}&transit_date=${date}`,
          {
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          }
        );
        if (!resp.ok) return null;
        const json = await resp.json();
        return json.result as TransitResult || null;
      } catch {
        return null;
      }
    },
    enabled: !!entityId,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });
}

// ── Fetch planetary ephemeris for current day (for AstroHeader) ──
export function useCurrentEphemeris() {
  const today = new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["ephemeris", today],
    queryFn: async () => {
      // Check for any cached transit calc for today
      const { data: cached } = await supabase
        .from("astro_calculations")
        .select("result")
        .eq("calc_type", "transits")
        .eq("calc_date", today)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (cached?.result) {
        return extractPlanetaryPositions(cached.result as TransitResult);
      }
      return null; // Fall back to hardcoded in component
    },
    staleTime: 30 * 60 * 1000, // 30 min
    retry: false,
  });
}

// ── Extract planetary positions from transit data ──
function extractPlanetaryPositions(transit: TransitResult): PlanetPosition[] | null {
  if (!transit) return null;

  // AstroVisor returns transit planets — try to map them
  const result = transit as any;
  if (result?.transit_planets || result?.planets) {
    const planets = result.transit_planets || result.planets;
    if (Array.isArray(planets)) {
      return planets.map((p: any) => ({
        planet: p.name || p.planet,
        sign: p.sign,
        degree: Math.floor(p.degree || p.longitude % 30),
        retrograde: p.retrograde || false,
      }));
    }
  }
  return null;
}

// ── Types ──
export interface NatalChartResult {
  planets?: Array<{
    name: string;
    sign: string;
    degree: number;
    house?: number;
    retrograde?: boolean;
  }>;
  houses?: Array<{ house: number; sign: string; degree: number }>;
  aspects?: AspectData[];
  [key: string]: any;
}

export interface SynastryResult {
  aspects?: AspectData[];
  compatibility_score?: number;
  summary?: string;
  [key: string]: any;
}

export interface TransitResult {
  transit_planets?: Array<{
    name: string;
    sign: string;
    degree: number;
    retrograde?: boolean;
  }>;
  aspects?: AspectData[];
  [key: string]: any;
}

export interface AspectData {
  planet1: string;
  planet2: string;
  aspect: string; // conjunction, opposition, trine, square, sextile
  orb?: number;
  applying?: boolean;
}

export interface PlanetPosition {
  planet: string;
  sign: string;
  degree: number;
  retrograde: boolean;
}
