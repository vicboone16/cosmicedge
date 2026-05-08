import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AstraMode = "pra_sniper" | "sharp" | "cosmic" | "sniper" | "hedge" | "shadow" | "ritual";

export interface AstraModeConfig {
  mode_key: string;
  mode_name: string;
  description: string;
  icon_name: string;
  color_accent: string;
  sort_order: number;
}

const STORAGE_KEY = "cosmicedge_astra_mode";
const DEFAULT_MODE: AstraMode = "pra_sniper";

function readStoredMode(): AstraMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as AstraMode) || DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function useAstraMode() {
  const { user } = useAuth();

  // Local state is the single source of truth for the UI.
  // Initialized from localStorage so mode survives navigation without a DB round-trip.
  const [activeMode, setActiveModeState] = useState<AstraMode>(readStoredMode);

  // Fetch the list of available mode configs (labels, colors, etc.)
  const { data: modes } = useQuery({
    queryKey: ["astra-modes"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("astra_operating_modes")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      return (data || []) as AstraModeConfig[];
    },
    staleTime: 60_000,
  });

  // Fetch user's DB-saved preference once on mount (sync-down only)
  const { data: userPref } = useQuery({
    queryKey: ["astra-mode-pref", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await (supabase as any)
        .from("user_astra_mode_preferences")
        .select("mode_key")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data?.mode_key as AstraMode) ?? null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });

  // When the DB preference loads, sync it into local state once
  useEffect(() => {
    if (userPref) {
      setActiveModeState(userPref);
      try { localStorage.setItem(STORAGE_KEY, userPref); } catch { /* ignore */ }
    }
  }, [userPref]);

  const setMode = useCallback(async (mode: AstraMode) => {
    // 1. Immediate UI update — button turns gold NOW, no network wait
    setActiveModeState(mode);

    // 2. Persist to localStorage so it survives page navigation
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }

    // 3. Non-blocking async DB sync — failure is non-fatal (local state is authoritative)
    if (!user?.id) return;
    try {
      await (supabase as any)
        .from("user_astra_mode_preferences")
        .upsert(
          { user_id: user.id, mode_key: mode, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
    } catch (e) {
      // DB sync failed — mode is still set correctly in local state + localStorage
      console.warn("[useAstraMode] DB sync failed, mode persisted locally only:", e);
    }
  }, [user?.id]);

  const activeModeConfig = modes?.find(m => m.mode_key === activeMode) ?? null;

  return { modes: modes || [], activeMode, activeModeConfig, setMode };
}
