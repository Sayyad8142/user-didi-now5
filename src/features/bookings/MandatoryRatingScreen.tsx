import React, { useState } from 'react';
import { Star, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { WorkerAvatar } from '@/components/WorkerAvatar';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { toast } from 'sonner';
import { prettyServiceName } from '@/features/booking/utils';
import { format } from 'date-fns';
import type { UnratedBooking } from '@/hooks/useUnratedBooking';

const QUICK_TAGS = [
  'On time',
  'Thorough cleaning',
  'Friendly',
  'Professional',
  'Could improve',
  'Was late',
];

interface MandatoryRatingScreenProps {
  booking: UnratedBooking;
  onRated: () => void;
  onDismiss: () => void;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="transition-transform active:scale-90"
        >
          <Star
            className={`w-8 h-8 transition-colors ${
              star <= value ? 'text-yellow-500' : 'text-muted-foreground/30'
            }`}
            fill={star <= value ? 'currentColor' : 'none'}
          />
        </button>
      ))}
    </div>
  );
}

export function MandatoryRatingScreen({ booking, onRated, onDismiss }: MandatoryRatingScreenProps) {
  const { profile } = useProfile();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (!rating || !profile?.id || !booking.worker_id) return;

    setSubmitting(true);
    try {
      const fullComment = [
        ...selectedTags.map(t => `[${t}]`),
        comment.trim(),
      ].filter(Boolean).join(' ');

      const { error } = await supabase
        .from('worker_ratings')
        .upsert({
          booking_id: booking.id,
          worker_id: booking.worker_id,
          user_id: profile.id,
          rating,
          comment: fullComment || null,
        }, { onConflict: 'booking_id' });

      if (error) throw error;

      toast.success('Thanks for your rating!');
      onRated();
    } catch (err: any) {
      console.error('Rating submit error:', err);
      toast.error('Failed to submit rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const completedDate = booking.completed_at
    ? format(new Date(booking.completed_at), 'dd MMM, h:mm a')
    : format(new Date(booking.created_at), 'dd MMM');

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] overflow-y-auto relative animate-in slide-in-from-bottom-4 duration-300">
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted transition-colors z-10"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="p-5 space-y-4">
          {/* Header + Worker */}
          <div className="text-center pr-6">
            <p className="text-base font-bold text-foreground">Rate Your Service</p>
            <p className="text-xs text-muted-foreground mt-0.5">Rate before booking again</p>
          </div>

          <div className="flex items-center gap-3">
            <WorkerAvatar
              photoUrl={booking.worker_photo_url}
              name={booking.worker_name}
              size="lg"
            />
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground truncate">
                {booking.worker_name || 'Your Worker'}
              </p>
              <p className="text-xs text-muted-foreground">
                {prettyServiceName(booking.service_type)} • {completedDate}
              </p>
            </div>
          </div>

          {/* Stars */}
          <div className="text-center">
            <StarRating value={rating} onChange={setRating} />
            {rating > 0 && (
              <p className="text-xs font-medium mt-1 text-foreground">
                {['', 'Poor', 'Below Average', 'Average', 'Good', 'Excellent!'][rating]}
              </p>
            )}
          </div>

          {/* Quick tags */}
          {rating > 0 && (
            <div className="animate-in fade-in duration-200">
              <p className="text-xs text-muted-foreground mb-1.5">Quick feedback (optional)</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border ${
                      selectedTags.includes(tag)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Comment */}
          {rating > 0 && (
            <Textarea
              placeholder="Share your experience (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!rating || submitting}
            className="w-full h-11 rounded-full text-sm font-semibold gradient-primary shadow-button"
          >
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </Button>
        </div>
      </div>
    </div>
  );
}
