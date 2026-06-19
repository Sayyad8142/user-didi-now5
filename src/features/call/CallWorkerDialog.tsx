/**
 * CallWorkerDialog — full-screen outgoing voice call UI.
 * Auto-ends if booking moves to a non-call status (cancelled/completed).
 */
import { useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { WorkerAvatar } from '@/components/WorkerAvatar';
import { Mic, MicOff, PhoneOff, Loader2 } from 'lucide-react';
import { useAgoraCall } from './useAgoraCall';

interface CallWorkerDialogProps {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  userId: string;
  workerName?: string | null;
  workerPhotoUrl?: string | null;
  bookingStatus: string;
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const CALLABLE_STATUSES = new Set(['assigned', 'confirmed', 'on_the_way', 'in_progress', 'started', 'accepted']);

export default function CallWorkerDialog({
  open, onClose, bookingId, userId, workerName, workerPhotoUrl, bookingStatus,
}: CallWorkerDialogProps) {
  const { state, error, duration, muted, startCall, endCall, toggleMute } =
    useAgoraCall({ bookingId, userId });

  // Auto-start on open
  useEffect(() => {
    if (open && state === 'idle') startCall();
  }, [open, state, startCall]);

  // Auto-end if booking status leaves callable set (cancelled/completed mid-call)
  useEffect(() => {
    if (!open) return;
    if (!CALLABLE_STATUSES.has(bookingStatus)) {
      endCall();
    }
  }, [open, bookingStatus, endCall]);

  // Close shortly after ended
  useEffect(() => {
    if (state === 'ended') {
      const t = setTimeout(onClose, 800);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  const handleClose = async () => {
    await endCall();
    onClose();
  };

  const statusLabel =
    state === 'connecting' ? 'Connecting…' :
    state === 'ringing' ? 'Calling…' :
    state === 'connected' ? fmt(duration) :
    state === 'ended' ? 'Call ended' :
    state === 'error' ? (error || 'Call failed') :
    '';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden border-0 bg-gradient-to-b from-primary/95 to-primary text-primary-foreground">
        <DialogTitle className="sr-only">Call worker</DialogTitle>
        <DialogDescription className="sr-only">Voice call in progress</DialogDescription>

        <div className="flex flex-col items-center px-6 pt-10 pb-8">
          <div className="rounded-full ring-4 ring-white/30 shadow-lg">
            <WorkerAvatar
              name={workerName || 'Worker'}
              photoUrl={workerPhotoUrl || undefined}
              size="lg"
            />
          </div>

          <div className="mt-5 text-xl font-semibold tracking-tight">
            {workerName || 'Worker'}
          </div>

          <div className="mt-1.5 min-h-[24px] text-sm text-white/85 flex items-center gap-2">
            {(state === 'connecting' || state === 'ringing') && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            <span>{statusLabel}</span>
          </div>

          <div className="mt-10 flex items-center gap-5">
            <Button
              onClick={toggleMute}
              disabled={state !== 'connected'}
              size="lg"
              variant="secondary"
              className="h-14 w-14 rounded-full bg-white/15 hover:bg-white/25 border-0 text-white disabled:opacity-40"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>

            <Button
              onClick={handleClose}
              size="lg"
              className="h-16 w-16 rounded-full bg-rose-500 hover:bg-rose-600 border-0 text-white shadow-lg"
              aria-label="End call"
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
          </div>

          <p className="mt-6 text-[11px] text-white/70 text-center leading-relaxed">
            Voice only · Max 10 min · Numbers stay private
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { CALLABLE_STATUSES };
