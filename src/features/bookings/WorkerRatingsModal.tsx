import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Star, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface WorkerRating {
  id: string;
  rating: number;
  comment?: string;
  created_at: string;
  user_id: string;
  profiles?: {
    full_name: string;
    flat_no: string;
    community: string;
  } | null;
}

interface WorkerRatingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: string;
  workerName: string;
}

export function WorkerRatingsModal({ open, onOpenChange, workerId, workerName }: WorkerRatingsModalProps) {
  const [ratings, setRatings] = useState<WorkerRating[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ avg_rating: number; ratings_count: number } | null>(null);

  useEffect(() => {
    if (!open || !workerId) return;

    const fetchRatings = async () => {
      setLoading(true);
      try {
        // Fetch individual ratings
        const { data: ratingsData, error: ratingsError } = await supabase
          .from('worker_ratings')
          .select('id, rating, comment, created_at, user_id')
          .eq('worker_id', workerId)
          .order('created_at', { ascending: false });

        if (ratingsError) throw ratingsError;

        // Fetch profile info for each user
        const userIds = [...new Set((ratingsData || []).map(r => r.user_id))];
        let profilesMap: Record<string, { full_name: string; flat_no: string; community: string }> = {};
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, full_name, flat_no, community')
            .in('id', userIds);
          if (profilesData) {
            profilesMap = Object.fromEntries(profilesData.map(p => [p.id, p]));
          }
        }

        setRatings((ratingsData || []).map(r => ({
          ...r,
          profiles: profilesMap[r.user_id] || null,
        })));

        // Fetch aggregate stats
        const { data: statsData, error: statsError } = await supabase
          .from('worker_rating_stats')
          .select('avg_rating, ratings_count')
          .eq('worker_id', workerId)
          .maybeSingle();

        if (statsError) throw statsError;
        setStats(statsData);
      } catch (error) {
        console.error('Error fetching worker ratings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRatings();
  }, [open, workerId]);

  const renderStars = (rating: number) => {
    return (
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${i <= rating ? 'text-yellow-500' : 'text-gray-300'}`}
            fill={i <= rating ? 'currentColor' : 'none'}
          />
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {workerName}'s Ratings
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Summary stats */}
          {stats && (
            <div className="bg-blue-50 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {renderStars(Math.round(stats.avg_rating))}
                  <span className="text-lg font-semibold text-blue-900">
                    {stats.avg_rating.toFixed(1)}
                  </span>
                </div>
                <span className="text-sm text-blue-700">
                  ({stats.ratings_count} reviews)
                </span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : ratings.length === 0 ? (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No ratings yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ratings.map((rating) => (
                <div key={rating.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    {renderStars(rating.rating)}
                    <span className="text-xs text-gray-500">
                      {format(new Date(rating.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {rating.profiles && (
                    <p className="text-xs text-muted-foreground mb-1">
                      {rating.profiles.full_name} • {rating.profiles.flat_no} • {rating.profiles.community}
                    </p>
                  )}
                  {rating.comment && (
                    <p className="text-sm text-gray-700 mt-1">{rating.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t">
          <Button
            onClick={() => onOpenChange(false)}
            variant="outline"
            className="w-full"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}