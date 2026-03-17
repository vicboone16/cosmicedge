import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Priority = "low" | "normal" | "high" | "urgent";

type CommandRequest = {
  app_slug: "cosmicedge";
  command_name: string;
  priority?: Priority;
  created_by?: string;
  command_payload?: Record<string, unknown>;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function buildIssueBody(input: {
  appSlug: string;
  commandName: string;
  priority: string;
  createdBy?: string;
  payload: Record<string, unknown>;
}) {
  return `
# CosmicEdge Automation Command

**App:** ${input.appSlug}
**Command:** ${input.commandName}
**Priority:** ${input.priority}
**Created by:** ${input.createdBy ?? "unknown"}

## Payload
\`\`\`json
${JSON.stringify(input.payload, null, 2)}
\`\`\`

## CosmicEdge handling rules
- This app is isolated from the Nova behavior ecosystem.
- Preserve live vs historical data separation.
- Do not break live engines, props ingestion, roster alignment, or parser flows.
- Do not rename production tables or columns without a safe migration plan.
- Preserve existing routing, auth, subscription, and paywall logic.
- Prefer surgical repairs over rewrites.
- Validate environment variables and live data sources before changing logic.

## Output required
- Executive summary
- Exact issues found
- Exact repairs made
- Files/functions/tables touched
- Risks or follow-up items
`.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as CommandRequest;

    if (!body.app_slug || !body.command_name) {
      return jsonResponse(
        { error: "app_slug and command_name are required" },
        400
      );
    }

    const allowedAppSlugs = ["cosmicedge"];

    if (!allowedAppSlugs.includes(body.app_slug)) {
      return jsonResponse(
        {
          error: `Invalid app_slug for CosmicEdge command center: ${body.app_slug}`,
          allowed_app_slugs: allowedAppSlugs,
        },
        400
      );
    }

    const { data: appRow, error: appError } = await supabase
      .from("app_command_registry")
      .select("*")
      .eq("app_slug", body.app_slug)
      .eq("is_active", true)
      .single();

    if (appError || !appRow) {
      return jsonResponse(
        { error: `Unknown or inactive app_slug: ${body.app_slug}` },
        400
      );
    }

    const allowedCommands = (appRow as any).allowed_commands ?? [];
    if (!allowedCommands.includes(body.command_name)) {
      return jsonResponse(
        {
          error: `Command "${body.command_name}" is not allowed for app "${body.app_slug}"`,
          allowed_commands: allowedCommands,
        },
        400
      );
    }

    const commandPayload = body.command_payload ?? {};
    const priority = body.priority ?? "normal";

    const { data: task, error: insertError } = await supabase
      .from("command_tasks")
      .insert({
        app_slug: body.app_slug,
        repo_owner: (appRow as any).repo_owner,
        repo_name: (appRow as any).repo_name,
        command_name: body.command_name,
        command_payload: commandPayload,
        priority,
        created_by: body.created_by ?? null,
        status: "queued",
      })
      .select("*")
      .single();

    if (insertError || !task) {
      return jsonResponse(
        {
          error: "Failed to create command task",
          details: insertError,
        },
        500
      );
    }

    const issueTitle = `[${body.app_slug}] ${body.command_name} (${priority})`;
    const issueBody = buildIssueBody({
      appSlug: body.app_slug,
      commandName: body.command_name,
      priority,
      createdBy: body.created_by,
      payload: commandPayload,
    });

    const githubRes = await fetch(
      `https://api.github.com/repos/${(appRow as any).repo_owner}/${(appRow as any).repo_name}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "supabase-edge-function",
        },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: ["automation", "cosmicedge", body.command_name],
        }),
      }
    );

    const githubJson = await githubRes.json();

    if (!githubRes.ok) {
      await supabase
        .from("command_tasks")
        .update({
          status: "failed",
          error_message: `GitHub issue creation failed: ${JSON.stringify(githubJson)}`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", (task as any).id);

      return jsonResponse(
        {
          error: "GitHub issue creation failed",
          github: githubJson,
        },
        500
      );
    }

    await supabase
      .from("command_tasks")
      .update({
        status: "completed",
        github_issue_number: githubJson.number,
        github_issue_url: githubJson.html_url,
        output_summary: "CosmicEdge command task created and GitHub issue opened.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", (task as any).id);

    return jsonResponse({
      success: true,
      command_center: "cosmicedge",
      task_id: (task as any).id,
      github_issue_number: githubJson.number,
      github_issue_url: githubJson.html_url,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Unexpected server error",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
