import React, { useState } from 'react';
import { Star, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
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
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="transition-transform active:scale-90"
        >
          <Star
            className={`w-10 h-10 transition-colors ${
              star <= value ? 'text-yellow-500' : 'text-muted-foreground/30'
            }`}
            fill={star <= value ? 'currentColor' : 'none'}
          />
        </button>
      ))}
    </div>
  );
}

export function MandatoryRatingScreen({ booking, onRated }: MandatoryRatingScreenProps) {
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
    ? format(new Date(booking.completed_at), 'dd MMM yyyy, h:mm a')
    : format(new Date(booking.created_at), 'dd MMM yyyy');

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Header */}
      <div className="pt-safe px-6 pt-8 pb-4 text-center">
        <h1 className="text-xl font-bold text-foreground">Rate Your Service</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Please rate your last completed service before booking again.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {/* Worker info */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <Avatar className="w-20 h-20 border-4 border-primary/20">
            {booking.worker_photo_url ? (
              <AvatarImage src={booking.worker_photo_url} alt={booking.worker_name || ''} />
            ) : null}
            <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
              {(booking.worker_name || 'W').charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <p className="font-semibold text-lg text-foreground">
              {booking.worker_name || 'Your Worker'}
            </p>
            <p className="text-sm text-muted-foreground">
              {prettyServiceName(booking.service_type)} • {completedDate}
            </p>
            {booking.price_inr && (
              <p className="text-sm text-muted-foreground">₹{booking.price_inr}</p>
            )}
          </div>
        </div>

        {/* Star rating */}
        <div className="mb-8">
          <p className="text-center text-sm text-muted-foreground mb-4">
            How was the service?
          </p>
          <StarRating value={rating} onChange={setRating} />
          {rating > 0 && (
            <p className="text-center text-sm font-medium mt-2 text-foreground">
              {rating === 1 && 'Poor'}
              {rating === 2 && 'Below Average'}
              {rating === 3 && 'Average'}
              {rating === 4 && 'Good'}
              {rating === 5 && 'Excellent!'}
            </p>
          )}
        </div>

        {/* Quick tags */}
        {rating > 0 && (
          <div className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-sm text-muted-foreground mb-2">Quick feedback (optional)</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
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

        {/* Review text */}
        {rating > 0 && (
          <div className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Textarea
              placeholder="Share more about your experience (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
          </div>
        )}
      </div>

      {/* Submit button */}
      <div className="px-6 pb-safe pb-6 pt-4 border-t border-border bg-background">
        <Button
          onClick={handleSubmit}
          disabled={!rating || submitting}
          className="w-full h-12 rounded-full text-base font-semibold gradient-primary shadow-button"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
              Submitting...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              Submit Rating
            </span>
          )}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center mt-2">
          Top-rated workers get more bookings — rate honestly to help improve service quality.
        </p>
      </div>
    </div>
  );
}
