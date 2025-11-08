import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useCallTimer } from '@/hooks/useCallTimer';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toast } from 'sonner';

interface CallScreenProps {
  rtcCallId: string;
  roomUrl: string;
  token: string;
  callerName: string;
  initialState?: 'dialing' | 'ringing' | 'active';
}

export const CallScreen: React.FC<CallScreenProps> = ({
  rtcCallId,
  roomUrl,
  token,
  callerName,
  initialState = 'dialing',
}) => {
  const navigate = useNavigate();
  const { toast: toastHook } = useToast();
  const [callState, setCallState] = useState<'dialing' | 'ringing' | 'active' | 'ended'>(initialState);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const dailyRef = useRef<DailyCall | null>(null);
  const { formattedTime, reset } = useCallTimer(callState === 'active');
  const isInitializing = useRef(false);

  useEffect(() => {
    let mounted = true;

    const initCall = async () => {
      // Prevent duplicate initialization
      if (isInitializing.current || dailyRef.current) {
        console.log('[VoIP] Already initializing or initialized, skipping');
        return;
      }
      isInitializing.current = true;

      // Guard: make failures obvious in logs
      if (!roomUrl || !token) {
        console.error('[VoIP] Missing roomUrl or token', { roomUrl, token: !!token });
        toast.error('Call Failed: missing credentials');
        navigate(-1);
        return;
      }

      try {
        // Create Daily client
        dailyRef.current = DailyIframe.createCallObject({
          subscribeToTracksAutomatically: true,
        });

        if (!mounted) {
          dailyRef.current.destroy();
          isInitializing.current = false;
          return;
        }

        // Listen for participant events
        dailyRef.current.on('participant-joined', (event: any) => {
          console.log('📞 Participant joined:', event);
          if (event.participant.user_name !== 'User') {
            setCallState('active');
            reset();
          }
        });

        dailyRef.current.on('participant-left', (event: any) => {
          console.log('📞 Participant left:', event);
          handleEndCall();
        });

        dailyRef.current.on('joined-meeting', () => {
          console.log('[VoIP] Caller joined');
        });

        dailyRef.current.on('left-meeting', () => {
          console.log('[VoIP] Caller left');
          handleEndCall();
        });

        dailyRef.current.on('error', (e: any) => {
          console.error('[VoIP] Daily error', e);
          toast.error(`Call Failed: ${e?.errorMsg || 'Could not connect'}`);
          handleEndCall();
        });

        // Try to join
        await dailyRef.current.join({ url: roomUrl, token });

        // iOS/Safari/WebView audio unlock
        try {
          // @ts-ignore - some environments need explicit start
          if (dailyRef.current.startAudio) await dailyRef.current.startAudio();
          await dailyRef.current.setLocalAudio(true);
          await dailyRef.current.setLocalVideo(false);
        } catch (e) {
          console.warn('[VoIP] startAudio/setLocalAudio warn', e);
        }

        // Auto transition to ringing after 2 seconds
        setTimeout(() => {
          if (mounted && callState === 'dialing') {
            setCallState('ringing');
          }
        }, 2000);
      } catch (err: any) {
        console.error('[VoIP] join() failed', err);

        // Quick retry once if token is fine but network hiccup
        try {
          await new Promise(r => setTimeout(r, 800));
          await dailyRef.current?.join({ url: roomUrl, token });
          
          // Audio unlock again
          // @ts-ignore
          if (dailyRef.current?.startAudio) await dailyRef.current.startAudio();
          await dailyRef.current?.setLocalAudio(true);
          await dailyRef.current?.setLocalVideo(false);
        } catch (err2: any) {
          console.error('[VoIP] join() retry failed', err2);
          toast.error('Call Failed: Could not connect to the call');
          isInitializing.current = false;
          navigate(-1);
        }
      }
    };

    initCall();

    return () => {
      mounted = false;
      if (dailyRef.current) {
        dailyRef.current.leave();
        dailyRef.current.destroy();
        dailyRef.current = null;
      }
      isInitializing.current = false;
    };
  }, [roomUrl, token]);

  const handleEndCall = async () => {
    try {
      console.log('📞 Ending call:', rtcCallId);
      setCallState('ended');
      
      // End call on server
      await supabase.functions.invoke('end-rtc-call', {
        body: { rtc_call_id: rtcCallId },
      });

      // Cleanup Daily
      if (dailyRef.current) {
        dailyRef.current.leave();
        dailyRef.current.destroy();
        dailyRef.current = null;
      }

      toastHook({
        title: 'Call Ended',
        description: 'The call has been ended',
      });

      navigate(-1);
    } catch (error) {
      console.error('📞 Error ending call:', error);
      navigate(-1);
    }
  };

  const toggleMute = () => {
    if (dailyRef.current) {
      dailyRef.current.setLocalAudio(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleSpeaker = () => {
    // Note: Speaker toggle is mostly relevant for mobile devices
    setIsSpeakerOn(!isSpeakerOn);
    toastHook({
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
