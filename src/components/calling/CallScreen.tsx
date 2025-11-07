import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useCallTimer } from '@/hooks/useCallTimer';
import { createDailyCallClient, endDailyCall } from '@/utils/dailyClient';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DailyCall } from '@daily-co/daily-js';

interface CallScreenProps {
  rtcCallId: string;
  roomId: string;
  roomUrl: string;
  token: string;
  callerName: string;
  initialState?: 'dialing' | 'ringing' | 'active';
}

export const CallScreen: React.FC<CallScreenProps> = ({
  rtcCallId,
  roomId,
  roomUrl,
  token,
  callerName,
  initialState = 'dialing',
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [callState, setCallState] = useState<'dialing' | 'ringing' | 'active' | 'ended'>(initialState);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callFrame, setCallFrame] = useState<DailyCall | null>(null);
  const { formattedTime, reset } = useCallTimer(callState === 'active');

  useEffect(() => {
    let mounted = true;

    const initCall = async () => {
      try {
        const frame = await createDailyCallClient({
          roomUrl,
          token,
          userName: 'User',
        });

        if (!mounted) {
          endDailyCall(frame);
          return;
        }

        setCallFrame(frame);

        // Listen for participant events
        frame.on('participant-joined', (event) => {
          console.log('Participant joined:', event);
          if (event.participant.user_name !== 'User') {
            setCallState('active');
            reset();
          }
        });

        frame.on('participant-left', () => {
          console.log('Participant left');
          handleEndCall();
        });

        frame.on('error', (error) => {
          console.error('Daily error:', error);
          toast({
            title: 'Call Error',
            description: 'An error occurred during the call',
            variant: 'destructive',
          });
          handleEndCall();
        });

        // Auto transition to ringing after 2 seconds
        setTimeout(() => {
          if (mounted && callState === 'dialing') {
            setCallState('ringing');
          }
        }, 2000);
      } catch (error) {
        console.error('Failed to initialize call:', error);
        toast({
          title: 'Call Failed',
          description: 'Could not connect to the call',
          variant: 'destructive',
        });
        navigate(-1);
      }
    };

    initCall();

    return () => {
      mounted = false;
      if (callFrame) {
        endDailyCall(callFrame).catch(console.error);
      }
    };
  }, []);

  const handleEndCall = async () => {
    try {
      setCallState('ended');
      
      // End call on server
      await supabase.functions.invoke('end-rtc-call', {
        body: { rtc_call_id: rtcCallId },
      });

      // Cleanup Daily
      if (callFrame) {
        await endDailyCall(callFrame);
      }

      toast({
        title: 'Call Ended',
        description: 'The call has been ended',
      });

      navigate(-1);
    } catch (error) {
      console.error('Error ending call:', error);
      navigate(-1);
    }
  };

  const toggleMute = () => {
    if (callFrame) {
      callFrame.setLocalAudio(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleSpeaker = () => {
    // Note: Speaker toggle is mostly relevant for mobile devices
    setIsSpeakerOn(!isSpeakerOn);
    toast({
      title: isSpeakerOn ? 'Speaker Off' : 'Speaker On',
      description: isSpeakerOn ? 'Audio routing to earpiece' : 'Audio routing to speaker',
    });
  };

  const getStateText = () => {
    switch (callState) {
      case 'dialing':
        return 'Connecting...';
      case 'ringing':
        return 'Ringing...';
      case 'active':
        return formattedTime;
      case 'ended':
        return 'Call Ended';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/20 to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-8">
        {/* Call State */}
        <div className="text-center space-y-4">
          <div className="w-24 h-24 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Phone className="w-12 h-12 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">{callerName}</h2>
            <p className="text-muted-foreground mt-2">{getStateText()}</p>
          </div>
        </div>

        {/* Call Controls */}
        <div className="flex justify-center gap-4">
          <Button
            variant="outline"
            size="lg"
            className="rounded-full w-16 h-16"
            onClick={toggleMute}
            disabled={callState !== 'active'}
          >
            {isMuted ? (
              <MicOff className="w-6 h-6" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="rounded-full w-16 h-16"
            onClick={toggleSpeaker}
            disabled={callState !== 'active'}
          >
            {isSpeakerOn ? (
              <Volume2 className="w-6 h-6" />
            ) : (
              <VolumeX className="w-6 h-6" />
            )}
          </Button>

          <Button
            variant="destructive"
            size="lg"
            className="rounded-full w-16 h-16"
            onClick={handleEndCall}
          >
            <PhoneOff className="w-6 h-6" />
          </Button>
        </div>

        {/* Status Messages */}
        {callState === 'dialing' && (
          <p className="text-center text-sm text-muted-foreground">
            Establishing secure connection...
          </p>
        )}
        {callState === 'ringing' && (
          <p className="text-center text-sm text-muted-foreground">
            Waiting for {callerName} to answer...
          </p>
        )}
      </Card>
    </div>
  );
};
