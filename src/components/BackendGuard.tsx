/**
 * BackendGuard — pass-through wrapper (guards removed).
 */
import type { ReactNode } from "react";

export function BackendGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
