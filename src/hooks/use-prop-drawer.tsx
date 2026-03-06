import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { PropIntelligenceDrawer } from "@/components/prop-drawer/PropIntelligenceDrawer";
import type { TopProp } from "@/hooks/use-top-props";

interface PropDrawerCtx {
  openProp: (prop: TopProp) => void;
}

const Ctx = createContext<PropDrawerCtx>({ openProp: () => {} });

export function usePropDrawer() {
  return useContext(Ctx);
}

export function PropDrawerProvider({ children }: { children: ReactNode }) {
  const [prop, setProp] = useState<TopProp | null>(null);
  const [open, setOpen] = useState(false);

  const openProp = useCallback((p: TopProp) => {
    setProp(p);
    setOpen(true);
  }, []);

  return (
    <Ctx.Provider value={{ openProp }}>
      {children}
      <PropIntelligenceDrawer prop={prop} open={open} onOpenChange={setOpen} />
    </Ctx.Provider>
  );
}
