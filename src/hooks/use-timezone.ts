import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format as dateFnsFormat } from "date-fns";

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function useTimezone() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile-timezone", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const userTimezone = profile?.timezone || browserTimezone;

  const updateTimezone = useMutation({
    mutationFn: async (tz: string) => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .upsert({ user_id: user.id, timezone: tz }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-timezone"] });
    },
  });

  /** Format a date/ISO string in the user's timezone */
  function formatInUserTZ(date: string | Date, formatStr: string = "h:mm a"): string {
    const d = typeof date === "string" ? new Date(date) : date;
    try {
      return d.toLocaleString("en-US", {
        timeZone: userTimezone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return dateFnsFormat(d, formatStr);
    }
  }

  /** Get the short timezone abbreviation */
  function getTZAbbrev(): string {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: userTimezone,
        timeZoneName: "short",
      }).formatToParts(new Date());
      return parts.find(p => p.type === "timeZoneName")?.value || "";
    } catch {
      return "";
    }
  }

  /** Convert a date to the user's timezone and return the Date-like hours */
  function getHoursInUserTZ(date: string | Date): number {
    const d = typeof date === "string" ? new Date(date) : date;
    const str = d.toLocaleString("en-US", { timeZone: userTimezone, hour: "numeric", hour12: false });
    return parseInt(str, 10);
  }

  return {
    userTimezone,
    browserTimezone,
    formatInUserTZ,
    getTZAbbrev,
    getHoursInUserTZ,
    updateTimezone,
  };
}
