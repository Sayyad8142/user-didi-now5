import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type HistoryRow = {
  id: string;
  from_status: string | null;
  to_status: string | null;
  changed_by: string | null;
  created_at: string;
  note: string | null;
};

interface HistoryListProps {
  bookingId: string;
}

export function HistoryList({ bookingId }: HistoryListProps) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    
    const fetchHistory = async () => {
      try {
        const { data, error } = await supabase
          .from("booking_status_history")
          .select("id, from_status, to_status, changed_by, created_at, note")
          .eq("booking_id", bookingId)
          .order("created_at", { ascending: false })
          .limit(10);
        
        if (error) {
          console.error("Error fetching booking history:", error);
          return;
        }
        
        if (!active) return;
        setRows(data ?? []);
      } catch (err) {
        console.error("Error in fetchHistory:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchHistory();
    
    return () => {
      active = false;
    };
  }, [bookingId]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading history…</div>;
  }
  
  if (!rows.length) {
    return <div className="text-sm text-muted-foreground">No status updates yet</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="flex items-start gap-3">
          <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0" />
          <div className="flex-1 text-sm">
            <div className="font-medium">
              {row.from_status ?? "—"} → {row.to_status ?? "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(row.created_at).toLocaleString()}
              {row.note && ` • ${row.note}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}