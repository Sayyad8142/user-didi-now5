import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useProfile } from '@/contexts/ProfileContext';
import { cn } from '@/lib/utils';
import { useFavoriteWorkers, type FavoriteWorker } from '@/hooks/useFavoriteWorkers';

export function SelectWorkerScreen() {
  const navigate = useNavigate();
  const { service_type } = useParams<{ service_type: string }>();
  const { profile } = useProfile();
  const { toast } = useToast();
  const [search, setSearch] = useState('');

  const { data: workers, isLoading } = useFavoriteWorkers(service_type, profile?.community);

  const filtered = (workers || []).filter((w) =>
    w.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (worker: FavoriteWorker) => {
    if (!worker.is_online) {
      toast({
        title: 'Expert is offline',
        description: 'This expert is offline right now.',
      });
      return;
    }
    sessionStorage.setItem(
      `preferred_worker_${service_type}`,
      JSON.stringify({
        id: worker.worker_id,
        full_name: worker.full_name,
        photo_url: worker.photo_url,
        rating_avg: worker.rating_avg,
      })
    );
    toast({
      title: 'Worker selected',
      description: `Booking will be offered to ${worker.full_name} first.`,
    });
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground">Your Previous Experts</h1>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Experts you've booked before for {service_type?.replace(/_/g, ' ') || 'this service'}. Auto-refreshes every 15s.
        </p>

        {/* Worker list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-2xl border border-border">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-9 w-20 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground font-medium">
              {search ? 'No workers match your search' : 'No previous experts yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? 'Try a different name.' : 'Book once to see your favorite experts here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((w) => {
              const isOnline = w.is_online;
              return (
                <div
                  key={w.worker_id}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-2xl border border-border bg-card shadow-sm",
                    !isOnline && "opacity-60"
                  )}
                >
                  <div className="relative">
                    <Avatar className="w-12 h-12">
                      {w.photo_url ? (
                        <AvatarImage src={w.photo_url} alt={w.full_name} />
                      ) : null}
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {w.full_name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className={cn(
                      "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card",
                      isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
                    )} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{w.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex items-center gap-0.5">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span className="text-xs font-medium text-foreground">
                          {Number(w.rating_avg).toFixed(1)}
                        </span>
                        {w.rating_count > 0 && (
                          <span className="text-xs text-muted-foreground">({w.rating_count})</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        • {w.completed_bookings_count} done
                      </span>
                    </div>
                    <span className={cn(
                      "inline-flex items-center gap-1 mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                      isOnline
                        ? "text-emerald-600 bg-emerald-50"
                        : "text-muted-foreground bg-muted/60"
                    )}>
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
                      )} />
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleSelect(w)}
                    disabled={!isOnline}
                    className="rounded-xl text-xs font-semibold px-4"
                  >
                    Select
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
