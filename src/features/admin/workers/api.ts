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

export type UpsertWorkerInput = {
  full_name: string;
  phone: string;
  upi_id: string;
  service_types: string[];
  community?: string;
  photo_url?: string | null;
  is_active?: boolean;
};

export async function adminUpsertWorker(input: UpsertWorkerInput): Promise<Worker> {
  // Normalize service types to backend values
  const svc = (input.service_types || []).map(s => {
    if (s.toLowerCase() === 'bathroom' || s === 'bathroomCleaning' || s === 'bathroom_cleaning') return 'bathroom_cleaning';
    return s.toLowerCase();
  });

  const payload = {
    full_name: input.full_name,
    phone: input.phone,
    upi_id: input.upi_id,
    service_types: svc,
    community: input.community ?? null,
    photo_url: input.photo_url ?? null,
    is_active: input.is_active ?? true,
  };

  const { data, error } = await supabase.rpc('admin_upsert_worker', {
    p_full_name: input.full_name,
    p_phone: input.phone,
    p_upi_id: input.upi_id,
    p_service_types: svc,
    p_community: input.community ?? null,
    p_photo_url: input.photo_url ?? null,
    p_is_active: input.is_active ?? true,
  });

  if (error) throw error;
  return data as Worker;
}

// Keep the old function for backward compatibility but mark deprecated
export async function upsertWorker(payload: Omit<Worker, 'created_at' | 'updated_at'> & { id?: string }): Promise<Worker> {
  return adminUpsertWorker({
    full_name: payload.full_name,
    phone: payload.phone,
    upi_id: payload.upi_id,
    service_types: payload.service_types,
    community: payload.community ?? undefined,
    photo_url: payload.photo_url,
    is_active: payload.is_active
  });
}

export async function deleteWorker(id: string): Promise<void> {
  const { error } = await supabase
    .from('workers')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function uploadWorkerPhoto(file: File): Promise<string> {
  try {
    console.log('Starting photo upload for file:', file.name, 'size:', file.size);
    
    const filename = file.name.replace(/\s+/g, '_');
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    console.log('Calling edge function with payload size:', base64.length);

    const { data, error } = await supabase.functions.invoke('admin-upload-worker-photo', {
      body: {
        filename,
        contentType: file.type,
        base64,
      },
    });

    console.log('Edge function response:', { data, error });

    if (error) {
      console.error('Edge function error:', error);
      throw new Error(error.message || 'Upload failed');
    }
    
    if (!data?.url) {
      console.error('No URL in response:', data);
      throw new Error('No URL returned from upload');
    }

    console.log('Upload successful, URL:', data.url);
    return data.url;
  } catch (err) {
    console.error('Upload error:', err);
    throw err;
  }
}

export async function assignWorkerToBooking(bookingId: string, workerId: string): Promise<void> {
  const { error } = await supabase.rpc('assign_worker_to_booking', {
    p_booking_id: bookingId,
    p_worker_id: workerId
  });
  if (error) throw error;
}