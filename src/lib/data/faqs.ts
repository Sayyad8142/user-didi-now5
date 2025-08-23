import { supabase } from "@/integrations/supabase/client";

export type FaqRow = {
  id: string;
  question: string;
  answer: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function getPublicFaqs(): Promise<FaqRow[]> {
  const { data, error } = await supabase
    .from("faqs")
    .select("id,question,answer,is_active,sort_order,created_at,updated_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("getPublicFaqs error", error);
    return [];
  }
  return data ?? [];
}

/** ADMIN */
export async function adminListFaqs(): Promise<FaqRow[]> {
  const { data, error } = await supabase
    .from("faqs")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function adminCreateFaq(input: Partial<FaqRow>) {
  const payload = {
    question: input.question ?? "",
    answer: input.answer ?? "",
    is_active: input.is_active ?? true,
    sort_order: input.sort_order ?? 100,
  };
  const { data, error } = await supabase.from("faqs").insert(payload).select().single();
  if (error) throw error;
  return data as FaqRow;
}

export async function adminUpdateFaq(id: string, patch: Partial<FaqRow>) {
  const { data, error } = await supabase
    .from("faqs")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as FaqRow;
}

export async function adminDeleteFaq(id: string) {
  const { error } = await supabase.from("faqs").delete().eq("id", id);
  if (error) throw error;
}