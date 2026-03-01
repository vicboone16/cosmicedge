/**
 * EnvironmentGuard — blocks data fetches and shows a red banner
 * if the published domain is accidentally wired to the TEST database.
 *
 * Detection is purely env-var driven: we compare the project ref
 * from VITE_SUPABASE_URL against VITE_SUPABASE_PROJECT_ID.
 * If they disagree on a published hostname → mismatch.
 *
 * "Published" = hostname includes lovable.app | novabehavior.com | cosmicedge
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface EnvGuardCtx {
  /** true when environment is mismatched — callers should skip fetches */
  isMismatched: boolean;
}

const EnvironmentGuardContext = createContext<EnvGuardCtx>({ isMismatched: false });

export function useEnvironmentGuard() {
  return useContext(EnvironmentGuardContext);
}

function extractRef(url: string): string {
  try { return new URL(url).hostname.split(".")[0]; } catch { return ""; }
}

function detectMismatch(): boolean {
  const host = window.location.hostname;
  const isPublished =
    host.includes("lovable.app") ||
    host.includes("novabehavior.com") ||
    host.includes("cosmicedge");

  if (!isPublished) return false;

  const supaUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "";

  // If both are set, the URL ref should match the declared project id
  const urlRef = extractRef(supaUrl);
  if (projectId && urlRef && urlRef !== projectId) return true;

  // If URL is empty → mismatch
  if (!urlRef) return true;

  return false;
}

export function EnvironmentGuard({ children }: { children: ReactNode }) {
  const isMismatched = useMemo(() => detectMismatch(), []);

  if (isMismatched) {
    const urlRef = extractRef(import.meta.env.VITE_SUPABASE_URL ?? "");
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "";

    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-6">
        <div className="max-w-lg w-full rounded-xl border-2 border-red-600 bg-red-950/80 p-8 text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold text-red-400">
            ⚠ Environment Mismatch
          </h1>
          <p className="text-red-300 text-sm leading-relaxed">
            This published site's database URL does not match the expected
            project. All data fetches have been blocked to prevent serving
            stale/test data to production users.
          </p>
          <p className="text-red-400/70 text-xs font-mono">
            URL ref: {urlRef || "empty"} &bull; Expected: {projectId || "not set"}
          </p>
          <p className="text-red-300/60 text-xs">
            Republish the app from Lovable to resolve this.
          </p>
        </div>
      </div>
    );
  }

  return (
    <EnvironmentGuardContext.Provider value={{ isMismatched }}>
      {children}
    </EnvironmentGuardContext.Provider>
  );
}
