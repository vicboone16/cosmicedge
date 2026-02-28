// SGO Dispatcher — DEPRECATED: Now routes to BDL-based functions
// Kept as a no-op to prevent cron errors until cron jobs are updated
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  console.log("[sgo-dispatcher] DEPRECATED — All props now sourced from BallDontLie. This dispatcher is a no-op.");

  return new Response(
    JSON.stringify({
      success: true,
      deprecated: true,
      message: "SGO dispatcher retired. Props now sourced via BallDontLie (fetch-player-props, fetch-live-props, nba-bdl-live-dispatcher).",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
