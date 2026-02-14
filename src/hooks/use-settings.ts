import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface UserSettings {
  stat_weight: number;
  market_weight: number;
  astro_weight: number;
  void_of_course: boolean;
  combustion: boolean;
  retrograde: boolean;
  reception_dignity: boolean;
  house_system: string;
  orb_size: string;
  travel_factors: boolean;
  astrocartography: boolean;
}

const DEFAULTS: UserSettings = {
  stat_weight: 40,
  market_weight: 35,
  astro_weight: 25,
  void_of_course: true,
  combustion: true,
  retrograde: true,
  reception_dignity: true,
  house_system: "Placidus",
  orb_size: "standard",
  travel_factors: true,
  astrocartography: true,
};

export function useSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["user-settings", user?.id],
    queryFn: async () => {
      if (!user) return DEFAULTS;
      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) return DEFAULTS;
      return {
        stat_weight: data.stat_weight,
        market_weight: data.market_weight,
        astro_weight: data.astro_weight,
        void_of_course: data.void_of_course,
        combustion: data.combustion,
        retrograde: data.retrograde,
        reception_dignity: data.reception_dignity,
        house_system: data.house_system,
        orb_size: data.orb_size,
        travel_factors: data.travel_factors,
        astrocartography: data.astrocartography,
      } as UserSettings;
    },
    enabled: !!user,
  });

  const updateSettings = useMutation({
    mutationFn: async (patch: Partial<UserSettings>) => {
      if (!user) return;
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, ...patch } as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  return { settings: settings ?? DEFAULTS, isLoading, updateSettings };
}
