import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

interface ApifyRunBody {
  actorId: string;
  input: Record<string, unknown>;
  cacheKey?: string;
  ttlSeconds?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN")!;

    if (!APIFY_TOKEN) {
      return new Response(JSON.stringify({ error: "APIFY_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: ApifyRunBody = await req.json();
    const { actorId, input, cacheKey, ttlSeconds } = body;

    if (!actorId) {
      return new Response(JSON.stringify({ error: "actorId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check cache
    if (cacheKey && ttlSeconds) {
      const { data: row } = await supabase
        .from("api_cache")
        .select("cache_key, payload, updated_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (row?.updated_at) {
        const ageSec = (Date.now() - new Date(row.updated_at).getTime()) / 1000;
        if (ageSec < ttlSeconds) {
          return new Response(JSON.stringify({ source: "cache", data: row.payload }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Run actor synchronously and get dataset items
    const url =
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}` +
      `/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}&format=json`;

    console.log(`[apify-run] Calling actor: ${actorId}`);

    const apifyRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input ?? {}),
    });

    if (!apifyRes.ok) {
      const errText = await apifyRes.text();
      console.error(`[apify-run] Actor failed: ${apifyRes.status}`, errText);
      return new Response(JSON.stringify({ error: "External service call failed." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = await apifyRes.json();

    // Log the raw run
    await supabase.from("apify_raw_logs").insert({
      actor_id: actorId,
      input_json: input,
      payload: items,
      items_count: Array.isArray(items) ? items.length : 0,
    });

    // Update cache
    if (cacheKey) {
      await supabase.from("api_cache").upsert({
        cache_key: cacheKey,
        payload: items,
        updated_at: new Date().toISOString(),
      });
    }

    console.log(`[apify-run] Success: ${Array.isArray(items) ? items.length : 0} items`);

    return new Response(JSON.stringify({ source: "apify", data: items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[apify-run] Error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
