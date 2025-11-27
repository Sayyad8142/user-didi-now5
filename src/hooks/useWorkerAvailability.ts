import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ServiceAvailability {
  service: string;
  count: number;
}

export function useWorkerAvailability() {
  const [availability, setAvailability] = useState<ServiceAvailability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAvailability() {
      try {
        setLoading(true);
        
        // Fetch all active workers
        const { data: workers, error } = await supabase
          .from('workers')
          .select('service_types, is_active')
          .eq('is_active', true);

        if (error) throw error;

        // Count workers by service type
        const serviceCounts: Record<string, number> = {
          maid: 0,
          cook: 0,
          bathroom_cleaning: 0,
        };

        workers?.forEach((worker) => {
          const services = worker.service_types || [];
          services.forEach((service: string) => {
            if (service in serviceCounts) {
              serviceCounts[service]++;
            }
          });
        });

        // Convert to array format
        const availabilityData: ServiceAvailability[] = Object.entries(serviceCounts).map(
          ([service, count]) => ({
            service,
            count,
          })
        );

        setAvailability(availabilityData);
      } catch (error) {
        console.error('Error fetching worker availability:', error);
        setAvailability([]);
      } finally {
        setLoading(false);
      }
    }

    fetchAvailability();

    // Set up realtime subscription for workers table
    const channel = supabase
      .channel('worker-availability-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workers',
        },
        () => {
          fetchAvailability();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { availability, loading };
}
