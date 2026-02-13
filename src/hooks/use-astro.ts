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

// ── Sign abbreviation mapping ──
const SIGN_ABBREV: Record<string, string> = {
  Ari: "Aries", Tau: "Taurus", Gem: "Gemini", Can: "Cancer", Leo: "Leo", Vir: "Virgo",
  Lib: "Libra", Sco: "Scorpio", Sag: "Sagittarius", Cap: "Capricorn", Aqu: "Aquarius", Pis: "Pisces",
  Aries: "Aries", Taurus: "Taurus", Gemini: "Gemini", Cancer: "Cancer", Virgo: "Virgo",
  Libra: "Libra", Scorpio: "Scorpio", Sagittarius: "Sagittarius", Capricorn: "Capricorn", Aquarius: "Aquarius", Pisces: "Pisces",
};

function normalizeSign(s: string): string {
  return SIGN_ABBREV[s] || s;
}

// ── Extract from astrology-api global-positions response ──
function extractFromGlobalPositions(result: any): PlanetPosition[] | null {
  if (!result) return null;

  // Handle the v3 API nested structure: { success, data: { positions: [...] } }
  if (result?.data?.positions && Array.isArray(result.data.positions)) {
    return result.data.positions.map((p: any) => ({
      planet: p.name || p.planet || p.point,
      sign: normalizeSign(p.sign || p.zodiac_sign || ""),
      degree: Math.floor(p.degree ?? p.sign_degree ?? (p.absolute_longitude != null ? p.absolute_longitude % 30 : 0)),
      retrograde: p.is_retrograde ?? p.retrograde ?? false,
    })).filter((p: PlanetPosition) => p.sign);
  }

  if (Array.isArray(result)) {
    return result.map((p: any) => ({
      planet: p.name || p.planet || p.point,
      sign: normalizeSign(p.sign || p.zodiac_sign || ""),
      degree: Math.floor(p.degree ?? p.sign_degree ?? (p.longitude != null ? p.longitude % 30 : 0)),
      retrograde: p.retrograde ?? p.is_retrograde ?? false,
    })).filter((p: PlanetPosition) => p.sign);
  }

  if (typeof result === "object" && !Array.isArray(result)) {
    const positions = result.positions || result.planets || result.data || result;
    if (Array.isArray(positions)) {
      return extractFromGlobalPositions(positions);
    }
    const entries = Object.entries(positions);
    if (entries.length > 0 && typeof entries[0][1] === "object") {
      return entries.map(([name, data]: [string, any]) => ({
        planet: name,
        sign: normalizeSign(data.sign || data.zodiac_sign || ""),
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

// ── Fetch rising sign (Ascendant) for a date/time/location ──
export function useRisingSign(forDate?: Date, lat?: number, lng?: number) {
  const dateStr = (forDate || new Date()).toISOString().slice(0, 10);
  const now = forDate || new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return useQuery({
    queryKey: ["rising-sign", dateStr, timeStr, lat, lng],
    queryFn: async () => {
      // Check cache
      const cacheId = `transit_houses_${dateStr}_${lat || 40.7128}_${lng || -74.006}`;
      const { data: cached } = await supabase
        .from("astro_calculations")
        .select("result")
        .eq("entity_id", cacheId)
        .eq("calc_type", "aapi_transit_houses")
        .eq("calc_date", dateStr)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      const result = cached?.result || await (async () => {
        try {
          const params = new URLSearchParams({
            mode: "transit_houses",
            transit_date: dateStr,
            transit_time: timeStr,
            ...(lat ? { lat: String(lat) } : {}),
            ...(lng ? { lng: String(lng) } : {}),
          });
          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrologyapi?${params}`,
            {
              headers: {
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
            }
          );
          if (!resp.ok) return null;
          const json = await resp.json();
          return json?.result || null;
        } catch {
          return null;
        }
      })();

      if (!result) return null;

      // Extract Ascendant from house cusps result
      // API may return houses as array or object
      const houses = result?.houses || result?.cusps || result?.data?.houses;
      if (Array.isArray(houses)) {
        const h1 = houses.find((h: any) => h.house === 1 || h.number === 1 || h.cusp === 1);
        if (h1) return { sign: h1.sign || h1.zodiac_sign || "", degree: Math.floor(h1.degree ?? h1.sign_degree ?? 0) };
      }
      // Check for direct ascendant field
      if (result?.ascendant || result?.Ascendant) {
        const asc = result.ascendant || result.Ascendant;
        if (typeof asc === "object") return { sign: asc.sign || asc.zodiac_sign || "", degree: Math.floor(asc.degree ?? asc.sign_degree ?? 0) };
        if (typeof asc === "string") return { sign: asc, degree: 0 };
      }
      return null;
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
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
  aspect: string;
  orb?: number;
  applying?: boolean;
}

export interface PlanetPosition {
  planet: string;
  sign: string;
  degree: number;
  retrograde: boolean;
}
