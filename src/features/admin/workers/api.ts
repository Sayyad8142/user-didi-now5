import { supabase } from "@/integrations/supabase/client";

export interface Worker {
  id: string;
  full_name: string;
  phone: string;
  upi_id: string;
  photo_url?: string | null;
  service_types: string[];
  community?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listWorkers(query: string = '', serviceType?: string): Promise<Worker[]> {
  let supabaseQuery = supabase
    .from('workers')
    .select('*')
    .order('created_at', { ascending: false });

  if (query) {
    supabaseQuery = supabaseQuery.or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`);
  }

  if (serviceType) {
    supabaseQuery = supabaseQuery.contains('service_types', [serviceType]);
  }

  const { data, error } = await supabaseQuery;
  if (error) throw error;
  return (data ?? []) as Worker[];
}

export async function upsertWorker(payload: Omit<Worker, 'created_at' | 'updated_at'> & { id?: string }): Promise<Worker> {
  const { data, error } = await supabase
    .from('workers')
    .upsert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as Worker;
}

export async function deleteWorker(id: string): Promise<void> {
  const { error } = await supabase
    .from('workers')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function uploadWorkerPhoto(file: File): Promise<string> {
  const path = `w_${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
  const { error } = await supabase.storage
    .from('worker-photos')
    .upload(path, file, { 
      upsert: false, 
      cacheControl: '3600' 
    });
  
  if (error) throw error;
  
  const { data: pub } = supabase.storage
    .from('worker-photos')
    .getPublicUrl(path);
  
  return pub.publicUrl;
}

export async function assignWorkerToBooking(bookingId: string, workerId: string): Promise<void> {
  const { error } = await supabase.rpc('assign_worker_to_booking', {
    p_booking_id: bookingId,
    p_worker_id: workerId
  });
  if (error) throw error;
}