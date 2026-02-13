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
    throw new Error(`API ${path} error ${resp.status}: ${text}`);
  }
  return resp.json();
}

// Standard active points sets
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

    const apiKey = Deno.env.get("ASTROVISOR_API_KEY");
    if (!apiKey) throw new Error("ASTROVISOR_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Check cache ──
    if (entityId) {
      const { data: cached } = await supabase
        .from("astro_calculations")
        .select("*")
        .eq("entity_id", entityId)
        .eq("entity_type", entityType)
        .eq("calc_type", mode)
        .eq("calc_date", transitDate)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) {
        return new Response(
          JSON.stringify({ success: true, cached: true, result: cached.result, calc_id: cached.id }),
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

    let result: any = null;
    let expiresIn = 24 * 60 * 60 * 1000;

    // ══════════════════════════════════════════
    // MODE: batch_players — compute natal charts for all players
    // ══════════════════════════════════════════
    if (mode === "batch_players") {
      const { data: players } = await supabase
        .from("players")
        .select("id, name, birth_date, birth_time, birth_lat, birth_lng")
        .not("birth_date", "is", null);

      if (!players?.length) {
        return new Response(
          JSON.stringify({ success: true, message: "No players with birth data" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const playerIds = players.map(p => p.id);
      const { data: existing } = await supabase
        .from("astro_calculations")
        .select("entity_id")
        .in("entity_id", playerIds)
        .eq("calc_type", "natal");

      const existingSet = new Set((existing || []).map(e => e.entity_id));
      const needCalc = players.filter(p => !existingSet.has(p.id));

      let computed = 0;
      for (const player of needCalc.slice(0, 20)) {
        try {
          const birthTime = player.birth_time || "12:00";
          const natalResult = await apiCall("/charts/natal", apiKey, {
            subject: {
              name: player.name,
              birth_data: buildBirthData(player.birth_date!, birthTime, player.birth_lat || 0, player.birth_lng || 0),
            },
            options: {
              house_system: "P",
              zodiac_type: "Tropic",
              active_points: EXTENDED_POINTS,
              precision: 4,
            },
          });

          await supabase.from("astro_calculations").upsert({
            entity_id: player.id,
            entity_type: "player",
            calc_type: "natal",
            calc_date: player.birth_date!,
            provider: "astrology-api",
            result: natalResult,
            location_lat: player.birth_lat,
            location_lng: player.birth_lng,
            expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          }, { onConflict: "entity_id,entity_type,calc_type,calc_date" });

          const quality = player.birth_time ? "exact" : "noon_default";
          await supabase.from("players").update({ natal_data_quality: quality }).eq("id", player.id);
          computed++;
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {
          console.error(`Natal calc error for ${player.name}:`, e);
        }
      }

      return new Response(
        JSON.stringify({ success: true, computed, total_needing: needCalc.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: now — current planetary positions (no entity needed)
    // ══════════════════════════════════════════
    if (mode === "now") {
      result = await apiCall("/data/now", apiKey, null, "GET");
      return new Response(
        JSON.stringify({ success: true, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: global_positions — ephemeris for a date (no birth data)
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

      if (entityId) {
        await supabase.from("astro_calculations").upsert({
          entity_id: entityId,
          entity_type: "ephemeris",
          calc_type: "global_positions",
          calc_date: transitDate,
          provider: "astrology-api",
          result,
          expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: "entity_id,entity_type,calc_type,calc_date" });
      }

      return new Response(
        JSON.stringify({ success: true, cached: false, result }),
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
      await supabase.from("astro_calculations").upsert({
        entity_id: cacheId,
        entity_type: "lunar",
        calc_type: "lunar_metrics",
        calc_date: transitDate,
        provider: "astrology-api",
        result,
        location_lat: locationLat,
        location_lng: locationLng,
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "entity_id,entity_type,calc_type,calc_date" });

      return new Response(
        JSON.stringify({ success: true, cached: false, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: horary — game horary chart via dedicated API
    // ══════════════════════════════════════════
    if (mode === "horary") {
      if (!entityId) throw new Error("entity_id required for horary");
      const tp = parseTimeParts(url.searchParams.get("transit_time") || "12:00");
      const dp = parseDateParts(transitDate);

      // Use the dedicated horary chart endpoint
      result = await apiCall("/horary/chart", apiKey, {
        question: `Game outcome analysis for ${entityId}`,
        question_time: {
          ...dp, ...tp,
          latitude: locationLat || 40.7,
          longitude: locationLng || -74.0,
        },
      }).catch(async () => {
        // Fallback: use natal chart endpoint for the game time
        return apiCall("/charts/natal", apiKey, {
          subject: {
            name: `Game ${entityId}`,
            birth_data: { ...dp, ...tp, latitude: locationLat || 40.7, longitude: locationLng || -74.0 },
          },
          options: { house_system: "R", zodiac_type: "Tropic", active_points: FULL_POINTS, precision: 4 },
        });
      });

      await supabase.from("astro_calculations").upsert({
        entity_id: entityId,
        entity_type: "game",
        calc_type: "horary",
        calc_date: transitDate,
        provider: "astrology-api",
        result,
        location_lat: locationLat,
        location_lng: locationLng,
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "entity_id,entity_type,calc_type,calc_date" });

      return new Response(
        JSON.stringify({ success: true, cached: false, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: horary_analyze — full horary analysis with timing
    // ══════════════════════════════════════════
    if (mode === "horary_analyze") {
      if (!entityId) throw new Error("entity_id required");
      const question = url.searchParams.get("question") || `Will the home team win game ${entityId}?`;
      const category = url.searchParams.get("category") || "competition";
      const tp = parseTimeParts(url.searchParams.get("transit_time") || "12:00");
      const dp = parseDateParts(transitDate);

      result = await apiCall("/horary/analyze", apiKey, {
        question,
        category,
        subcategory: "outcome",
        question_time: {
          ...dp, ...tp,
          latitude: locationLat || 40.7,
          longitude: locationLng || -74.0,
        },
        chart_options: { house_system: "R" },
        include_timing: true,
      });

      await supabase.from("astro_calculations").upsert({
        entity_id: entityId,
        entity_type: "game",
        calc_type: "horary_analyze",
        calc_date: transitDate,
        provider: "astrology-api",
        result,
        location_lat: locationLat,
        location_lng: locationLng,
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "entity_id,entity_type,calc_type,calc_date" });

      return new Response(
        JSON.stringify({ success: true, cached: false, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: horary_aspects — applying/separating aspects for timing
    // ══════════════════════════════════════════
    if (mode === "horary_aspects") {
      const tp = parseTimeParts(url.searchParams.get("transit_time") || "12:00");
      const dp = parseDateParts(transitDate);

      result = await apiCall("/horary/aspects", apiKey, {
        question_time: {
          ...dp, ...tp,
          latitude: locationLat || 40.7,
          longitude: locationLng || -74.0,
        },
        max_lookahead_degrees: 90,
        include_separating: true,
      });

      return new Response(
        JSON.stringify({ success: true, cached: false, result }),
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
        question,
        category: "competition",
        subcategory: "outcome",
        question_time: {
          ...dp, ...tp,
          latitude: locationLat || 40.7,
          longitude: locationLng || -74.0,
        },
        chart_options: { house_system: "R" },
        include_timing: true,
      });

      const cacheId = entityId || `prop_${playerName}_${propType}_${propLine}`;
      await supabase.from("astro_calculations").upsert({
        entity_id: cacheId,
        entity_type: "prop",
        calc_type: "horary_prop",
        calc_date: transitDate,
        provider: "astrology-api",
        result,
        location_lat: locationLat,
        location_lng: locationLng,
        expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "entity_id,entity_type,calc_type,calc_date" });

      return new Response(
        JSON.stringify({ success: true, cached: false, result, question }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: astrocartography — planetary lines for a venue
    // ══════════════════════════════════════════
    if (mode === "astrocartography") {
      if (!entityId) throw new Error("entity_id required for astrocartography");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) {
        return new Response(
          JSON.stringify({ error: "No birth data available" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      result = await apiCall("/astrocartography/location-analysis", apiKey, {
        subject: {
          name: birthData.name,
          birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude),
        },
        location: { latitude: locationLat, longitude: locationLng },
        analysis_options: { orb_tolerance: 1.5, include_minor_aspects: true },
      });

      await supabase.from("astro_calculations").upsert({
        entity_id: entityId,
        entity_type: entityType,
        calc_type: "astrocartography",
        calc_date: transitDate,
        provider: "astrology-api",
        result,
        location_lat: locationLat,
        location_lng: locationLng,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "entity_id,entity_type,calc_type,calc_date" });

      return new Response(
        JSON.stringify({ success: true, cached: false, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: paran_map — paran lines for a player
    // ══════════════════════════════════════════
    if (mode === "paran_map") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) {
        return new Response(
          JSON.stringify({ error: "No birth data available" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const primaryPlanet = url.searchParams.get("primary_planet") || "Moon";
      const secondaryStr = url.searchParams.get("secondary_planets") || "Jupiter,Venus";
      const secondaryPlanets = secondaryStr.split(",");

      result = await apiCall("/astrocartography/paran-map", apiKey, {
        subject: {
          name: birthData.name,
          birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude),
        },
        paran_options: { primary_planet: primaryPlanet, secondary_planets: secondaryPlanets },
      });

      return new Response(
        JSON.stringify({ success: true, cached: false, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: dignities — traditional dignities with fixed stars
    // ══════════════════════════════════════════
    if (mode === "dignities") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) {
        return new Response(
          JSON.stringify({ error: "No birth data available" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const includeFixedStars = url.searchParams.get("fixed_stars") !== "false";
      const includeAsteroids = url.searchParams.get("asteroids") === "true";

      result = await apiCall("/traditional/dignities", apiKey, {
        subject: {
          name: birthData.name,
          birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude),
        },
        options: {
          include_asteroids: includeAsteroids,
          include_fixed_stars: includeFixedStars,
          dignity_system: "traditional",
        },
      });

      await supabase.from("astro_calculations").upsert({
        entity_id: entityId,
        entity_type: entityType,
        calc_type: "dignities",
        calc_date: transitDate,
        provider: "astrology-api",
        result,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "entity_id,entity_type,calc_type,calc_date" });

      return new Response(
        JSON.stringify({ success: true, cached: false, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: positions — enhanced planetary positions
    // ══════════════════════════════════════════
    if (mode === "positions") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) {
        return new Response(
          JSON.stringify({ error: "No birth data available" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const enhanced = url.searchParams.get("enhanced") === "true";
      const endpoint = enhanced ? "/data/positions/enhanced" : "/data/positions";

      result = await apiCall(endpoint, apiKey, {
        subject: {
          name: birthData.name,
          birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude),
        },
        options: {
          house_system: "P",
          language: "en",
          tradition: enhanced ? "classical" : "universal",
          detail_level: detailLevel,
          zodiac_type: "Tropic",
          active_points: enhanced ? [...TRADITIONAL_POINTS, "Part_of_Fortune"] : FULL_POINTS,
          precision: enhanced ? 2 : 6,
        },
      });

      return new Response(
        JSON.stringify({ success: true, cached: false, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: aspects — planetary aspects
    // ══════════════════════════════════════════
    if (mode === "aspects") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) {
        return new Response(
          JSON.stringify({ error: "No birth data available" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const enhanced = url.searchParams.get("enhanced") === "true";
      const endpoint = enhanced ? "/data/aspects/enhanced" : "/data/aspects";

      result = await apiCall(endpoint, apiKey, {
        subject: {
          name: birthData.name,
          birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude),
        },
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
        JSON.stringify({ success: true, cached: false, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: house_cusps — house cusp positions
    // ══════════════════════════════════════════
    if (mode === "house_cusps") {
      if (!entityId) throw new Error("entity_id required");
      const birthData = await getBirthData(entityId, entityType);
      if (!birthData) {
        return new Response(
          JSON.stringify({ error: "No birth data available" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      result = await apiCall("/data/house-cusps", apiKey, {
        subject: {
          name: birthData.name,
          birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude),
        },
        options: {
          house_system: url.searchParams.get("house_system") || "P",
          zodiac_type: "Tropic",
          active_points: TRADITIONAL_POINTS,
          precision: 4,
        },
      });

      return new Response(
        JSON.stringify({ success: true, cached: false, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // MODE: glossary — fetch glossary data (GET endpoints)
    // ══════════════════════════════════════════
    if (mode === "glossary") {
      const glossaryType = url.searchParams.get("type") || "traditional-points";
      const glossaryMap: Record<string, string> = {
        "traditional-points": "/traditional/glossary/traditional-points",
        "dignities": "/traditional/glossary/dignities",
        "horary-considerations": "/horary/glossary/considerations",
        "horary-categories": "/horary/glossary/categories",
        "cities": "/glossary/cities",
      };
      const path = glossaryMap[glossaryType];
      if (!path) throw new Error(`Unknown glossary type: ${glossaryType}`);

      result = await apiCall(path, apiKey, null, "GET");
      return new Response(
        JSON.stringify({ success: true, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════
    // ENTITY-BASED MODES (natal, transits, synastry, progressions)
    // ══════════════════════════════════════════
    if (!entityId) throw new Error("entity_id is required");

    const birthData = await getBirthData(entityId, entityType);
    if (!birthData) {
      return new Response(
        JSON.stringify({ error: "No birth data available for this entity" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "natal") {
      result = await apiCall("/charts/natal", apiKey, {
        subject: {
          name: birthData.name,
          birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude),
        },
        options: {
          house_system: "P",
          zodiac_type: "Tropic",
          active_points: EXTENDED_POINTS,
          precision: 6,
        },
      });
      expiresIn = 365 * 24 * 60 * 60 * 1000;

    } else if (mode === "transits") {
      const tp = parseTimeParts("12:00");
      const dp = parseDateParts(transitDate);
      result = await apiCall("/charts/transit", apiKey, {
        subject: {
          name: birthData.name,
          birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude),
        },
        transit_time: {
          datetime: { ...dp, ...tp, latitude: locationLat || birthData.latitude, longitude: locationLng || birthData.longitude },
        },
        options: {
          house_system: "P",
          zodiac_type: "Tropic",
          active_points: TRADITIONAL_POINTS,
          precision: 2,
        },
      });
      expiresIn = 6 * 60 * 60 * 1000;

    } else if (mode === "synastry" && entity2Id) {
      const birthData2 = await getBirthData(entity2Id, entityType);
      if (!birthData2) {
        return new Response(
          JSON.stringify({ error: "No birth data for second entity" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Use natal charts for both + compute aspects client-side, or use positions
      const [chart1, chart2] = await Promise.all([
        apiCall("/charts/natal", apiKey, {
          subject: { name: birthData.name, birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude) },
          options: { house_system: "P", zodiac_type: "Tropic", active_points: EXTENDED_POINTS, precision: 4 },
        }),
        apiCall("/charts/natal", apiKey, {
          subject: { name: birthData2.name, birth_data: buildBirthData(birthData2.date, birthData2.time, birthData2.latitude, birthData2.longitude) },
          options: { house_system: "P", zodiac_type: "Tropic", active_points: EXTENDED_POINTS, precision: 4 },
        }),
      ]);
      result = { person1: chart1, person2: chart2 };
      expiresIn = 365 * 24 * 60 * 60 * 1000;

    } else if (mode === "progressions") {
      // Use transit chart with birth as subject and progression date as transit
      const dp = parseDateParts(transitDate);
      result = await apiCall("/charts/transit", apiKey, {
        subject: {
          name: birthData.name,
          birth_data: buildBirthData(birthData.date, birthData.time, birthData.latitude, birthData.longitude),
        },
        transit_time: { datetime: { ...dp, hour: 12, minute: 0, second: 0, latitude: birthData.latitude, longitude: birthData.longitude } },
        options: { house_system: "P", zodiac_type: "Tropic", active_points: EXTENDED_POINTS, precision: 4 },
      });
      expiresIn = 24 * 60 * 60 * 1000;

    } else {
      throw new Error(`Unknown mode: ${mode}`);
    }

    // ── Cache result ──
    const calcRecord = {
      entity_id: entityId,
      entity_type: entityType,
      calc_type: mode,
      calc_date: transitDate,
      provider: "astrology-api",
      result,
      location_lat: locationLat || null,
      location_lng: locationLng || null,
      expires_at: new Date(Date.now() + expiresIn).toISOString(),
    };

    const { data: upserted, error: upsertErr } = await supabase
      .from("astro_calculations")
      .upsert(calcRecord, { onConflict: "entity_id,entity_type,calc_type,calc_date" })
      .select("id")
      .single();

    if (upsertErr) console.error("Cache upsert error:", upsertErr);

    if (mode === "natal") {
      const quality = birthData.time !== "12:00" ? "exact" : "noon_default";
      const table = entityType === "referee" ? "referees" : "players";
      await supabase.from(table).update({ natal_data_quality: quality }).eq("id", entityId);
    }

    return new Response(
      JSON.stringify({ success: true, cached: false, result, calc_id: upserted?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("astrovisor error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
