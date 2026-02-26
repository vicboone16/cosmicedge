import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "";
    const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);
    const target = url.searchParams.get("target") || "players"; // "players" | "venues"

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── MODE: venues — geocode games with venue but no lat/lng ──
    if (target === "venues") {
      let query = supabase
        .from("games")
        .select("id, venue, venue_lat, venue_lng")
        .not("venue", "is", null)
        .is("venue_lat", null)
        .limit(limit);

      if (league) query = query.eq("league", league);

      const { data: games, error: fetchErr } = await query;
      if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
      if (!games || games.length === 0) {
        return new Response(
          JSON.stringify({ success: true, geocoded: 0, message: "No venues need geocoding" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[geocode] Processing ${games.length} venues`);

      // Deduplicate by venue name to avoid re-geocoding the same arena
      const venueMap = new Map<string, { lat: number; lng: number }>();
      let geocoded = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const game of games) {
        const venueName = game.venue!;
        
        if (venueMap.has(venueName)) {
          const cached = venueMap.get(venueName)!;
          await supabase.from("games").update({ venue_lat: cached.lat, venue_lng: cached.lng }).eq("id", game.id);
          geocoded++;
          continue;
        }

        try {
          const encPlace = encodeURIComponent(venueName);
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encPlace}&format=json&limit=1`,
            { headers: { "User-Agent": "CosmicEdge/1.0" } }
          );

          if (!geoRes.ok) {
            errors.push(`${venueName}: Nominatim ${geoRes.status}`);
            failed++;
            await new Promise((r) => setTimeout(r, 1100));
            continue;
          }

          const results = await geoRes.json();
          if (!results || results.length === 0) {
            // Try with "arena" suffix
            const geoRes2 = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encPlace}+arena&format=json&limit=1`,
              { headers: { "User-Agent": "CosmicEdge/1.0" } }
            );
            const results2 = geoRes2.ok ? await geoRes2.json() : [];
            if (!results2 || results2.length === 0) {
              errors.push(`${venueName}: not found`);
              failed++;
              await new Promise((r) => setTimeout(r, 1100));
              continue;
            }
            results.push(results2[0]);
          }

          const lat = parseFloat(results[0].lat);
          const lng = parseFloat(results[0].lon);
          venueMap.set(venueName, { lat, lng });

          const { error: updateErr } = await supabase
            .from("games")
            .update({ venue_lat: lat, venue_lng: lng })
            .eq("id", game.id);

          if (updateErr) {
            errors.push(`${venueName}: DB update error: ${updateErr.message}`);
            failed++;
          } else {
            geocoded++;
          }

          await new Promise((r) => setTimeout(r, 1100));
        } catch (e) {
          errors.push(`${venueName}: ${e.message}`);
          failed++;
        }
      }

      return new Response(
        JSON.stringify({ success: true, target: "venues", geocoded, failed, total: games.length, unique_venues: venueMap.size, errors: errors.slice(0, 20) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── MODE: players (default) — geocode player birth places ──
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
        const encPlace = encodeURIComponent(player.birth_place!);
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encPlace}&format=json&limit=1`,
          { headers: { "User-Agent": "CosmicEdge/1.0" } }
        );

        if (!geoRes.ok) {
          errors.push(`${player.name}: Nominatim ${geoRes.status}`);
          failed++;
          await new Promise((r) => setTimeout(r, 1100));
          continue;
        }

        const results = await geoRes.json();
        if (!results || results.length === 0) {
          errors.push(`${player.name}: "${player.birth_place}" not found`);
          failed++;
          await new Promise((r) => setTimeout(r, 1100));
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

        await new Promise((r) => setTimeout(r, 1100));
      } catch (e) {
        errors.push(`${player.name}: ${e.message}`);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, geocoded, failed, total: players.length, errors: errors.slice(0, 20) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("geocode error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
