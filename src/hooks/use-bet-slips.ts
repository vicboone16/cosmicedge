import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export function useBetSlips() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: slips, isLoading } = useQuery({
    queryKey: ["bet-slips", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("bet_slips")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const { data: picksMap } = useQuery({
    queryKey: ["bet-slip-picks", slips?.map(s => s.id).join(",")],
    queryFn: async () => {
      if (!slips?.length) return {};
      const slipIds = slips.map(s => s.id);
      const { data, error } = await supabase
        .from("bet_slip_picks")
        .select("*")
        .in("slip_id", slipIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const map: Record<string, any[]> = {};
      data?.forEach(p => {
        if (!map[p.slip_id]) map[p.slip_id] = [];
        map[p.slip_id].push(p);
      });
      return map;
    },
    enabled: (slips?.length ?? 0) > 0,
    refetchInterval: 30_000,
  });

  const importSlip = useMutation({
    mutationFn: async (params: {
      mode: "link" | "screenshot" | "manual";
      url?: string;
      image_base64?: string;
      manual_picks?: any[];
      book?: string;
      entry_type?: string;
      stake?: number;
      payout?: number;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");

      const res = await supabase.functions.invoke("parse-bet-slip", {
        body: params,
      });

      if (res.error) throw new Error(res.error.message || "Import failed");
      if (!res.data?.ok) throw new Error(res.data?.error || "Import failed");
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["bet-slips"] });
      queryClient.invalidateQueries({ queryKey: ["bet-slip-picks"] });
      toast({
        title: "Slip imported!",
        description: `${data.picks_count} pick(s) extracted`,
      });
    },
    onError: (e: any) => {
      toast({
        title: "Import failed",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const deleteSlip = useMutation({
    mutationFn: async (slipId: string) => {
      const { error } = await supabase.from("bet_slips").delete().eq("id", slipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bet-slips"] });
      queryClient.invalidateQueries({ queryKey: ["bet-slip-picks"] });
      toast({ title: "Slip deleted" });
    },
  });

  return { slips, picksMap, isLoading, importSlip, deleteSlip };
}
