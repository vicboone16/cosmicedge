import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASTROVISOR_BASE = "https://astrovisor.io";

interface BirthData {
  name: string;
  date: string;      // YYYY-MM-DD
  time: string;      // HH:MM (24h) or "12:00" as default
  latitude: number;
  longitude: number;
  timezone?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "natal"; // natal | transits | synastry | batch_players
    const entityId = url.searchParams.get("entity_id"); // player or referee UUID
    const entityType = url.searchParams.get("entity_type") || "player";
    const transitDate = url.searchParams.get("transit_date") || new Date().toISOString().slice(0, 10);
    const locationLat = parseFloat(url.searchParams.get("lat") || "0");
    const locationLng = parseFloat(url.searchParams.get("lng") || "0");
    const entity2Id = url.searchParams.get("entity2_id"); // for synastry

    const apiKey = Deno.env.get("ASTROVISOR_API_KEY");
    if (!apiKey) throw new Error("ASTROVISOR_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Check cache first ──
    const cacheKey = `${mode}_${entityId}_${entityType}_${transitDate}_${locationLat}_${locationLng}`;
    const { data: cached } = await supabase
      .from("astro_calculations")
      .select("*")
      .eq("entity_id", entityId || "")
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

    // ── Fetch birth data for the entity ──
    async function getBirthData(id: string, type: string): Promise<BirthData | null> {
      const table = type === "referee" ? "referees" : "players";
      const { data } = await supabase
        .from(table)
        .select("name, birth_date, birth_time, birth_lat, birth_lng, birth_place")
        .eq("id", id)
        .maybeSingle();

      if (!data || !data.birth_date) return null;

      // Use noon as default if no birth time available
      const birthTime = data.birth_time || "12:00";
      const lat = data.birth_lat || 0;
      const lng = data.birth_lng || 0;

      return {
        name: data.name,
        date: data.birth_date,
        time: birthTime,
        latitude: lat,
        longitude: lng,
      };
    }

    if (mode === "batch_players") {
      // ── Batch: compute natal charts for all players missing them ──
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

      // Check which already have natal calcs
      const playerIds = players.map(p => p.id);
      const { data: existing } = await supabase
        .from("astro_calculations")
        .select("entity_id")
        .in("entity_id", playerIds)
        .eq("calc_type", "natal");

      const existingSet = new Set((existing || []).map(e => e.entity_id));
      const needCalc = players.filter(p => !existingSet.has(p.id));

      let computed = 0;
      for (const player of needCalc.slice(0, 20)) { // max 20 per batch to respect rate limits
        try {
          const birthTime = player.birth_time || "12:00";
          const resp = await fetch(`${ASTROVISOR_BASE}/api/v1/natal/chart`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              date: player.birth_date,
              time: birthTime,
              latitude: player.birth_lat || 0,
              longitude: player.birth_lng || 0,
            }),
          });

          if (resp.ok) {
            const result = await resp.json();
            const quality = player.birth_time ? "exact" : "noon_default";

            await supabase.from("astro_calculations").upsert({
              entity_id: player.id,
              entity_type: "player",
              calc_type: "natal",
              calc_date: player.birth_date,
              provider: "astrovisor",
              result,
              location_lat: player.birth_lat,
              location_lng: player.birth_lng,
              expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year cache for natal
            }, { onConflict: "entity_id,entity_type,calc_type,calc_date" });

            // Update natal data quality
            await supabase.from("players").update({ natal_data_quality: quality }).eq("id", player.id);
            computed++;
          } else {
            console.error(`AstroVisor natal error for ${player.name}: ${resp.status}`);
          }

          // Rate limit: wait 200ms between calls
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {
          console.error(`Natal calc error for ${player.name}:`, e);
        }
      }

      return new Response(
        JSON.stringify({ success: true, computed, total_needing: needCalc.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!entityId) throw new Error("entity_id is required");

    const birthData = await getBirthData(entityId, entityType);
    if (!birthData) {
      return new Response(
        JSON.stringify({ error: "No birth data available for this entity" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: any = null;
    let expiresIn = 24 * 60 * 60 * 1000; // 24h default

    if (mode === "natal") {
      // ── Natal Chart ──
      const resp = await fetch(`${ASTROVISOR_BASE}/api/v1/natal/chart`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: birthData.date,
          time: birthData.time,
          latitude: birthData.latitude,
          longitude: birthData.longitude,
        }),
      });

      if (!resp.ok) throw new Error(`AstroVisor natal error: ${resp.status} ${await resp.text()}`);
      result = await resp.json();
      expiresIn = 365 * 24 * 60 * 60 * 1000; // natal charts don't change

    } else if (mode === "transits") {
      // ── Transits to natal chart ──
      const resp = await fetch(`${ASTROVISOR_BASE}/api/v1/transits/calculate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          natal_date: birthData.date,
          natal_time: birthData.time,
          natal_latitude: birthData.latitude,
          natal_longitude: birthData.longitude,
          transit_date: transitDate,
          transit_time: "12:00",
          transit_latitude: locationLat || birthData.latitude,
          transit_longitude: locationLng || birthData.longitude,
        }),
      });

      if (!resp.ok) throw new Error(`AstroVisor transits error: ${resp.status} ${await resp.text()}`);
      result = await resp.json();
      expiresIn = 6 * 60 * 60 * 1000; // 6h for transits

    } else if (mode === "synastry" && entity2Id) {
      // ── Synastry between two entities ──
      const birthData2 = await getBirthData(entity2Id, entityType);
      if (!birthData2) {
        return new Response(
          JSON.stringify({ error: "No birth data for second entity" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const resp = await fetch(`${ASTROVISOR_BASE}/api/v1/relationships/synastry`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          person1: {
            date: birthData.date,
            time: birthData.time,
            latitude: birthData.latitude,
            longitude: birthData.longitude,
          },
          person2: {
            date: birthData2.date,
            time: birthData2.time,
            latitude: birthData2.latitude,
            longitude: birthData2.longitude,
          },
        }),
      });

      if (!resp.ok) throw new Error(`AstroVisor synastry error: ${resp.status} ${await resp.text()}`);
      result = await resp.json();
      expiresIn = 365 * 24 * 60 * 60 * 1000; // synastry doesn't change

    } else if (mode === "progressions") {
      // ── Secondary Progressions ──
      const resp = await fetch(`${ASTROVISOR_BASE}/api/v1/progressions/secondary`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          natal_date: birthData.date,
          natal_time: birthData.time,
          natal_latitude: birthData.latitude,
          natal_longitude: birthData.longitude,
          progression_date: transitDate,
        }),
      });

      if (!resp.ok) throw new Error(`AstroVisor progressions error: ${resp.status} ${await resp.text()}`);
      result = await resp.json();
      expiresIn = 24 * 60 * 60 * 1000;
    }

    if (!result) throw new Error(`Unknown mode: ${mode}`);

    // ── Cache result ──
    const calcRecord = {
      entity_id: entityId,
      entity_type: entityType,
      calc_type: mode,
      calc_date: transitDate,
      provider: "astrovisor",
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

    // Update natal_data_quality if natal chart
    if (mode === "natal") {
      const quality = birthData.time !== "12:00" ? "exact" : "noon_default";
      const table = entityType === "referee" ? "referees" : "players";
      await supabase.from(table).update({ natal_data_quality: quality }).eq("id", entityId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        cached: false,
        result,
        calc_id: upserted?.id,
        birth_time_quality: birthData.time !== "12:00" ? "exact" : "noon_default",
      }),
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
