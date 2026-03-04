/**
 * BackendGuard — pass-through wrapper (guards removed).
 * v2 — force redeploy
 */
import type { ReactNode } from "react";

export function BackendGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
