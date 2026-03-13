import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { CustomModelData, FactorConfig } from "@/lib/model-factors";
import { toast } from "@/hooks/use-toast";

export interface CustomModel {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  sport: string;
  market_type: string;
  target_output: string;
  factors: FactorConfig[];
  is_active: boolean;
  is_default: boolean;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useCustomModels() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["custom-models", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_models" as any)
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CustomModel[];
    },
    enabled: !!user,
  });
}

export function useSaveModel() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (model: CustomModelData & { id?: string }) => {
      if (!user) throw new Error("Not authenticated");

      const payload = {
        user_id: user.id,
        name: model.name,
        description: model.description || null,
        sport: model.sport,
        market_type: model.market_type,
        target_output: model.target_output,
        factors: model.factors as any,
        tags: model.tags,
        notes: model.notes || null,
        updated_at: new Date().toISOString(),
      };

      if (model.id) {
        const { error } = await supabase
          .from("custom_models" as any)
          .update(payload)
          .eq("id", model.id);
        if (error) throw error;
        return model.id;
      } else {
        const { data, error } = await supabase
          .from("custom_models" as any)
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        return (data as any).id as string;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-models"] });
      toast({ title: "Model saved" });
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_models" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-models"] });
      toast({ title: "Model deleted" });
    },
  });
}

export function useToggleModelActive() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("custom_models" as any)
        .update({ is_active, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-models"] });
    },
  });
}

export function useDuplicateModel() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (source: CustomModel) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("custom_models" as any).insert({
        user_id: user.id,
        name: `${source.name} (copy)`,
        description: source.description,
        sport: source.sport,
        market_type: source.market_type,
        target_output: source.target_output,
        factors: source.factors as any,
        tags: source.tags,
        notes: source.notes,
        is_active: false,
        is_default: false,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-models"] });
      toast({ title: "Model duplicated" });
    },
  });
}
