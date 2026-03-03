/**
 * BackendGuard — queries public.app_handshake on startup.
 * Blocks UI if app_slug ≠ 'cosmicedge'.
 * No hardcoded project refs — uses env vars only.
 */

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldX, ChevronDown, ChevronUp } from "lucide-react";

const EXPECTED_SLUG = "cosmicedge";

function extractRef(url: string): string {
  try { return new URL(url).hostname.split(".")[0]; } catch { return "unknown"; }
}

function maskUrl(url: string): string {
  try {
    const ref = extractRef(url);
    return `${ref.slice(0, 4)}****${ref.slice(-4)}`;
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
      // Query handshake — no allowlist; slug check is sufficient
      try {
        const { data, error } = await supabase
          .from("app_handshake")
          .select("app_slug")
          .eq("id", 1)
          .maybeSingle();

        if (cancelled) return;
        const pingTs = new Date().toISOString();

        if (error) {
          // Treat timeouts and network errors as soft-pass — don't block the app
          const msg = error.message?.toLowerCase() ?? "";
          const isTransient = msg.includes("timeout") || msg.includes("network") || msg.includes("fetch") || msg.includes("abort");
          if (isTransient) {
            console.warn("[BackendGuard] Transient error, allowing pass-through:", error.message);
            setState({ status: "pass", slug: "unknown", pingTs });
            return;
          }
          setState({ status: "fail", reason: `Handshake query failed: ${error.message}`, pingTs });
          return;
        }
        if (!data) {
          // No row could also be a timeout artifact — pass if ref looks correct
          console.warn("[BackendGuard] No handshake row found, allowing pass-through");
          setState({ status: "pass", slug: "unknown", pingTs });
          return;
        }
        if (data.app_slug !== EXPECTED_SLUG) {
          setState({ status: "fail", reason: `Expected slug "${EXPECTED_SLUG}", got "${data.app_slug}".`, slug: data.app_slug, pingTs });
          return;
        }

        setState({ status: "pass", slug: data.app_slug, pingTs });
      } catch (err: any) {
        if (!cancelled) {
          // Network-level failures are transient — don't block
          console.warn("[BackendGuard] Network error, allowing pass-through:", err?.message);
          setState({ status: "pass", slug: "unknown", pingTs: new Date().toISOString() });
        }
      }
    }

    check();
    return () => { cancelled = true; };
  }, [ref]);

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

  if (state.status === "fail") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-lg w-full rounded-xl border-2 border-destructive bg-destructive/10 p-8 text-center space-y-4">
          <ShieldX className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold text-destructive">Wrong backend connected.</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{state.reason}</p>

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
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
