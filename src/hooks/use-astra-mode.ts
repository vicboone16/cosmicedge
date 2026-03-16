import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AstraMode = "sharp" | "cosmic" | "sniper" | "hedge" | "shadow" | "ritual";

export interface AstraModeConfig {
  mode_key: string;
  mode_name: string;
  description: string;
  icon_name: string;
  color_accent: string;
  sort_order: number;
}

export function useAstraMode() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: modes } = useQuery({
    queryKey: ["astra-modes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("astra_operating_modes")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      return (data || []) as AstraModeConfig[];
    },
    staleTime: 60_000,
  });

  const { data: userPref } = useQuery({
    queryKey: ["astra-mode-pref", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("user_astra_mode_preferences")
        .select("mode_key")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.mode_key as AstraMode | null;
    },
    enabled: !!user?.id,
  });

  const activeMode: AstraMode = (userPref as AstraMode) || "cosmic";

  const setMode = useCallback(async (mode: AstraMode) => {
    if (!user?.id) return;
    await supabase
      .from("user_astra_mode_preferences")
      .upsert({ user_id: user.id, mode_key: mode, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    qc.invalidateQueries({ queryKey: ["astra-mode-pref"] });
  }, [user?.id, qc]);

  const activeModeConfig = modes?.find(m => m.mode_key === activeMode) || null;

  return { modes: modes || [], activeMode, activeModeConfig, setMode };
}
