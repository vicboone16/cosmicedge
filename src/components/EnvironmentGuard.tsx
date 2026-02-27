/**
 * EnvironmentGuard — blocks data fetches and shows a red banner
 * if the published domain is accidentally wired to the TEST database.
 *
 * TEST ref:  xilxyiijgnadlbabytfn
 * LIVE ref:  gwfgmlfggeyxexclwybk
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

const TEST_PROJECT_REF = "xilxyiijgnadlbabytfn";

/** Published (production) hostnames — add custom domains here too */
const PUBLISHED_HOSTNAMES = [
  "cosmicedge.lovable.app",
];

interface EnvGuardCtx {
  /** true when environment is mismatched — callers should skip fetches */
  isMismatched: boolean;
}

const EnvironmentGuardContext = createContext<EnvGuardCtx>({ isMismatched: false });

export function useEnvironmentGuard() {
  return useContext(EnvironmentGuardContext);
}

function detectMismatch(): boolean {
  const host = window.location.hostname;
  const supaUrl = import.meta.env.VITE_SUPABASE_URL ?? "";

  const isPublished = PUBLISHED_HOSTNAMES.some((h) => host === h);
  const usingTestDb = supaUrl.includes(TEST_PROJECT_REF);

  return isPublished && usingTestDb;
}

export function EnvironmentGuard({ children }: { children: ReactNode }) {
  const isMismatched = useMemo(() => detectMismatch(), []);

  if (isMismatched) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-6">
        <div className="max-w-lg w-full rounded-xl border-2 border-red-600 bg-red-950/80 p-8 text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold text-red-400">
            ⚠ CONNECTED TO TEST DATABASE
          </h1>
          <p className="text-red-300 text-sm leading-relaxed">
            This published site is pointing at the <strong>Test</strong> database
            instead of <strong>Live</strong>. All data fetches have been blocked
            to prevent serving stale/test data to production users.
          </p>
          <p className="text-red-400/70 text-xs font-mono">
            Expected: LIVE ref &bull; Got: {TEST_PROJECT_REF}
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
