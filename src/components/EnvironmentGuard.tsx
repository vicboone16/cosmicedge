/**
 * EnvironmentGuard — pass-through wrapper (guards removed).
 */
import { createContext, useContext, type ReactNode } from "react";

interface EnvGuardCtx {
  isMismatched: boolean;
  detectedRef: string;
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

export function EnvironmentGuard({ children }: { children: ReactNode }) {
  return (
    <EnvironmentGuardContext.Provider value={{ isMismatched: false, detectedRef: "", isLive: true }}>
      {children}
    </EnvironmentGuardContext.Provider>
  );
}
