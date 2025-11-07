import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Phone, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

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

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);

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
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Phone className="w-4 h-4" />
          Call History
        </h3>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </Card>
    );
  }

  if (calls.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Phone className="w-4 h-4" />
          Call History
        </h3>
        <p className="text-sm text-muted-foreground">No calls yet</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Phone className="w-4 h-4" />
        Call History
      </h3>
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
    </Card>
  );
};
