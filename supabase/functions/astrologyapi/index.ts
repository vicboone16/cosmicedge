import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.astrology-api.io/api/v3";

// ── Helpers ──

function parseDateParts(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { year: y, month: m, day: d };
}

function parseTimeParts(timeStr: string) {
  const parts = timeStr.split(":").map(Number);
  return { hour: parts[0] || 12, minute: parts[1] || 0, second: parts[2] || 0 };
}

function buildBirthData(date: string, time: string, lat: number, lng: number) {
  return { ...parseDateParts(date), ...parseTimeParts(time), latitude: lat, longitude: lng };
}

async function apiCall(path: string, apiKey: string, body?: any, method = "POST") {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  const opts: RequestInit = { method, headers };
  if (body && method === "POST") {
    headers["content-type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(`${API_BASE}${path}`, opts);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Astrology API ${path} error ${resp.status}: ${text}`);
  }
  return resp.json();
}

const FULL_POINTS = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
  "Uranus", "Neptune", "Pluto", "Chiron", "Mean_Node", "True_Node",
  "Mean_Lilith", "True_Lilith", "Ascendant", "Medium_Coeli",
];
const TRADITIONAL_POINTS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
const EXTENDED_POINTS = [
  ...TRADITIONAL_POINTS, "Uranus", "Neptune", "Pluto",
  "Chiron", "Ceres", "Pallas", "Juno", "Vesta", "Mean_Lilith", "True_Lilith",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "natal";
    const entityId = url.searchParams.get("entity_id");
    const entityType = url.searchParams.get("entity_type") || "player";
    const transitDate = url.searchParams.get("transit_date") || new Date().toISOString().slice(0, 10);
    const locationLat = parseFloat(url.searchParams.get("lat") || "0");
    const locationLng = parseFloat(url.searchParams.get("lng") || "0");
    const entity2Id = url.searchParams.get("entity2_id");
    const detailLevel = url.searchParams.get("detail_level") || "full";

    const apiKey = Deno.env.get("ASTROLOGY_API_KEY");
    if (!apiKey) throw new Error("ASTROLOGY_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Cache check ──
    if (entityId && mode !== "glossary" && mode !== "now") {
      const { data: cached } = await supabase
        .from("astro_calculations")
        .select("*")
        .eq("entity_id", entityId)
        .eq("entity_type", entityType)
        .eq("calc_type", `aapi_${mode}`)
        .eq("calc_date", transitDate)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) {
        return new Response(
          JSON.stringify({ success: true, cached: true, provider: "astrology-api", result: cached.result, calc_id: cached.id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Helper: get entity birth data ──
    async function getBirthData(id: string, type: string) {
      const table = type === "referee" ? "referees" : "players";
      const { data } = await supabase
        .from(table)
        .select("name, birth_date, birth_time, birth_lat, birth_lng, birth_place")
        .eq("id", id)
        .maybeSingle();
      if (!data || !data.birth_date) return null;
      return {
        name: data.name,
        date: data.birth_date,
        time: data.birth_time || "12:00",
        latitude: data.birth_lat || 0,
        longitude: data.birth_lng || 0,
      };
    }

    async function cacheResult(eId: string, eType: string, calcType: string, result: any, expiresMs: number) {
      await supabase.from("astro_calculations").upsert({
        entity_id: eId,
        entity_type: eType,
        calc_type: `aapi_${calcType}`,
        calc_date: transitDate,
        provider: "astrology-api",
        result,
        location_lat: locationLat || null,
        location_lng: locationLng || null,
        expires_at: new Date(Date.now() + expiresMs).toISOString(),
      }, { onConflict: "entity_id,entity_type,calc_type,calc_date" });
    }

    let result: any = null;

    // ══════════════════════════════════════════
    // MODE: now — current planetary positions (GET, no entity needed)
    // ══════════════════════════════════════════
    if (mode === "now") {
      result = await apiCall("/data/now", apiKey, null, "GET");
      return new Response(
        JSON.stringify({ success: true, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: global_positions — ephemeris for a date (no birth data needed)
    // ══════════════════════════════════════════
    if (mode === "global_positions") {
      const dp = parseDateParts(transitDate);
      result = await apiCall("/data/global-positions", apiKey, {
        ...dp, hour: 12, minute: 0, second: 0,
        options: {
          zodiac_type: "Tropic",
          active_points: [...TRADITIONAL_POINTS, "Uranus", "Neptune", "Pluto"],
          precision: 2,
        },
      });
      const cacheId = entityId || `ephemeris_${transitDate}`;
      await cacheResult(cacheId, "ephemeris", "global_positions", result, 12 * 60 * 60 * 1000);
      return new Response(
        JSON.stringify({ success: true, cached: false, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: lunar_metrics — Moon phase, void-of-course
    // ══════════════════════════════════════════
    if (mode === "lunar_metrics") {
      const dp = parseDateParts(transitDate);
      const enhanced = url.searchParams.get("enhanced") === "true";
      const endpoint = enhanced ? "/data/lunar-metrics/enhanced" : "/data/lunar-metrics";
      result = await apiCall(endpoint, apiKey, {
        subject: {
          name: "Lunar Query",
          birth_data: { ...dp, hour: 12, minute: 0, second: 0, latitude: locationLat || 40.7, longitude: locationLng || -74.0 },
        },
        options: {
          house_system: "W",
          language: "en",
          ...(enhanced ? { tradition: "classical", detail_level: detailLevel } : {}),
        },
      });
      const cacheId = entityId || `lunar_${transitDate}`;
      await cacheResult(cacheId, "lunar", "lunar_metrics", result, 6 * 60 * 60 * 1000);
      return new Response(
        JSON.stringify({ success: true, cached: false, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: horary_chart — dedicated horary chart
    // ══════════════════════════════════════════
    if (mode === "horary_chart") {
      const question = url.searchParams.get("question") || `Game outcome for ${entityId}`;
      const tp = parseTimeParts(url.searchParams.get("transit_time") || "12:00");
      const dp = parseDateParts(transitDate);
      result = await apiCall("/horary/chart", apiKey, {
        question,
        question_time: { ...dp, ...tp, latitude: locationLat || 40.7, longitude: locationLng || -74.0 },
      });
      if (entityId) await cacheResult(entityId, "game", "horary_chart", result, 6 * 60 * 60 * 1000);
      return new Response(
        JSON.stringify({ success: true, cached: false, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: horary_analyze — full analysis with timing
    // ══════════════════════════════════════════
    if (mode === "horary_analyze") {
      const question = url.searchParams.get("question") || `Will the home team win game ${entityId}?`;
      const category = url.searchParams.get("category") || "competition";
      const subcategory = url.searchParams.get("subcategory") || "outcome";
      const tp = parseTimeParts(url.searchParams.get("transit_time") || "12:00");
      const dp = parseDateParts(transitDate);
      result = await apiCall("/horary/analyze", apiKey, {
        question, category, subcategory,
        question_time: { ...dp, ...tp, latitude: locationLat || 40.7, longitude: locationLng || -74.0 },
        chart_options: { house_system: "R" },
        include_timing: true,
      });
      if (entityId) await cacheResult(entityId, "game", "horary_analyze", result, 6 * 60 * 60 * 1000);
      return new Response(
        JSON.stringify({ success: true, cached: false, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: horary_aspects — applying/separating aspects
    // ══════════════════════════════════════════
    if (mode === "horary_aspects") {
      const tp = parseTimeParts(url.searchParams.get("transit_time") || "12:00");
      const dp = parseDateParts(transitDate);
      result = await apiCall("/horary/aspects", apiKey, {
        question_time: { ...dp, ...tp, latitude: locationLat || 40.7, longitude: locationLng || -74.0 },
        max_lookahead_degrees: 90,
        include_separating: true,
      });
      return new Response(
        JSON.stringify({ success: true, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: horary_prop — individual horary for a player prop
    // ══════════════════════════════════════════
    if (mode === "horary_prop") {
      const playerName = url.searchParams.get("player_name") || "Player";
      const propType = url.searchParams.get("prop_type") || "points";
      const propLine = url.searchParams.get("prop_line") || "0";
      const direction = url.searchParams.get("direction") || "over";
      const tp = parseTimeParts(url.searchParams.get("transit_time") || new Date().toISOString().slice(11, 16));
      const dp = parseDateParts(transitDate);
      const question = `Will ${playerName} go ${direction} ${propLine} ${propType} in this game?`;
      result = await apiCall("/horary/analyze", apiKey, {
        question, category: "competition", subcategory: "outcome",
        question_time: { ...dp, ...tp, latitude: locationLat || 40.7, longitude: locationLng || -74.0 },
        chart_options: { house_system: "R" },
        include_timing: true,
      });
      const cacheId = entityId || `prop_${playerName}_${propType}_${propLine}`;
      await cacheResult(cacheId, "prop", "horary_prop", result, 3 * 60 * 60 * 1000);
      return new Response(
        JSON.stringify({ success: true, cached: false, provider: "astrology-api", result, question }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: astrocartography — planetary lines for a venue
    // ══════════════════════════════════════════
    if (mode === "astrocartography") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) return new Response(JSON.stringify({ error: "No birth data" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      result = await apiCall("/astrocartography/location-analysis", apiKey, {
        subject: { name: birthData.name, birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude) },
        location: { latitude: locationLat, longitude: locationLng },
        analysis_options: { orb_tolerance: 1.5, include_minor_aspects: true },
      });
      await cacheResult(entityId, entityType, "astrocartography", result, 30 * 24 * 60 * 60 * 1000);
      return new Response(
        JSON.stringify({ success: true, cached: false, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: paran_map — paran lines
    // ══════════════════════════════════════════
    if (mode === "paran_map") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) return new Response(JSON.stringify({ error: "No birth data" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const primaryPlanet = url.searchParams.get("primary_planet") || "Moon";
      const secondaryPlanets = (url.searchParams.get("secondary_planets") || "Jupiter,Venus").split(",");
      result = await apiCall("/astrocartography/paran-map", apiKey, {
        subject: { name: birthData.name, birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude) },
        paran_options: { primary_planet: primaryPlanet, secondary_planets: secondaryPlanets },
      });
      return new Response(
        JSON.stringify({ success: true, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: dignities — traditional dignities with fixed stars
    // ══════════════════════════════════════════
    if (mode === "dignities") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) return new Response(JSON.stringify({ error: "No birth data" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      result = await apiCall("/traditional/dignities", apiKey, {
        subject: { name: birthData.name, birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude) },
        options: {
          include_asteroids: url.searchParams.get("asteroids") === "true",
          include_fixed_stars: url.searchParams.get("fixed_stars") !== "false",
          dignity_system: "traditional",
        },
      });
      await cacheResult(entityId, entityType, "dignities", result, 365 * 24 * 60 * 60 * 1000);
      return new Response(
        JSON.stringify({ success: true, cached: false, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: positions — planetary positions (enhanced or standard)
    // ══════════════════════════════════════════
    if (mode === "positions") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) return new Response(JSON.stringify({ error: "No birth data" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const enhanced = url.searchParams.get("enhanced") === "true";
      const endpoint = enhanced ? "/data/positions/enhanced" : "/data/positions";
      result = await apiCall(endpoint, apiKey, {
        subject: { name: birthData.name, birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude) },
        options: {
          house_system: enhanced ? "A" : "W",
          language: "en",
          tradition: enhanced ? "classical" : "universal",
          detail_level: detailLevel,
          zodiac_type: "Tropic",
          active_points: enhanced ? [...TRADITIONAL_POINTS, "Part_of_Fortune"] : FULL_POINTS,
          precision: enhanced ? 2 : 6,
        },
      });
      return new Response(
        JSON.stringify({ success: true, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: aspects — planetary aspects (enhanced or standard)
    // ══════════════════════════════════════════
    if (mode === "aspects") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) return new Response(JSON.stringify({ error: "No birth data" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const enhanced = url.searchParams.get("enhanced") === "true";
      const endpoint = enhanced ? "/data/aspects/enhanced" : "/data/aspects";
      result = await apiCall(endpoint, apiKey, {
        subject: { name: birthData.name, birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude) },
        options: {
          house_system: enhanced ? "A" : "W",
          language: "en",
          ...(enhanced ? { tradition: "classical", detail_level: detailLevel } : {}),
          zodiac_type: "Tropic",
          active_points: FULL_POINTS,
          precision: 4,
        },
      });
      return new Response(
        JSON.stringify({ success: true, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: transit_houses — house cusps for a transit date/time/location (no entity needed)
    // Used for computing the current Ascendant / Rising sign
    // ══════════════════════════════════════════
    if (mode === "transit_houses") {
      const tp = parseTimeParts(url.searchParams.get("transit_time") || new Date().toISOString().slice(11, 16));
      const dp = parseDateParts(transitDate);
      const lat = locationLat || 40.7128;
      const lng = locationLng || -74.006;
      result = await apiCall("/data/house-cusps", apiKey, {
        subject: {
          name: "Transit Rising",
          birth_data: { ...dp, ...tp, latitude: lat, longitude: lng },
        },
        options: { house_system: url.searchParams.get("house_system") || "P", zodiac_type: "Tropic", active_points: TRADITIONAL_POINTS, precision: 2 },
      });
      const cacheId = entityId || `transit_houses_${transitDate}_${lat}_${lng}`;
      await cacheResult(cacheId, "transit", "transit_houses", result, 2 * 60 * 60 * 1000);
      return new Response(
        JSON.stringify({ success: true, cached: false, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: house_cusps — house cusp positions (natal, requires entity)
    // ══════════════════════════════════════════
    if (mode === "house_cusps") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) return new Response(JSON.stringify({ error: "No birth data" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      result = await apiCall("/data/house-cusps", apiKey, {
        subject: { name: birthData.name, birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude) },
        options: { house_system: url.searchParams.get("house_system") || "P", zodiac_type: "Tropic", active_points: TRADITIONAL_POINTS, precision: 4 },
      });
      return new Response(
        JSON.stringify({ success: true, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: natal — natal chart via v3 API
    // ══════════════════════════════════════════
    if (mode === "natal") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) return new Response(JSON.stringify({ error: "No birth data" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      result = await apiCall("/charts/natal", apiKey, {
        subject: { name: birthData.name, birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude) },
        options: { house_system: "P", zodiac_type: "Tropic", active_points: EXTENDED_POINTS, precision: 6 },
      });
      await cacheResult(entityId, entityType, "natal", result, 365 * 24 * 60 * 60 * 1000);
      return new Response(
        JSON.stringify({ success: true, cached: false, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: transits — transit chart via v3 API
    // ══════════════════════════════════════════
    if (mode === "transits") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) return new Response(JSON.stringify({ error: "No birth data" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const dp = parseDateParts(transitDate);
      result = await apiCall("/charts/transit", apiKey, {
        subject: { name: birthData.name, birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude) },
        transit_time: { datetime: { ...dp, hour: 12, minute: 0, second: 0, latitude: locationLat || birthData.latitude, longitude: locationLng || birthData.longitude } },
        options: { house_system: "P", zodiac_type: "Tropic", active_points: TRADITIONAL_POINTS, precision: 2 },
      });
      await cacheResult(entityId, entityType, "transits", result, 6 * 60 * 60 * 1000);
      return new Response(
        JSON.stringify({ success: true, cached: false, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: glossary — various GET glossary endpoints
    // ══════════════════════════════════════════
    if (mode === "glossary") {
      const glossaryType = url.searchParams.get("type") || "traditional-points";
      const glossaryMap: Record<string, string> = {
        "traditional-points": "/traditional/glossary/traditional-points",
        "dignities": "/traditional/glossary/dignities",
        "horary-considerations": "/horary/glossary/considerations",
        "horary-categories": "/horary/glossary/categories",
        "cities": "/glossary/cities",
        "all-horary-categories": "/glossary/horary-categories",
      };
      const path = glossaryMap[glossaryType];
      if (!path) throw new Error(`Unknown glossary type: ${glossaryType}`);
      result = await apiCall(path, apiKey, null, "GET");
      return new Response(
        JSON.stringify({ success: true, provider: "astrology-api", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown mode: ${mode}`);
  } catch (error) {
    console.error("astrology-api error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
