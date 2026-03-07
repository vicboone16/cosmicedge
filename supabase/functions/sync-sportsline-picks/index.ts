import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let league = "NBA";
    try {
      const body = await req.json();
      if (body?.league) league = body.league;
    } catch { /* default NBA */ }

    const actorId = "harvest/sportsline-picks-scraper";
    const url =
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}` +
      `/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}&format=json`;

    console.log(`[sync-sportsline-picks] Running for league: ${league}`);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[sync-sportsline-picks] Apify failed:", err);
      return new Response(JSON.stringify({ error: "An internal error occurred." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = await res.json();

    // Log raw
    await supabase.from("apify_raw_logs").insert({
      actor_id: actorId,
      input_json: { league },
      payload: items,
      items_count: Array.isArray(items) ? items.length : 0,
    });

    // Store in picks_raw
    if (Array.isArray(items) && items.length > 0) {
      await supabase.from("picks_raw").insert(
        items.map((x: unknown) => ({
          league,
          payload: x,
          captured_at: new Date().toISOString(),
        }))
      );
    }

    console.log(`[sync-sportsline-picks] Done: ${Array.isArray(items) ? items.length : 0} picks`);

    return new Response(JSON.stringify({ ok: true, league, rows: Array.isArray(items) ? items.length : 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[sync-sportsline-picks] Error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
