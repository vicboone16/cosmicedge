import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Reads content from the calling environment's DB and returns it as JSON
 * so an admin can insert it into another environment.
 * 
 * GET  → returns all ce_* content as JSON (for export)
 * POST → upserts the provided JSON payload into the DB (for import)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    if (req.method === "GET") {
      // Export all content tables
      const [glossary, formulas, engines, pages] = await Promise.all([
        sb.from("ce_glossary").select("*").order("display_order"),
        sb.from("ce_formulas").select("*").order("display_order"),
        sb.from("ce_engine_registry").select("*").order("display_order"),
        sb.from("ce_info_pages").select("*").order("display_order"),
      ]);

      return new Response(JSON.stringify({
        ce_glossary: glossary.data || [],
        ce_formulas: formulas.data || [],
        ce_engine_registry: engines.data || [],
        ce_info_pages: pages.data || [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const payload = await req.json();

      const results: Record<string, string> = {};

      // Upsert glossary
      if (payload.ce_glossary?.length) {
        const { error } = await sb.from("ce_glossary").upsert(payload.ce_glossary, { onConflict: "id" });
        results.ce_glossary = error ? `error: ${error.message}` : `${payload.ce_glossary.length} rows`;
      }

      // Upsert formulas
      if (payload.ce_formulas?.length) {
        const { error } = await sb.from("ce_formulas").upsert(payload.ce_formulas, { onConflict: "id" });
        results.ce_formulas = error ? `error: ${error.message}` : `${payload.ce_formulas.length} rows`;
      }

      // Upsert engines
      if (payload.ce_engine_registry?.length) {
        const { error } = await sb.from("ce_engine_registry").upsert(payload.ce_engine_registry, { onConflict: "id" });
        results.ce_engine_registry = error ? `error: ${error.message}` : `${payload.ce_engine_registry.length} rows`;
      }

      // Upsert info pages
      if (payload.ce_info_pages?.length) {
        const { error } = await sb.from("ce_info_pages").upsert(payload.ce_info_pages, { onConflict: "id" });
        results.ce_info_pages = error ? `error: ${error.message}` : `${payload.ce_info_pages.length} rows`;
      }

      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
