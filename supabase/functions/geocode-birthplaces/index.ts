import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Geocode players who have birth_place but no birth_lat/birth_lng.
 * Uses free Nominatim (OpenStreetMap) geocoder — rate limited to 1 req/sec.
 * Call with ?league=NBA&limit=50 to process in batches.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "";
    const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find players with birth_place but no coordinates
    let query = supabase
      .from("players")
      .select("id, name, birth_place")
      .not("birth_place", "is", null)
      .is("birth_lat", null)
      .limit(limit);

    if (league) query = query.eq("league", league);

    const { data: players, error: fetchErr } = await query;
    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
    if (!players || players.length === 0) {
      return new Response(
        JSON.stringify({ success: true, geocoded: 0, message: "No players need geocoding" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[geocode] Processing ${players.length} players`);

    let geocoded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const player of players) {
      try {
        // Nominatim free geocoder — 1 req/sec rate limit
        const encPlace = encodeURIComponent(player.birth_place!);
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encPlace}&format=json&limit=1`,
          { headers: { "User-Agent": "CosmicEdge/1.0" } }
        );

        if (!geoRes.ok) {
          errors.push(`${player.name}: Nominatim ${geoRes.status}`);
          failed++;
          await delay(1100);
          continue;
        }

        const results = await geoRes.json();
        if (!results || results.length === 0) {
          errors.push(`${player.name}: "${player.birth_place}" not found`);
          failed++;
          await delay(1100);
          continue;
        }

        const lat = parseFloat(results[0].lat);
        const lng = parseFloat(results[0].lon);

        const { error: updateErr } = await supabase
          .from("players")
          .update({ birth_lat: lat, birth_lng: lng })
          .eq("id", player.id);

        if (updateErr) {
          errors.push(`${player.name}: DB update error: ${updateErr.message}`);
          failed++;
        } else {
          geocoded++;
        }

        // Respect Nominatim rate limit
        await delay(1100);
      } catch (e) {
        errors.push(`${player.name}: ${e.message}`);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        geocoded,
        failed,
        total: players.length,
        errors: errors.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("geocode-birthplaces error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
