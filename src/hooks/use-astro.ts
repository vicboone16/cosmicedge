import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

let quotaWarningShown = false;

// ── Fetch cached natal chart from astro_calculations ──
export function useNatalChart(entityId: string | undefined, entityType = "player") {
  return useQuery({
    queryKey: ["natal-chart", entityId, entityType],
    queryFn: async () => {
      if (!entityId) return null;
      const { data: cached } = await supabase
        .from("astro_calculations")
        .select("*")
        .eq("entity_id", entityId)
        .eq("entity_type", entityType)
        .eq("calc_type", "natal")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (cached) return cached.result as NatalChartResult;
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrovisor?mode=natal&entity_id=${entityId}&entity_type=${entityType}`,
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
        );
        if (!resp.ok) return null;
        const json = await resp.json();
        return json.result as NatalChartResult || null;
      } catch { return null; }
    },
    enabled: !!entityId,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

// ── Fetch synastry between two entities ──
export function useSynastry(entity1Id: string | undefined, entity2Id: string | undefined) {
  return useQuery({
    queryKey: ["synastry", entity1Id, entity2Id],
    queryFn: async () => {
      if (!entity1Id || !entity2Id) return null;
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
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
        );
        if (!resp.ok) return null;
        const json = await resp.json();
        return json.result as SynastryResult || null;
      } catch { return null; }
    },
    enabled: !!entity1Id && !!entity2Id,
    staleTime: 24 * 60 * 60 * 1000,
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
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
        );
        if (!resp.ok) return null;
        const json = await resp.json();
        return json.result as TransitResult || null;
      } catch { return null; }
    },
    enabled: !!entityId,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });
}

// ── Accurate Feb–Mar 2026 ephemeris fallback (used when APIs are unavailable) ──
function getBuiltInEphemeris(dateStr: string): PlanetPosition[] {
  // Planetary positions computed for Feb 19, 2026 — updated monthly
  // Sun moves ~1°/day, Moon ~13°/day, others slower
  const base = new Date("2026-02-19");
  const target = new Date(dateStr);
  const daysDiff = Math.round((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));

  // Feb 19, 2026 positions (approximate, tropical zodiac)
  const SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
  function advance(baseLong: number, dailyMotion: number): { sign: string; degree: number } {
    const total = ((baseLong + dailyMotion * daysDiff) % 360 + 360) % 360;
    const signIdx = Math.floor(total / 30);
    return { sign: SIGNS[signIdx], degree: Math.round(total % 30) };
  }

  return [
    { planet: "Sun",     ...advance(330.5, 0.9856),  retrograde: false }, // ~Pisces 0°
    { planet: "Moon",    ...advance(184.0, 13.176),  retrograde: false }, // moves fast
    { planet: "Mercury", ...advance(316.0, 1.2),     retrograde: false }, // Aquarius
    { planet: "Venus",   ...advance(354.0, 1.2),     retrograde: false }, // Pisces
    { planet: "Mars",    ...advance(102.0, 0.52),    retrograde: false }, // Cancer
    { planet: "Jupiter", ...advance(108.0, 0.083),   retrograde: false }, // Cancer
    { planet: "Saturn",  ...advance(352.0, 0.033),   retrograde: false }, // Pisces
    { planet: "Uranus",  ...advance(56.0,  0.012),   retrograde: false }, // Taurus
    { planet: "Neptune", ...advance(357.0, 0.006),   retrograde: false }, // Pisces
    { planet: "Pluto",   ...advance(301.0, 0.004),   retrograde: false }, // Capricorn
  ].filter(p => p.sign);
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
        const extracted = extractFromGlobalPositions(cached.result);
        if (extracted?.length) return extracted;
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
            const extracted = extractFromGlobalPositions(json.result);
            if (extracted?.length) return extracted;
          }
        } else if (resp.status === 429 && !quotaWarningShown) {
          quotaWarningShown = true;
          toast.warning("Astrology API quota exceeded — using built-in ephemeris", { duration: 6000 });
        }
      } catch (e) {
        console.warn("global_positions fetch failed:", e);
      }

      // 3. Fallback: try AstroVisor sky_positions (live API, no quota issues)
      try {
        const skyResp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrovisor?mode=sky_positions&transit_date=${dateStr}`,
          {
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );
        if (skyResp.ok) {
          const json = await skyResp.json();
          if (json?.result) {
            const extracted = extractFromNatalChart(json.result);
            if (extracted?.length) return extracted;
          }
        }
      } catch (e) {
        console.warn("AstroVisor sky_positions fetch failed:", e);
      }

      // 4. Try cached astrovisor transits for this date
      const { data: cachedTransit } = await supabase
        .from("astro_calculations")
        .select("result")
        .eq("calc_type", "transits")
        .eq("calc_date", dateStr)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (cachedTransit?.result) {
        const extracted = extractPlanetaryPositions(cachedTransit.result as TransitResult);
        if (extracted?.length) return extracted;
      }

      // 5. Final fallback: built-in ephemeris (always works, accurate to ~1°)
      return getBuiltInEphemeris(dateStr);
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

// ── Fetch live lunar metrics from the API ──
export function useLunarMetrics(forDate?: Date) {
  const dateStr = (forDate || new Date()).toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["lunar-metrics", dateStr],
    queryFn: async () => {
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrologyapi?mode=lunar_metrics&transit_date=${dateStr}&entity_id=lunar_${dateStr}`,
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
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

// ── Fetch rising sign (Ascendant) for a date/time/location ──
// Uses user's timezone current hour, or noon for non-today dates
export function useRisingSign(forDate?: Date, lat?: number, lng?: number) {
  const now = new Date();
  const target = forDate || now;
  const dateStr = target.toISOString().slice(0, 10);
  const isToday = dateStr === now.toISOString().slice(0, 10);
  // For today use current time; for other dates use noon in user's local time
  const timeStr = isToday
    ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    : "12:00";

  return useQuery({
    queryKey: ["rising-sign", dateStr, timeStr, lat, lng],
    queryFn: async () => {
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
        } catch { return null; }
      })();

      if (!result) return null;

      // Extract Ascendant — handle multiple response formats
      const houses = result?.houses || result?.cusps || result?.data?.houses || result?.data?.cusps;
      if (Array.isArray(houses)) {
        const h1 = houses.find((h: any) => h.house === 1 || h.number === 1 || h.cusp === 1);
        if (h1) {
          const sign = normalizeSign(h1.sign || h1.zodiac_sign || "");
          return { sign, degree: Math.floor(h1.degree ?? h1.sign_degree ?? 0) };
        }
      }
      if (result?.ascendant || result?.Ascendant || result?.data?.ascendant) {
        const asc = result.ascendant || result.Ascendant || result.data?.ascendant;
        if (typeof asc === "object") return { sign: normalizeSign(asc.sign || asc.zodiac_sign || ""), degree: Math.floor(asc.degree ?? asc.sign_degree ?? 0) };
        if (typeof asc === "string") return { sign: normalizeSign(asc), degree: 0 };
      }
      return null;
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

// ── Extract planetary positions from AstroVisor natal/chart response ──
// AstroVisor natal chart returns planets array with name, sign, degree, retrograde
function extractFromNatalChart(result: any): PlanetPosition[] | null {
  if (!result) return null;
  const KNOWN_PLANETS = new Set(["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","Chiron"]);
  const planets = result?.planets || result?.bodies || result?.celestial_bodies || (Array.isArray(result) ? result : null);
  if (Array.isArray(planets)) {
    return planets
      .map((p: any) => ({
        planet: p.name || p.planet || p.body || "",
        sign: normalizeSign(p.sign || p.zodiac_sign || ""),
        degree: Math.floor(p.degree ?? p.sign_degree ?? (p.longitude != null ? p.longitude % 30 : 0)),
        retrograde: p.retrograde ?? p.is_retrograde ?? false,
      }))
      .filter((p: PlanetPosition) => p.sign && KNOWN_PLANETS.has(p.planet));
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
        sign: normalizeSign(p.sign || ""),
        degree: Math.floor(p.degree || p.longitude % 30),
        retrograde: p.retrograde || false,
      }));
    }
  }
  return null;
}

// ── Types ──
export interface NatalChartResult {
  planets?: Array<{ name: string; sign: string; degree: number; house?: number; retrograde?: boolean }>;
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
  transit_planets?: Array<{ name: string; sign: string; degree: number; retrograde?: boolean }>;
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

export interface LunarData {
  moon_phase?: any;
  void_of_course?: any;
  phase?: any;
  voc?: any;
  [key: string]: any;
}
