/**
 * BackendGuard — queries public.app_handshake on startup.
 * Blocks UI if app_slug ≠ 'cosmicedge' or SUPABASE_URL is not in allowlist.
 * Provides a diagnostics panel for debugging.
 */

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ShieldCheck, ShieldX, ChevronDown, ChevronUp } from "lucide-react";

const EXPECTED_SLUG = "cosmicedge";

/** Only these project refs are allowed for CosmicEdge */
const ALLOWED_REFS = [
  "xilxyiijgnadlbabytfn", // TEST
  "gwfgmlfggeyxexclwybk", // LIVE
];

function extractRef(url: string): string {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return "unknown";
  }
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const ref = host.split(".")[0];
    return `${ref.slice(0, 4)}****${ref.slice(-4)}.supabase.co`;
  } catch {
    return "***invalid***";
  }
}

type GuardState =
  | { status: "loading" }
  | { status: "pass"; slug: string; pingTs: string }
  | { status: "fail"; reason: string; slug?: string; pingTs?: string };

export function BackendGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GuardState>({ status: "loading" });
  const [showDiag, setShowDiag] = useState(false);

  const supaUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const ref = extractRef(supaUrl);
  const masked = maskUrl(supaUrl);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // 1. URL allowlist check
      if (!ALLOWED_REFS.includes(ref)) {
        if (!cancelled)
          setState({
            status: "fail",
            reason: `SUPABASE_URL ref "${ref}" is not in the CosmicEdge allowlist.`,
            pingTs: new Date().toISOString(),
          });
        return;
      }

      // 2. Query handshake
      try {
        const { data, error } = await supabase
          .from("app_handshake")
          .select("app_slug")
          .eq("id", 1)
          .maybeSingle();

        if (cancelled) return;

        const pingTs = new Date().toISOString();

        if (error) {
          setState({
            status: "fail",
            reason: `Handshake query failed: ${error.message}`,
            pingTs,
          });
          return;
        }

        if (!data) {
          setState({
            status: "fail",
            reason: "No handshake row found (id=1). Backend may not be initialized.",
            pingTs,
          });
          return;
        }

        if (data.app_slug !== EXPECTED_SLUG) {
          setState({
            status: "fail",
            reason: `Expected slug "${EXPECTED_SLUG}", got "${data.app_slug}".`,
            slug: data.app_slug,
            pingTs,
          });
          return;
        }

        setState({ status: "pass", slug: data.app_slug, pingTs });
      } catch (err: any) {
        if (!cancelled)
          setState({
            status: "fail",
            reason: `Network error: ${err?.message ?? "unknown"}`,
            pingTs: new Date().toISOString(),
          });
      }
    }

    check();
    return () => { cancelled = true; };
  }, [ref]);

  // Loading state
  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground">Verifying backend…</p>
        </div>
      </div>
    );
  }

  // Failure state — block UI
  if (state.status === "fail") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-lg w-full rounded-xl border-2 border-destructive bg-destructive/10 p-8 text-center space-y-4">
          <ShieldX className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold text-destructive">
            Wrong backend connected.
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {state.reason}
          </p>

          {/* Diagnostics */}
          <button
            onClick={() => setShowDiag(!showDiag)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Diagnostics {showDiag ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showDiag && (
            <div className="text-left text-xs font-mono bg-muted/50 rounded-lg p-4 space-y-1">
              <p><span className="text-muted-foreground">URL:</span> {masked}</p>
              <p><span className="text-muted-foreground">Ref:</span> {ref}</p>
              <p><span className="text-muted-foreground">Slug:</span> {state.slug ?? "n/a"}</p>
              <p><span className="text-muted-foreground">Ping:</span> {state.pingTs ?? "n/a"}</p>
              <p><span className="text-muted-foreground">Allowlist:</span> {ALLOWED_REFS.join(", ")}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Pass — render children (app)
  return <>{children}</>;
}
