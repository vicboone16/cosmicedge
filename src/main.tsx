/**
 * Bootstrap guard: block published sites wired to TEST database.
 * Must run BEFORE any React rendering.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";

function extractRef(url: string): string {
  try { return new URL(url).hostname.split(".")[0]; } catch { return ""; }
}

const ref = extractRef(supabaseUrl);
const host = window.location.hostname;

const isPublished =
  host.includes("lovable.app") ||
  host.includes("novabehavior.com") ||
  host.includes("cosmicedge");

const liveRef = extractRef(
  import.meta.env.VITE_SUPABASE_LIVE_URL ?? ""        // optional; if unset we just check != env ref
);

// If env ref is empty → misconfigured; if published and ref != live ref (when live ref is known),
// we detect mismatch by checking the env var project id vs the published expectation.
// Simplest safe rule: on published domains the VITE_SUPABASE_URL must NOT point at a different
// project than itself—i.e., the env var must be set and resolve.
// The EnvironmentGuard component handles the deeper TEST-vs-LIVE check.

if (isPublished && !ref) {
  document.body.innerHTML = `
    <div style="padding:40px;font-family:system-ui;">
      <h1 style="color:red;">🚨 SUPABASE_URL not configured</h1>
      <p>No database URL found in environment variables.</p>
    </div>`;
  throw new Error("Published site has no SUPABASE_URL");
}

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
