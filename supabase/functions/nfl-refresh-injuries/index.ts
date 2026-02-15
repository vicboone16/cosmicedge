import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("ROLLING_WAVE_API_KEY")!;
const CLIENT_ID = Deno.env.get("ROLLING_WAVE_CLIENT_ID")!;
const BASE = "http://rest.datafeeds.rolling-insights.com/api/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Fetch injuries
    const url = `${BASE}/injuries/NFL?RSC_token=${encodeURIComponent(API_KEY)}&client_id=${encodeURIComponent(CLIENT_ID)}`;
    console.log(`Fetching NFL injuries...`);
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const injuries = extractInjuries(data);
    console.log(`Found ${injuries.length} injury records`);

    let upserted = 0;
    let errors: string[] = [];
    const CHUNK = 50;

    for (let i = 0; i < injuries.length; i += CHUNK) {
      const chunk = injuries.slice(i, i + CHUNK).map(normalizeInjury);
      const { error } = await sb.from("nfl_injuries").upsert(chunk, {
        onConflict: "player_id,date_injured,injury",
      });
      if (error) {
        console.error(`Upsert error:`, error.message);
        errors.push(error.message);
      } else {
        upserted += chunk.length;
      }
    }

    return new Response(JSON.stringify({ ok: true, upserted, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("NFL injuries error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function extractInjuries(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data?.body && Array.isArray(data.body)) return data.body;
  if (data?.injuries && Array.isArray(data.injuries)) return data.injuries;
  if (data?.data && Array.isArray(data.data)) return data.data;
  for (const val of Object.values(data)) {
    if (Array.isArray(val) && (val as any[]).length > 0) return val as any[];
  }
  return [];
}

function normalizeInjury(row: any) {
  return {
    team_id: row.team_id ?? row.teamId ?? null,
    player_id: String(row.player_id ?? row.playerId ?? row.id),
    player_name: row.player_name ?? row.playerName ?? row.name ?? "Unknown",
    injury: row.injury ?? row.description ?? "Unspecified",
    returns: row.returns ?? row.returnDate ?? null,
    date_injured: row.date_injured ?? row.dateInjured ?? row.date ?? new Date().toISOString().slice(0, 10),
    last_seen_at: new Date().toISOString(),
    raw_json: row,
  };
}
