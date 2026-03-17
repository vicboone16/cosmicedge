import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface NotificationPreferences {
  game_start: boolean;
  score_changes: boolean;
  lead_changes: boolean;
  tracked_prop_hit: boolean;
  tracked_prop_danger: boolean;
  slip_updates: boolean;
  live_opportunities: boolean;
  model_edge_alerts: boolean;
  quiet_mode: boolean;
  throttle_minutes: number;
}

const DEFAULTS: NotificationPreferences = {
  game_start: true,
  score_changes: false,
  lead_changes: false,
  tracked_prop_hit: true,
  tracked_prop_danger: true,
  slip_updates: true,
  live_opportunities: false,
  model_edge_alerts: false,
  quiet_mode: false,
  throttle_minutes: 5,
};

export function useNotificationPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-prefs", user?.id],
    queryFn: async () => {
      if (!user) return DEFAULTS;
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) return DEFAULTS;
      return {
        game_start: data.game_start,
        score_changes: data.score_changes,
        lead_changes: data.lead_changes,
        tracked_prop_hit: data.tracked_prop_hit,
        tracked_prop_danger: data.tracked_prop_danger,
        slip_updates: data.slip_updates,
        live_opportunities: data.live_opportunities,
        model_edge_alerts: data.model_edge_alerts,
        quiet_mode: data.quiet_mode,
        throttle_minutes: data.throttle_minutes,
      } as NotificationPreferences;
    },
    enabled: !!user,
  });

  const updatePrefs = useMutation({
    mutationFn: async (patch: Partial<NotificationPreferences>) => {
      if (!user) return;
      const { error } = await supabase
        .from("notification_preferences")
        .upsert(
          { user_id: user.id, ...patch, updated_at: new Date().toISOString() } as any,
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-prefs"] });
    },
  });

  return { prefs: prefs ?? DEFAULTS, isLoading, updatePrefs };
}
