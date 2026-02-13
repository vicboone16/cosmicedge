import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.astrology-api.io/api/v3";

async function apiCall(path: string, apiKey: string, body: any) {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`API ${path} error ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

function parseDateParts(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return { year: y, month: m, day };
}

interface ElectionWindow {
  start_hour: number;
  end_hour: number;
  quality: "excellent" | "good" | "fair" | "avoid";
  reason: string;
  planetary_hour_ruler?: string;
  moon_void?: boolean;
  applying_aspects?: any[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const lat = parseFloat(url.searchParams.get("lat") || "40.7128");
    const lng = parseFloat(url.searchParams.get("lng") || "-74.006");
    const gameId = url.searchParams.get("game_id");

    const apiKey = Deno.env.get("ASTROVISOR_API_KEY");
    if (!apiKey) throw new Error("ASTROVISOR_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check cache
    const cacheId = gameId || `elections_${date}_${lat}_${lng}`;
    const { data: cached } = await supabase
      .from("astro_calculations")
      .select("*")
      .eq("entity_id", cacheId)
      .eq("calc_type", "elections")
      .eq("calc_date", date)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      return new Response(
        JSON.stringify({ success: true, cached: true, result: cached.result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dp = parseDateParts(date);

    // Fetch lunar metrics (void-of-course, phase) and enhanced version
    const [lunarBasic, lunarEnhanced] = await Promise.all([
      apiCall("/data/lunar-metrics", apiKey, {
        subject: { name: "Election", birth_data: { ...dp, hour: 12, minute: 0, second: 0, latitude: lat, longitude: lng } },
        options: { house_system: "P", language: "en" },
      }),
      apiCall("/data/lunar-metrics/enhanced", apiKey, {
        subject: { name: "Election", birth_data: { ...dp, hour: 12, minute: 0, second: 0, latitude: lat, longitude: lng } },
        options: { house_system: "W", language: "en", tradition: "classical", detail_level: "full" },
      }),
    ]);

    // Check 4 time slots throughout the day for applying aspects
    const timeSlots = [
      { hour: 9, label: "Morning" },
      { hour: 12, label: "Midday" },
      { hour: 15, label: "Afternoon" },
      { hour: 19, label: "Evening" },
    ];

    const slotAnalyses = await Promise.all(
      timeSlots.map(slot =>
        apiCall("/horary/aspects", apiKey, {
          question_time: { ...dp, hour: slot.hour, minute: 0, second: 0, latitude: lat, longitude: lng },
          max_lookahead_degrees: 30,
          include_separating: false,
        }).catch(() => null)
      )
    );

    // Build election windows
    const windows: ElectionWindow[] = timeSlots.map((slot, i) => {
      const aspects = slotAnalyses[i];
      const moonVoid = lunarBasic?.void_of_course || lunarEnhanced?.void_of_course || false;

      // Analyze applying aspects for quality
      let quality: ElectionWindow["quality"] = "fair";
      const reasons: string[] = [];

      if (moonVoid) {
        quality = "avoid";
        reasons.push("Moon void-of-course — actions may not materialize");
      }

      if (aspects?.applying_aspects) {
        const beneficial = aspects.applying_aspects.filter((a: any) =>
          ["trine", "sextile", "conjunction"].includes(a.aspect_type?.toLowerCase())
        );
        const challenging = aspects.applying_aspects.filter((a: any) =>
          ["square", "opposition"].includes(a.aspect_type?.toLowerCase())
        );

        if (beneficial.length > challenging.length && !moonVoid) {
          quality = beneficial.length >= 3 ? "excellent" : "good";
          reasons.push(`${beneficial.length} applying benefic aspect(s)`);
        } else if (challenging.length > beneficial.length) {
          quality = moonVoid ? "avoid" : "fair";
          reasons.push(`${challenging.length} applying challenging aspect(s)`);
        }
      }

      // Planetary hour calculation (simplified Chaldean)
      const chaldeanOrder = ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"];
      const dayRulers = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
      const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
      const dayRuler = dayRulers[dayOfWeek];
      const dayRulerIdx = chaldeanOrder.indexOf(dayRuler);
      const hourIdx = (dayRulerIdx + slot.hour) % 7;
      const hourRuler = chaldeanOrder[hourIdx];

      // Benefic hour rulers improve quality
      if (["Jupiter", "Venus", "Sun"].includes(hourRuler) && quality === "fair") {
        quality = "good";
        reasons.push(`${hourRuler} hour — benefic ruler`);
      } else if (["Saturn", "Mars"].includes(hourRuler) && quality === "good") {
        reasons.push(`${hourRuler} hour — malefic ruler, proceed with caution`);
      }

      return {
        start_hour: slot.hour,
        end_hour: slot.hour + 3,
        quality,
        reason: reasons.join("; ") || `${slot.label} window — neutral conditions`,
        planetary_hour_ruler: hourRuler,
        moon_void: moonVoid,
        applying_aspects: aspects?.applying_aspects || [],
      };
    });

    const result = {
      date,
      location: { lat, lng },
      lunar: { basic: lunarBasic, enhanced: lunarEnhanced },
      windows,
      best_window: windows.reduce((best, w) => {
        const qualityOrder = { excellent: 4, good: 3, fair: 2, avoid: 1 };
        return qualityOrder[w.quality] > qualityOrder[best.quality] ? w : best;
      }),
    };

    // Cache
    await supabase.from("astro_calculations").upsert({
      entity_id: cacheId,
      entity_type: "election",
      calc_type: "elections",
      calc_date: date,
      provider: "astrology-api",
      result,
      location_lat: lat,
      location_lng: lng,
      expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "entity_id,entity_type,calc_type,calc_date" });

    return new Response(
      JSON.stringify({ success: true, cached: false, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("astro-elections error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
