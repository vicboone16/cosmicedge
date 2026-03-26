import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizeAbbr } from "../_shared/team-mappings.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN")!;
    const BALLDONTLIE_KEY = Deno.env.get("BALLDONTLIE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const actorId = "cloud9_ai/balldontlie-sports-scraper";
    const url =
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}` +
      `/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}&format=json`;

    const results: Record<string, number> = {};

    // Pull teams and players metadata
    for (const mode of ["teams", "players"]) {
      console.log(`[sync-balldontlie] Fetching mode: ${mode}`);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: BALLDONTLIE_KEY,
            mode,
            maxResults: 500,
          }),
        });

        if (!res.ok) {
          console.warn(`[sync-balldontlie] Failed for ${mode}: ${res.status}`);
          const errText = await res.text();
          console.warn(errText);
          results[mode] = 0;
          continue;
        }

        const items = await res.json();

        // Log raw
        await supabase.from("apify_raw_logs").insert({
          actor_id: actorId,
          input_json: { mode, maxResults: 500 },
          payload: items,
          items_count: Array.isArray(items) ? items.length : 0,
        });

        // Normalize players into the existing `players` table
        if (mode === "players" && Array.isArray(items)) {
          for (const p of items) {
            const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.name || "";
            if (!name) continue;

            const teamAbbr = p.team?.abbreviation ?? p.teamAbbr ?? "";
            const position = p.position ?? "";
            const league = "NBA";

            // Upsert by name + team (best-effort dedup)
            const { data: existing } = await supabase
              .from("players")
              .select("id")
              .eq("name", name)
              .eq("league", league)
              .maybeSingle();

            if (existing) {
              await supabase.from("players").update({
                team: teamAbbr,
                position,
                updated_at: new Date().toISOString(),
              }).eq("id", existing.id);
            } else {
              await supabase.from("players").insert({
                name,
                team: teamAbbr,
                position,
                league,
                source: "balldontlie",
              });
            }
          }
        }

        results[mode] = Array.isArray(items) ? items.length : 0;
      } catch (err) {
        console.warn(`[sync-balldontlie] Error for ${mode}:`, err);
        results[mode] = 0;
      }
    }

    console.log("[sync-balldontlie] Done:", results);

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[sync-balldontlie] Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
