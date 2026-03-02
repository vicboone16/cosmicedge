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
import { AlertTriangle, ShieldAlert } from "lucide-react";

/** Known TEST project ref — if published site resolves to this, block everything */
const TEST_REF = "xilxyiijgnadlbabytfn";
/** Known LIVE project ref */
const LIVE_REF = "gwfgmlfggeyxexclwybk";

interface EnvGuardCtx {
  /** true when environment is mismatched — callers should skip fetches */
  isMismatched: boolean;
  /** detected supabase project ref */
  detectedRef: string;
  /** whether this is the live ref */
  isLive: boolean;
}

const EnvironmentGuardContext = createContext<EnvGuardCtx>({
  isMismatched: false,
  detectedRef: "",
  isLive: false,
});

export function useEnvironmentGuard() {
  return useContext(EnvironmentGuardContext);
}

function extractRef(url: string): string {
  try { return new URL(url).hostname.split(".")[0]; } catch { return ""; }
}

function isPublishedHost(): boolean {
  const host = window.location.hostname;
  return (
    (host.includes("lovable.app") && !host.includes("preview")) ||
    host.includes("novabehavior.com") ||
    host.includes("cosmicedge")
  );
}

function detectMismatch(urlRef: string): boolean {
  if (!isPublishedHost()) return false;

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "";

  // HARD BLOCK: published site pointing at the TEST database
  if (urlRef === TEST_REF) return true;

  // If both are set, the URL ref should match the declared project id
  if (projectId && urlRef && urlRef !== projectId) return true;

  // If URL is empty → mismatch
  if (!urlRef) return true;

  return false;
}

export function EnvironmentGuard({ children }: { children: ReactNode }) {
  const supaUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const urlRef = useMemo(() => extractRef(supaUrl), [supaUrl]);
  const isMismatched = useMemo(() => detectMismatch(urlRef), [urlRef]);
  const isLive = urlRef === LIVE_REF;

  if (isMismatched) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-6">
        <div className="max-w-lg w-full rounded-xl border-2 border-red-600 bg-red-950/80 p-8 text-center space-y-4">
          <ShieldAlert className="h-14 w-14 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold text-red-400">
            🚨 CONNECTED TO TEST DATABASE
          </h1>
          <p className="text-red-300 text-sm leading-relaxed">
            This published site is wired to the <strong>TEST</strong> Supabase
            project (<code className="text-red-400">{urlRef || "empty"}</code>).
            All data fetches have been <strong>blocked</strong> to prevent
            serving test data to production users.
          </p>
          <p className="text-red-300/80 text-xs font-mono">
            Expected LIVE ref: <code>{LIVE_REF}</code>
          </p>
          <p className="text-red-300/60 text-xs">
            Republish with correct environment variables to resolve.
          </p>
        </div>
      </div>
    );
  }

  return (
    <EnvironmentGuardContext.Provider value={{ isMismatched, detectedRef: urlRef, isLive }}>
      {/* Always-visible ENV badge */}
      <div
        className="fixed bottom-2 left-2 z-[9999] pointer-events-none select-none"
        aria-hidden
      >
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-lg backdrop-blur-sm ${
            isLive
              ? "bg-emerald-900/80 text-emerald-300 ring-1 ring-emerald-500/40"
              : "bg-red-900/80 text-red-300 ring-1 ring-red-500/40"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-red-400 animate-pulse"}`} />
          {isLive ? "LIVE" : "TEST"} · {urlRef.slice(0, 6)}
        </span>
      </div>
      {children}
    </EnvironmentGuardContext.Provider>
  );
}
