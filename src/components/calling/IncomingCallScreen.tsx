import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Phone, PhoneOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface IncomingCallScreenProps {
  rtcCallId: string;
  callerName: string;
  onDismiss: () => void;
}

export const IncomingCallScreen: React.FC<IncomingCallScreenProps> = ({
  rtcCallId,
  callerName,
  onDismiss,
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);

  // Vibration pattern: [vibrate, pause, vibrate, pause, ...]
  useEffect(() => {
    const vibratePattern = [200, 100, 200, 100, 200];
    
    // Start vibration
    if ('vibrate' in navigator) {
      const vibrateInterval = setInterval(() => {
        navigator.vibrate(vibratePattern);
      }, 1000);

      return () => {
        clearInterval(vibrateInterval);
        navigator.vibrate(0); // Stop vibration
      };
    }
  }, []);

  const handleAccept = async () => {
    setIsProcessing(true);
    try {
      console.log('📞 Accepting call:', rtcCallId);
      const { data, error } = await supabase.functions.invoke('accept-rtc-call', {
        body: { rtc_call_id: rtcCallId },
      });

      if (error) {
        console.error('📞 Accept call error:', error);
        throw error;
      }

      console.log('📞 Accept call response:', data);

      if (data?.success && data?.room_url && data?.callee_token) {
        // Navigate to call screen with room_url and callee_token
        navigate('/call', {
          state: {
            rtcCallId,
            roomId: data.room_id,
            roomUrl: data.room_url,
            token: data.callee_token,
            callerName,
            initialState: 'active',
          },
        });
        onDismiss();
      } else {
        throw new Error(data?.error || 'Failed to accept call');
      }
    } catch (error) {
      console.error('📞 Error accepting call:', error);
      toast({
        title: 'Call Failed',
        description: 'Could not accept the call. Please try again.',
        variant: 'destructive',
      });
      onDismiss();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await supabase.functions.invoke('end-rtc-call', {
        body: { rtc_call_id: rtcCallId },
      });

      toast({
        title: 'Call Rejected',
        description: 'You rejected the incoming call',
      });
      onDismiss();
    } catch (error) {
      console.error('Error rejecting call:', error);
      onDismiss();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        {/* Caller Info */}
        <div className="text-center space-y-4">
          {/* Ripple effect container */}
          <div className="relative w-24 h-24 mx-auto">
            {/* Ripple rings */}
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-[ping_1.5s_ease-in-out_infinite]" />
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-[ping_1.5s_ease-in-out_infinite_0.5s]" />
            
            {/* Phone icon with ringing animation */}
            <div className="relative w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center animate-ring">
              <Phone className="w-12 h-12 text-primary" />
            </div>
          </div>
          
          <div>
            <p className="text-sm text-muted-foreground">Incoming Call</p>
            <h2 className="text-2xl font-bold mt-1">{callerName}</h2>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-8">
          <Button
            variant="destructive"
            size="lg"
            className="rounded-full w-16 h-16"
            onClick={handleReject}
            disabled={isProcessing}
          >
            <PhoneOff className="w-6 h-6" />
          </Button>

          <Button
            variant="default"
            size="lg"
            className="rounded-full w-16 h-16 bg-green-500 hover:bg-green-600"
            onClick={handleAccept}
            disabled={isProcessing}
          >
            <Phone className="w-6 h-6" />
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Free VoIP Call
        </p>
      </Card>
    </div>
  );
};
