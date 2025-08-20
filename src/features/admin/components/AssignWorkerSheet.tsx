import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Search, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Link } from "react-router-dom";

interface Worker {
  id: string;
  full_name: string;
  phone: string;
  photo_url?: string | null;
  service_types: string[];
  community?: string | null;
  is_active: boolean;
}

interface AssignWorkerSheetProps {
  open: boolean;
  onClose: () => void;
  booking: any;
  onWorkerAssigned: (worker: Worker) => void;
}

export function AssignWorkerSheet({ 
  open, 
  onClose, 
  booking, 
  onWorkerAssigned 
}: AssignWorkerSheetProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [sameCommunity, setSameCommunity] = useState(false);
  const [sameService, setSameService] = useState(false);
  const { toast } = useToast();

  // Fetch workers when sheet opens
  useEffect(() => {
    if (!open) return;
    
    const fetchWorkers = async () => {
      setLoading(true);
      try {
        console.log('Fetching workers...');
        const { data, error } = await supabaseAdmin
          .from('workers')
          .select('*')
          .eq('is_active', true)
          .order('full_name');
        
        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }
        
        console.log('Workers fetched:', data?.length || 0);
        setWorkers(data || []);
      } catch (error) {
        console.error('Error fetching workers:', error);
        toast({
          title: "Error",
          description: "Failed to load workers. Please try again.",
          variant: "destructive"
        });
        setWorkers([]); // Set empty array on error
      } finally {
        setLoading(false);
      }
    };

    fetchWorkers();
  }, [open, toast]);

  // Reset filters when sheet opens
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSameCommunity(false);
      setSameService(false);
    }
  }, [open]);

  const filteredWorkers = useMemo(() => {
    let filtered = workers;

    // Filter by service type
    if (sameService && booking?.service_type) {
      filtered = filtered.filter(worker => 
        worker.service_types?.includes(booking.service_type)
      );
    }

    // Filter by community
    if (sameCommunity && booking?.community) {
      filtered = filtered.filter(worker => 
        worker.community?.toLowerCase() === booking.community?.toLowerCase()
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(worker =>
        worker.full_name.toLowerCase().includes(query) ||
        worker.phone.includes(query)
      );
    }

    return filtered.sort((a, b) => {
      // Prioritize workers from same community
      if (booking?.community) {
        const aMatch = a.community?.toLowerCase() === booking.community?.toLowerCase();
        const bMatch = b.community?.toLowerCase() === booking.community?.toLowerCase();
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
      }
      return a.full_name.localeCompare(b.full_name);
    });
  }, [workers, searchQuery, sameCommunity, sameService, booking]);

  const handleAssignWorker = async (worker: Worker) => {
    if (!booking?.id) return;
    
    setAssigning(worker.id);
    try {
      const { data, error } = await supabaseAdmin.rpc('assign_worker_to_booking', {
        p_booking_id: booking.id,
        p_worker_id: worker.id,
        p_assigned_by: null // Use the 3-parameter version to avoid ambiguity
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `${worker.full_name} has been assigned to this booking`
      });

      onWorkerAssigned(worker);
    } catch (error: any) {
      console.error('Error assigning worker:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to assign worker",
        variant: "destructive"
      });
    } finally {
      setAssigning(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        className="h-[92svh] rounded-t-3xl p-0 flex flex-col"
      >
        <SheetHeader className="p-4 pb-3 border-b border-slate-100">
          <SheetTitle className="text-left text-lg font-semibold">Assign Worker</SheetTitle>
          {booking && (
            <div className="text-sm text-slate-600">
              {booking.service_type && `Service: ${booking.service_type}`}
              {booking.community && ` • ${booking.community}`}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-4 pb-2">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
              <Input
                placeholder="Search by name or phone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-11 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white transition-colors"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="px-4 pb-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <Button
                variant={sameService ? "default" : "outline"}
                size="sm"
                onClick={() => setSameService(!sameService)}
                className="rounded-full text-xs px-4 flex-shrink-0"
              >
                This Service
              </Button>
              {booking?.community && (
                <Button
                  variant={sameCommunity ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSameCommunity(!sameCommunity)}
                  className="rounded-full text-xs px-4 flex-shrink-0"
                >
                  Same Community
                </Button>
              )}
            </div>
          </div>

          {/* Workers List */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading workers...
                </div>
              </div>
            ) : filteredWorkers.length === 0 ? (
              <div className="p-4">
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <User className="h-6 w-6 text-slate-400" />
                  </div>
                  <h3 className="font-medium text-slate-900 mb-2">
                    No workers found
                  </h3>
                  <p className="text-sm text-slate-500 mb-4">
                    {workers.length === 0 
                      ? "No workers have been added yet."
                      : "Try adjusting your search or filters."
                    }
                  </p>
                  <Link 
                    to="/admin/settings#workers"
                    onClick={onClose}
                  >
                    <Button variant="outline" className="rounded-full">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Worker
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-3 pb-24">
                {filteredWorkers.map(worker => (
                  <div 
                    key={worker.id} 
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors bg-white"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="w-10 h-10 flex-shrink-0">
                        <AvatarImage src={worker.photo_url || undefined} />
                        <AvatarFallback className="bg-slate-100 text-slate-600 font-medium">
                          {worker.full_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900 truncate">
                          {worker.full_name}
                        </div>
                        <div className="text-sm text-slate-500 flex items-center gap-2">
                          <span>{worker.phone}</span>
                          {worker.community && (
                            <>
                              <span>•</span>
                              <span className="truncate">{worker.community}</span>
                            </>
                          )}
                        </div>
                        {worker.service_types && worker.service_types.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {worker.service_types.slice(0, 2).map((service, idx) => (
                              <Badge 
                                key={idx} 
                                variant="secondary" 
                                className="text-xs px-2 py-0"
                              >
                                {service}
                              </Badge>
                            ))}
                            {worker.service_types.length > 2 && (
                              <Badge variant="secondary" className="text-xs px-2 py-0">
                                +{worker.service_types.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button 
                      size="sm"
                      className="rounded-xl bg-pink-600 hover:bg-pink-700 text-white ml-3 h-10 px-4"
                      onClick={() => handleAssignWorker(worker)}
                      disabled={assigning === worker.id}
                    >
                      {assigning === worker.id ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          Assigning...
                        </>
                      ) : (
                        'Assign'
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sticky bottom close button */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-100 p-4 safe-bottom">
          <Button variant="outline" className="w-full h-11 rounded-xl" onClick={onClose}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}