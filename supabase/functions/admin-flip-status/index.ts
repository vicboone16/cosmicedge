import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Admin utility: flip game status
 * POST { game_ids: string[], status: string }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { game_ids, status } = await req.json();
  if (!game_ids?.length || !status) {
    return new Response(JSON.stringify({ error: "game_ids and status required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const id of game_ids) {
    const { error } = await sb.from("games")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    results.push({ id, ok: !error, error: error?.message });
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
