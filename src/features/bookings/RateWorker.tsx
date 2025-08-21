import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface RateWorkerProps {
  bookingId: string;
  workerId?: string;
  onSubmit: (rating: number, comment?: string) => Promise<void>;
}

function StarRating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-1">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          onClick={() => onChange(rating)}
          className={`text-3xl transition-colors ${
            rating <= value ? 'text-yellow-500' : 'text-gray-300'
          }`}
        >
          <Star className="w-8 h-8" fill={rating <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  );
}

export function RateWorker({ bookingId, workerId, onSubmit }: RateWorkerProps) {
  const [myRating, setMyRating] = useState<{ rating: number; comment?: string } | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    
    supabase
      .from('worker_ratings')
      .select('rating, comment')
      .eq('booking_id', bookingId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setMyRating(data);
        }
      });
  }, [bookingId]);

  if (!workerId) return null;
  
  if (myRating) {
    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <div className="text-sm text-gray-600 flex items-center gap-2 mb-2">
          <span>Your rating:</span>
          <div className="flex">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-4 h-4 ${
                  star <= myRating.rating ? 'text-yellow-500' : 'text-gray-300'
                }`}
                fill={star <= myRating.rating ? 'currentColor' : 'none'}
              />
            ))}
          </div>
          <span>({myRating.rating}/5)</span>
        </div>
        {myRating.comment && (
          <p className="text-sm text-gray-700 italic">"{myRating.comment}"</p>
        )}
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!rating) return;
    
    setLoading(true);
    try {
      await onSubmit(rating, comment || undefined);
      setMyRating({ rating, comment });
      setRating(0);
      setComment('');
      toast.success('Rating submitted successfully!');
    } catch (error) {
      toast.error('Failed to submit rating');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
      <div className="text-center">
        <p className="text-sm font-medium text-gray-700 mb-2">Rate your experience</p>
        <StarRating value={rating} onChange={setRating} />
      </div>
      
      <Textarea
        placeholder="Share your experience (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        className="text-sm"
      />
      
      <Button
        onClick={handleSubmit}
        disabled={!rating || loading}
        className="w-full bg-pink-600 hover:bg-pink-700 text-white"
      >
        {loading ? 'Submitting...' : 'Submit Rating'}
      </Button>
    </div>
  );
}