import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const BDL_KEY = (Deno.env.get("BALLDONTLIE_KEY") ?? "").trim().replace(/^Bearer\s+/i, "");
  const bdlHeaders = { Authorization: `Bearer ${BDL_KEY}`, "X-Api-Key": BDL_KEY };

  // Find all "Player {id}" entries in nba_player_props_live
  const { data: unresolved } = await sb
    .from("nba_player_props_live")
    .select("player_id, player_name")
    .like("player_name", "Player %")
    .limit(500);

  if (!unresolved || unresolved.length === 0) {
    return new Response(JSON.stringify({ ok: true, resolved: 0, message: "No unresolved names" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const uniqueIds = [...new Set(unresolved.map(r => r.player_id))];
  let resolved = 0;
  let errors = 0;

  for (const bdlId of uniqueIds.slice(0, 50)) {
    try {
      // Try v1 first (some BDL odds use v1 IDs), then v2
      let fullName = "";
      let fn = "";
      let ln = "";
      let teamAbbr: string | null = null;
      
      for (const ver of ["v1", "v2"]) {
        const res = await fetch(`https://api.balldontlie.io/${ver}/players/${bdlId}`, { headers: bdlHeaders });
        if (res.status === 429) {
          console.log(`[resolve] BDL ${bdlId} → 429 (${ver}), stopping`);
          // Return what we have so far
          return new Response(JSON.stringify({ ok: true, resolved, errors, total_ids: uniqueIds.length, stopped: "rate_limit" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!res.ok) continue;
        const body = await res.json();
        const pData = body.data || body;
        fn = pData.first_name || "";
        ln = pData.last_name || "";
        fullName = `${fn} ${ln}`.trim();
        teamAbbr = pData.team?.abbreviation || null;
        if (fullName) break;
      }

      // Cache
      await sb.from("bdl_player_cache").upsert({
        bdl_id: String(bdlId),
        first_name: fn, last_name: ln, full_name: fullName,
        team: pData.team?.abbreviation || null,
      }, { onConflict: "bdl_id" });

      // Update live props
      const { count } = await sb
        .from("nba_player_props_live")
        .update({ player_name: fullName })
        .eq("player_id", String(bdlId))
        .select("id", { count: "exact", head: true });

      resolved++;
      console.log(`[resolve] ${bdlId} → ${fullName} (${count} rows updated)`);
    } catch (e) {
      console.error(`[resolve] Error for ${bdlId}:`, e);
      errors++;
    }
  }

  return new Response(JSON.stringify({ ok: true, resolved, errors, total_ids: uniqueIds.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
