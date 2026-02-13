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

// ── Fetch planetary ephemeris for a given date (for AstroHeader + TransitsPage) ──
export function useCurrentEphemeris(forDate?: Date) {
  const dateStr = (forDate || new Date()).toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["ephemeris", dateStr],
    queryFn: async () => {
      // 1. Check cache for astrology-api global_positions
      const { data: cached } = await supabase
        .from("astro_calculations")
        .select("result")
        .eq("calc_type", "aapi_global_positions")
        .eq("calc_date", dateStr)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (cached?.result) {
        return extractFromGlobalPositions(cached.result);
      }

      // 2. Try fetching from astrology-api global_positions
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrologyapi?mode=global_positions&transit_date=${dateStr}`,
          {
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );
        if (resp.ok) {
          const json = await resp.json();
          if (json?.result) {
            return extractFromGlobalPositions(json.result);
          }
        }
      } catch (e) {
        console.warn("global_positions fetch failed:", e);
      }

      // 3. Fallback: try cached astrovisor transits for this date
      const { data: cachedTransit } = await supabase
        .from("astro_calculations")
        .select("result")
        .eq("calc_type", "transits")
        .eq("calc_date", dateStr)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (cachedTransit?.result) {
        return extractPlanetaryPositions(cachedTransit.result as TransitResult);
      }

      return null; // Fall back to approximation in component
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

// ── Extract from astrology-api global-positions response ──
function extractFromGlobalPositions(result: any): PlanetPosition[] | null {
  if (!result) return null;

  // The API returns positions keyed by planet name or as an array
  if (Array.isArray(result)) {
    return result.map((p: any) => ({
      planet: p.name || p.planet || p.point,
      sign: p.sign || p.zodiac_sign || "",
      degree: Math.floor(p.degree ?? p.sign_degree ?? (p.longitude != null ? p.longitude % 30 : 0)),
      retrograde: p.retrograde ?? p.is_retrograde ?? false,
    })).filter((p: PlanetPosition) => p.sign);
  }

  // Object keyed by planet name
  if (typeof result === "object" && !Array.isArray(result)) {
    // Check for nested positions key
    const positions = result.positions || result.planets || result.data || result;
    if (Array.isArray(positions)) {
      return extractFromGlobalPositions(positions);
    }
    // Object like { Sun: { sign: "Aquarius", degree: 24 }, ... }
    const entries = Object.entries(positions);
    if (entries.length > 0 && typeof entries[0][1] === "object") {
      return entries.map(([name, data]: [string, any]) => ({
        planet: name,
        sign: data.sign || data.zodiac_sign || "",
        degree: Math.floor(data.degree ?? data.sign_degree ?? (data.longitude != null ? data.longitude % 30 : 0)),
        retrograde: data.retrograde ?? data.is_retrograde ?? false,
      })).filter((p: PlanetPosition) => p.sign);
    }
  }

  return null;
}
// ── Extract planetary positions from astrovisor transit data ──
function extractPlanetaryPositions(transit: TransitResult): PlanetPosition[] | null {
  if (!transit) return null;
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
