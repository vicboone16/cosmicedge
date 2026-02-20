import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Get all distinct game_ids from game_quarters
  const { data: gqIds } = await supabase
    .from("game_quarters")
    .select("game_id")
    .order("game_id");

  const uniqueIds = [...new Set((gqIds || []).map((r: any) => r.game_id))];

  // Fetch full game records for those IDs
  const { data: games, error } = await supabase
    .from("games")
    .select("*")
    .in("id", uniqueIds);

  if (error) return new Response(JSON.stringify({ error }), { status: 500, headers: corsHeaders });

  const escSql = (v: any) => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  };

  // Generate INSERT SQL in batches of 50
  const batchSize = 50;
  const batches: string[] = [];

  for (let i = 0; i < games!.length; i += batchSize) {
    const batch = games!.slice(i, i + batchSize);
    const values = batch.map((g: any) =>
      `(${escSql(g.id)},${escSql(g.home_team)},${escSql(g.away_team)},${escSql(g.home_abbr)},${escSql(g.away_abbr)},${escSql(g.league)},${escSql(g.start_time)},${escSql(g.status)},${escSql(g.source)},${g.home_score ?? "NULL"},${g.away_score ?? "NULL"},${escSql(g.external_id)},${escSql(g.venue)},${g.venue_lat ?? "NULL"},${g.venue_lng ?? "NULL"})`
    ).join(",\n");

    batches.push(
      `-- Batch ${Math.floor(i / batchSize) + 1}\nINSERT INTO games (id, home_team, away_team, home_abbr, away_abbr, league, start_time, status, source, home_score, away_score, external_id, venue, venue_lat, venue_lng) VALUES\n${values}\nON CONFLICT (id) DO NOTHING;\n`
    );
  }

  const fullSql = `-- Run in Cloud View → Run SQL → select LIVE\n-- Games referenced by game_quarters (${games!.length} rows)\n\n${batches.join("\n")}`;

  return new Response(fullSql, {
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
});
