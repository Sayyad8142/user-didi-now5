import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Phone, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { auth as firebaseAuth } from '@/lib/firebase';
import { format } from 'date-fns';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface CallHistoryProps {
  bookingId: string;
}

interface CallRecord {
  id: string;
  created_at: string;
  duration_sec: number | null;
  status: string;
  caller_id: string;
}

export const CallHistory: React.FC<CallHistoryProps> = ({ bookingId }) => {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        const user = firebaseAuth.currentUser;
        setCurrentUserId(user?.uid || null);

        const { data, error } = await supabase
          .from('rtc_calls')
          .select('*')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setCalls(data || []);
      } catch (error) {
        console.error('Error fetching call history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCalls();

    // Listen for new calls
    const channel = supabase
      .channel(`call-history-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rtc_calls',
          filter: `booking_id=eq.${bookingId}`,
        },
        () => {
          fetchCalls();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookingId]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'Not connected';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Call History
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mt-3">Loading...</p>
      </Card>
    );
  }

  if (calls.length === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Call History
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mt-3">No calls yet</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full hover:opacity-70 transition-opacity">
          <h3 className="font-semibold flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Call History
          </h3>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="space-y-3">
            {calls.map((call) => (
              <div
                key={call.id}
                className="flex items-center justify-between text-sm border-b pb-2 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <Phone className="w-3 h-3 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {call.caller_id === currentUserId ? 'You called' : 'Incoming call'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(call.created_at), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(call.duration_sec)}
                  </p>
                  <p className="text-xs capitalize">{call.status}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
