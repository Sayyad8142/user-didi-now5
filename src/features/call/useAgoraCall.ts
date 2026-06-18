/**
 * useAgoraCall — manages the lifecycle of an Agora voice call for a booking.
 *
 * Flow:
 *  1. Fetch RTC token from `agora-token` edge function.
 *  2. Join channel `booking_<bookingId>`, publish microphone audio.
 *  3. Track remote user join/leave to compute "connected" state + duration.
 *  4. Auto-leave on: max duration (10 min), unmount, or explicit endCall().
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AgoraRTC, {
  type IAgoraRTCClient,
  type IAgoraRTCRemoteUser,
  type IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import { getAuth } from 'firebase/auth';
import { supabase } from '@/integrations/supabase/client';

export type CallState = 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'error';

const MAX_CALL_SECONDS = 10 * 60; // 10 minutes

interface UseAgoraCallOptions {
  bookingId: string;
  userId: string; // caller's profile id
}

export function useAgoraCall({ bookingId, userId }: UseAgoraCallOptions) {
  const [state, setState] = useState<CallState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0); // seconds since connected
  const [muted, setMuted] = useState(false);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const tickRef = useRef<number | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const cleanupRef = useRef(false);

  const cleanup = useCallback(async () => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;

    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    try {
      if (micTrackRef.current) {
        micTrackRef.current.stop();
        micTrackRef.current.close();
        micTrackRef.current = null;
      }
      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current.removeAllListeners();
        clientRef.current = null;
      }
    } catch (e) {
      console.warn('[agora] cleanup error', e);
    }
  }, []);

  const endCall = useCallback(async () => {
    await cleanup();
    setState('ended');
  }, [cleanup]);

  const startCall = useCallback(async () => {
    if (state !== 'idle' && state !== 'ended' && state !== 'error') return;
    cleanupRef.current = false;
    setError(null);
    setDuration(0);
    setState('connecting');

    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in');

      // 1. Fetch token from edge function
      const { data, error: fnErr } = await supabase.functions.invoke('agora-token', {
        body: { booking_id: bookingId, user_id: userId, role: 'customer' },
        headers: { 'x-firebase-token': idToken },
      });
      if (fnErr) throw new Error(fnErr.message || 'Token request failed');
      const { appId, channelName, token, uid } = (data || {}) as {
        appId: string; channelName: string; token: string; uid: number;
      };
      if (!appId || !token) throw new Error('Invalid token response');

      // 2. Notify worker (best-effort, do not block call setup)
      supabase.functions
        .invoke('notify-worker-call', {
          body: { booking_id: bookingId, channel_name: channelName },
          headers: { 'x-firebase-token': idToken },
        })
        .catch((e) => console.warn('[agora] notify-worker-call failed', e));

      // 3. Create RTC client
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack?.play();
          if (connectedAtRef.current === null) {
            connectedAtRef.current = Date.now();
            setState('connected');
            tickRef.current = window.setInterval(() => {
              const secs = Math.floor((Date.now() - (connectedAtRef.current ?? Date.now())) / 1000);
              setDuration(secs);
              if (secs >= MAX_CALL_SECONDS) {
                endCall();
              }
            }, 1000);
          }
        }
      });

      client.on('user-left', () => {
        // Other side hung up
        endCall();
      });

      await client.join(appId, channelName, token, uid);
      setState('ringing');

      // 4. Publish microphone
      const micTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: 'speech_standard',
      });
      micTrackRef.current = micTrack;
      await client.publish(micTrack);
    } catch (e: any) {
      console.error('[agora] startCall failed', e);
      setError(e?.message || 'Could not start call');
      setState('error');
      await cleanup();
    }
  }, [bookingId, userId, state, cleanup, endCall]);

  const toggleMute = useCallback(() => {
    const t = micTrackRef.current;
    if (!t) return;
    const next = !muted;
    t.setMuted(next);
    setMuted(next);
  }, [muted]);

  // Unmount safety
  useEffect(() => () => { cleanup(); }, [cleanup]);

  return { state, error, duration, muted, startCall, endCall, toggleMute };
}
