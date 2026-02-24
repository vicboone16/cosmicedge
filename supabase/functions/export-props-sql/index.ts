import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || "2026-02-24";
  const offset = parseInt(searchParams.get("offset") || "0");
  const limit = parseInt(searchParams.get("limit") || "1000");

  const { data: props, error } = await supabase
    .from("player_props")
    .select("*, games!inner(start_time)")
    .eq("games.start_time::date", date)
    .order("id")
    .range(offset, offset + limit - 1);

  if (error) return new Response(JSON.stringify({ error }), { status: 500, headers: corsHeaders });

  const escSql = (v: any) => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  };

  const batchSize = 100;
  const batches: string[] = [];

  for (let i = 0; i < props!.length; i += batchSize) {
    const batch = props!.slice(i, i + batchSize);
    const values = batch.map((p: any) =>
      `(${escSql(p.id)},${escSql(p.game_id)},${escSql(p.player_name)},${escSql(p.market_key)},${escSql(p.market_label)},${escSql(p.bookmaker)},${p.line ?? "NULL"},${p.over_price ?? "NULL"},${p.under_price ?? "NULL"},${escSql(p.captured_at)},${escSql(p.created_at)},${escSql(p.external_event_id)})`
    ).join(",\n");

    batches.push(
      `INSERT INTO player_props (id, game_id, player_name, market_key, market_label, bookmaker, line, over_price, under_price, captured_at, created_at, external_event_id) VALUES\n${values}\nON CONFLICT (id) DO NOTHING;\n`
    );
  }

  const fullSql = `-- Player Props for ${date} (Offset: ${offset}, Limit: ${limit})\n\n${batches.join("\n")}`;

  return new Response(fullSql, {
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
});
