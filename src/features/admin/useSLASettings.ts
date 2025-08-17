import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSLASettings() {
  const [slaMinutes, setSlaMinutes] = useState<number>(12);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    let active = true;
    
    const loadSLASettings = async () => {
      try {
        const { data, error } = await supabase
          .from("ops_settings")
          .select("key, value")
          .in("key", ["pending_sla_minutes"]);
          
        if (!active) return;
        
        if (!error && data && data.length > 0) {
          const slaRow = data.find(r => r.key === "pending_sla_minutes");
          const minutes = slaRow ? parseInt(slaRow.value, 10) : NaN;
          if (!isNaN(minutes)) {
            setSlaMinutes(minutes);
          }
        }
      } catch (err) {
        console.error("Error loading SLA settings:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadSLASettings();
    
    return () => {
      active = false;
    };
  }, []);
  
  return { slaMinutes, loading };
}