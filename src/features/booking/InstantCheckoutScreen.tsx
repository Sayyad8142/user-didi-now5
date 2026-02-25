import React, { useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Star, Search, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { prettyServiceName } from './pricing';

type EligibleWorker = {
  worker_id: string;
  full_name: string;
  photo_url: string | null;
  rating_avg: number;
  rating_count: number;
  completed_bookings_count: number;
  last_seen_at: string | null;
};

export function InstantCheckoutScreen() {
  const navigate = useNavigate();
  const { service_type } = useParams<{ service_type: string }>();
  const [searchParams] = useSearchParams();
  const { profile } = useProfile();
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Read booking params from URL
  const flatSize = searchParams.get('flat');
  const priceParam = searchParams.get('price');
  const price = priceParam ? Number(priceParam) : 0;
  const tasks = searchParams.get('tasks');
  const dishIntensity = searchParams.get('dish_intensity');
  const dishExtra = searchParams.get('dish_extra');
  const bathroomCount = searchParams.get('bathrooms');
  const hasGlass = searchParams.get('glass') === '1';

  // Preferred worker selection state (local, not sessionStorage until booking)
  const [selectedWorker, setSelectedWorker] = useState<EligibleWorker | null>(null);

  const { data: workers, isLoading } = useQuery({
    queryKey: ['eligible-workers', service_type, profile?.community],
    enabled: !!service_type && !!profile?.community,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_eligible_workers', {
        p_service: service_type!,
        p_community: profile!.community,
        p_limit: 50,
      });
      if (error) throw error;
      return (data || []) as EligibleWorker[];
    },
  });

  const filtered = (workers || []).filter((w) =>
    w.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (worker: EligibleWorker) => {
    if (selectedWorker?.worker_id === worker.worker_id) {
      setSelectedWorker(null);
    } else {
      setSelectedWorker(worker);
    }
  };

  const clearSelection = useCallback(() => {
    setSelectedWorker(null);
  }, []);

  const handleBookNow = async () => {
    if (!profile || !service_type || !user) return;

    // Validate community
    if (!profile.community || profile.community === 'other') {
      toast({
        title: "Profile Incomplete",
        description: "Please complete your profile with community information before booking.",
        variant: "destructive"
      });
      navigate('/profile/settings');
      return;
    }

    // Validate flat details for non-bathroom services
    if (service_type !== 'bathroom_cleaning' && !profile.flat_id) {
      toast({
        title: "Flat Details Missing",
        description: "Please update your flat details in Account Settings before booking.",
        variant: "destructive"
      });
      navigate('/profile/settings');
      return;
    }

    setSubmitting(true);
    try {
      const maidTasks = tasks ? tasks.split(',') : null;
      const bookingData = {
        user_id: profile.id,
        service_type,
        booking_type: 'instant',
        scheduled_date: null,
        scheduled_time: null,
        notes: null,
        status: 'pending',
        flat_size: service_type === 'bathroom_cleaning' ? null : flatSize,
        price_inr: price,
        family_count: null,
        food_pref: null,
        cook_cuisine_pref: null,
        cook_gender_pref: null,
        maid_tasks: service_type === 'maid' ? maidTasks : null,
        dish_intensity: service_type === 'maid' && maidTasks?.includes('dish_washing') ? dishIntensity : null,
        dish_intensity_extra_inr: service_type === 'maid' && maidTasks?.includes('dish_washing') && dishExtra ? Number(dishExtra) : null,
        bathroom_count: service_type === 'bathroom_cleaning' && bathroomCount ? Number(bathroomCount) : null,
        has_glass_partition: service_type === 'bathroom_cleaning' ? hasGlass : null,
        glass_partition_fee: service_type === 'bathroom_cleaning' && hasGlass && bathroomCount ? 30 * Number(bathroomCount) : null,
        cust_name: /^\+?\d{7,15}$/.test(profile.full_name.trim()) ? 'User ' + profile.phone.slice(-4) : profile.full_name,
        cust_phone: profile.phone,
        community: profile.community,
        flat_no: profile.flat_no,
        preferred_worker_id: selectedWorker?.worker_id || null,
      } as any;

      const { data, error } = await supabase.from('bookings').insert([bookingData]).select();

      if (error) {
        console.error('❌ Booking error:', error);
        const isFlatError = error.message?.includes('flat details');
        toast({
          title: "Booking Failed",
          description: isFlatError
            ? "Please update your flat details in Account Settings before booking."
            : `Error: ${error.message || 'Please try again.'}`,
          variant: "destructive"
        });
        if (isFlatError) navigate('/profile/settings');
        return;
      }

      // Clear any stored preferred worker for this service
      sessionStorage.removeItem(`preferred_worker_${service_type}`);

      toast({
        title: "Booking received!",
        description: "Service will arrive in 10 minutes."
      });
      navigate('/home');
    } catch (err: any) {
      console.error('❌ Booking error:', err);
      const isNetworkError = err?.message?.includes('Load failed') || err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError');
      toast({
        title: "Booking Failed",
        description: isNetworkError
          ? "Network error – please check your internet connection and try again."
          : `Error: ${err?.message || 'Please try again.'}`,
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const serviceName = service_type ? prettyServiceName(service_type) : 'Service';

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground">Instant Booking</h1>
        </div>

        {/* Book Now CTA */}
        <Button
          onClick={handleBookNow}
          disabled={submitting}
          className="w-full h-14 rounded-2xl text-base font-bold shadow-lg mb-1"
          size="lg"
        >
          {submitting ? (
            <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Zap className="w-5 h-5 mr-2" />
              Book Now
            </>
          )}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center mb-6">
          {selectedWorker
            ? `We'll offer to ${selectedWorker.full_name} first. If no response, others will get it.`
            : "Instant • We'll assign the best available expert"}
        </p>

        {/* Available Experts */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Available experts <span className="text-muted-foreground font-normal">(optional)</span></h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Select one to offer booking to them first. If they don't respond, we'll send to others.
            </p>
          </div>

          {/* Search */}
          {(workers?.length || 0) > 3 && (
            <div className="relative">
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
          )}

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
            <div className="text-center py-8">
              <p className="text-muted-foreground font-medium text-sm">
                {search ? 'No workers match your search' : 'No experts online right now'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                You can still book instantly — we'll find the best available expert.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((w) => {
                const isSelected = selectedWorker?.worker_id === w.worker_id;
                return (
                  <button
                    key={w.worker_id}
                    onClick={() => handleSelect(w)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 bg-card shadow-sm transition-all duration-200 text-left",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    )}
                  >
                    <Avatar className="w-11 h-11">
                      {w.photo_url ? <AvatarImage src={w.photo_url} alt={w.full_name} /> : null}
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                        {w.full_name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{w.full_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex items-center gap-0.5">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span className="text-xs font-medium text-foreground">
                            {w.rating_avg.toFixed(1)}
                          </span>
                          {w.rating_count > 0 && (
                            <span className="text-xs text-muted-foreground">({w.rating_count})</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          • {w.completed_bookings_count} done
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Online
                      </span>
                    </div>

                    <div className={cn(
                      "shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                      isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                    )}>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedWorker && (
            <button
              onClick={clearSelection}
              className="text-xs text-primary font-medium mx-auto block mt-1"
            >
              Clear selection
            </button>
          )}

          <p className="text-[10px] text-muted-foreground text-center">
            Auto-refreshes every 15s
          </p>
        </div>
      </div>
    </div>
  );
}
