import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, UserRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Worker = {
  id: string;
  full_name: string;
  phone: string;
  service_types: string[];
  community: string | null;
  is_active: boolean;
};

interface AssignWorkerModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  booking: any;
  onAssigned?: (payload: { worker: Worker }) => void;
}

export function AssignWorkerModal({
  open, onOpenChange, booking, onAssigned
}: AssignWorkerModalProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const service = booking?.service_type;

  useEffect(() => {
    let active = true;
    
    const loadWorkers = async () => {
      if (!open || !service) return;
      
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("workers")
          .select("*")
          .eq("is_active", true);
          
        if (!active) return;
        
        if (error) {
          console.error("Error loading workers:", error);
          setWorkers([]);
          return;
        }
        
        setWorkers(data as Worker[]);
      } catch (err) {
        console.error("Error in loadWorkers:", err);
        setWorkers([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadWorkers();
    
    return () => {
      active = false;
    };
  }, [open, service]);

  const filteredWorkers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return workers
      .filter(w => w.service_types?.includes(service))
      .filter(w => {
        // Prefer same community if both are set
        if (booking?.community && w.community) {
          return w.community.toLowerCase() === booking.community.toLowerCase();
        }
        return true;
      })
      .filter(w =>
        !query || 
        w.full_name.toLowerCase().includes(query) || 
        (w.phone || "").includes(query)
      );
  }, [workers, searchQuery, service, booking]);

  const handleAssignWorker = async (worker: Worker) => {
    if (!booking) return;
    
    setSaving(true);
    try {
      // Create assignment row
      const { error: assignmentError } = await supabase
        .from("assignments")
        .insert({
          booking_id: booking.id,
          worker_id: worker.id,
          status: "assigned",
          notes: null
        });
        
      if (assignmentError) throw assignmentError;

      // Update booking status to assigned with confirmed_at timestamp
      const { error: bookingError } = await supabase
        .from("bookings")
        .update({ 
          status: "assigned", 
          confirmed_at: new Date().toISOString() 
        })
        .eq("id", booking.id);
        
      if (bookingError) throw bookingError;

      toast({ 
        title: "Worker assigned successfully!",
        description: `${worker.full_name} has been assigned to this booking.`
      });
      
      onAssigned?.({ worker });
      onOpenChange(false);
      setSearchQuery("");
    } catch (error: any) {
      console.error("Error assigning worker:", error);
      toast({ 
        title: "Failed to assign worker", 
        description: error.message || "An error occurred while assigning the worker.",
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Worker</DialogTitle>
          <DialogDescription>
            {service && `Service: ${service}`} 
            {booking?.community && ` • ${booking.community}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          
          {loading ? (
            <div className="h-24 flex items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading workers...
              </div>
            </div>
          ) : filteredWorkers.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              No matching workers found. Try adjusting your search or add more workers.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {filteredWorkers.map(worker => (
                <div key={worker.id} className="flex items-center justify-between rounded-xl border p-3 hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <UserRound className="h-5 w-5"/>
                    </div>
                    <div className="text-sm">
                      <div className="font-medium">{worker.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {worker.phone}
                        {worker.community && ` • ${worker.community}`}
                      </div>
                    </div>
                  </div>
                  <Button 
                    disabled={saving} 
                    onClick={() => handleAssignWorker(worker)}
                    size="sm"
                  >
                    {saving ? "Assigning..." : "Assign"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}