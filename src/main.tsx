/**
 * Bootstrap guard: block published sites wired to the wrong database.
 * Must run BEFORE any React rendering.
 *
 * "Published" = hostname includes lovable.app | novabehavior.com | cosmicedge
 *
 * Detection: compare the project ref extracted from VITE_SUPABASE_URL
 * against VITE_SUPABASE_PROJECT_ID. If they disagree on a published
 * hostname → hard-stop with a blocking red screen.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const declaredProjectId = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "";

function extractRef(url: string): string {
  try { return new URL(url).hostname.split(".")[0]; } catch { return ""; }
}

const urlRef = extractRef(supabaseUrl);
const host = window.location.hostname;

const isPublished =
  host.includes("lovable.app") ||
  host.includes("novabehavior.com") ||
  host.includes("cosmicedge");

if (isPublished) {
  // Fail-closed: block if URL is missing or ref doesn't match declared project id
  const mismatch = !urlRef || (declaredProjectId && urlRef !== declaredProjectId);

  if (mismatch) {
    document.body.innerHTML = `
      <div style="padding:40px;font-family:system-ui;background:#1a0000;color:#ff4444;min-height:100vh;display:flex;align-items:center;justify-content:center;">
        <div style="max-width:480px;text-align:center;border:2px solid #cc0000;border-radius:12px;padding:40px;background:rgba(40,0,0,0.9);">
          <h1 style="font-size:24px;margin-bottom:16px;">🚨 Environment Mismatch</h1>
          <p style="font-size:14px;margin-bottom:12px;color:#ff8888;">
            This published site is connected to the wrong database.
            The app has been blocked to protect production data.
          </p>
          <p style="font-size:11px;font-family:monospace;color:#ff666680;">
            URL ref: ${urlRef || "empty"} · Expected: ${declaredProjectId || "not set"}
          </p>
          <p style="font-size:12px;margin-top:16px;color:#ff888880;">
            Republish with correct environment variables to resolve.
          </p>
        </div>
      </div>`;
    throw new Error(`Published site env mismatch: URL ref="${urlRef}", project_id="${declaredProjectId}"`);
  }
}

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
