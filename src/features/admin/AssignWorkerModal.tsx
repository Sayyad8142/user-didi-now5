import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import SmartImage from "@/components/SmartImage";
import { Loader2, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { listWorkers, assignWorkerToBooking, Worker } from "@/features/admin/workers/api";

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
    if (!open || !service) return;
    
    const fetchWorkers = async () => {
      setLoading(true);
      try {
        const data = await listWorkers('', service);
        setWorkers(data.filter(w => w.is_active));
      } catch (error) {
        console.error('Error fetching workers:', error);
        toast({
          title: "Error",
          description: "Failed to load workers",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchWorkers();
  }, [open, service, toast]);

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

  const handleAssignWorker = async (workerId: string) => {
    if (!booking) return;
    
    setSaving(true);
    try {
      await assignWorkerToBooking(booking.id, workerId);

      const worker = workers.find(w => w.id === workerId);
      if (worker) {
        onAssigned?.({ worker });
      }

      toast({
        title: "Success",
        description: "Worker assigned successfully"
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error assigning worker:', error);
      toast({
        title: "Error",
        description: "Failed to assign worker",
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
                    <Avatar className="w-10 h-10">
                      {worker.photo_url ? (
                        <SmartImage
                          src={worker.photo_url}
                          bucket="worker-photos"
                          alt={worker.full_name}
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                          sizes="40px"
                        />
                      ) : (
                        <AvatarFallback>
                          <User className="w-5 h-5" />
                        </AvatarFallback>
                      )}
                    </Avatar>
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
                    onClick={() => handleAssignWorker(worker.id)}
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