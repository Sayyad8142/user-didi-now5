import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ChevronLeft, Search, BadgeCheck, Phone, User, Clock, Loader2 } from 'lucide-react';

type Worker = {
  id: string;
  full_name: string;
  phone: string | null;
  community?: string | null;
  service_types?: string[] | null;
  photo_url?: string | null;
  is_active: boolean;
  is_available?: boolean;
  rating?: number | null;
  total_ratings?: number | null;
  total_earnings?: number | null;
  assigned_at?: string;
  current_service?: string;
};

type BookingLite = {
  id: string;
  service_type: string;
  community: string;
};

async function getBooking(id: string): Promise<BookingLite> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, service_type, community')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as BookingLite;
}

type TabKey = 'available' | 'working' | 'all';

async function fetchWorkers(opts: {
  tab: TabKey;
  service?: string;
  community?: string;
  q?: string;
  sort?: 'best' | 'jobs' | 'rating';
}) {
  const { tab, service, community, q, sort = 'best' } = opts;

  // Base worker fields - include rating and earnings for sorting
  const baseFields = 'id, full_name, phone, community, service_types, photo_url, is_active, is_available, rating, total_ratings, total_earnings';

  // For all workers - get all active workers regardless of availability
  if (tab === 'all') {
    let query = supabase
      .from('workers')
      .select(baseFields)
      .eq('is_active', true)
      .limit(200);

    if (service) {
      query = query.contains('service_types', [service]);
    }
    if (community) {
      query = query.eq('community', community);
    }
    if (q && q.trim()) {
      query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
    }

    // Apply sorting
    if (sort === 'jobs') {
      query = query.order('total_earnings', { ascending: false, nullsFirst: false });
    } else if (sort === 'rating') {
      query = query.order('rating', { ascending: false, nullsFirst: false });
    } else {
      query = query.order('full_name', { ascending: true });
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Worker[];
  }

  // For available workers
  if (tab === 'available') {
    let query = supabase
      .from('workers')
      .select(baseFields)
      .eq('is_active', true)
      .eq('is_available', true)
      .limit(100);

    if (service) {
      query = query.contains('service_types', [service]);
    }
    if (community) {
      query = query.eq('community', community);
    }
    if (q && q.trim()) {
      query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
    }

    // For available workers, prefer by rating then name
    if (sort === 'jobs') {
      query = query.order('total_earnings', { ascending: false, nullsFirst: false });
    } else if (sort === 'rating') {
      query = query.order('rating', { ascending: false, nullsFirst: false });
    } else {
      // Best match: sort by rating desc, then name
      query = query.order('rating', { ascending: false, nullsFirst: false })
                  .order('full_name', { ascending: true });
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Worker[];
  }

  // For currently working - get workers assigned to bookings
  let query = supabase
    .from('bookings')
    .select(`
      worker_id,
      worker_name,
      worker_phone,
      assigned_at,
      service_type,
      workers!inner(
        id, full_name, phone, community, service_types, photo_url, is_active
      )
    `)
    .eq('status', 'assigned')
    .not('worker_id', 'is', null);

  if (service) {
    query = query.eq('service_type', service);
  }
  
  const { data, error } = await query.limit(100);
  if (error) throw error;

  // Transform the data to match Worker type
  const workersData = data?.map((booking: any) => ({
    id: booking.workers.id,
    full_name: booking.workers.full_name,
    phone: booking.workers.phone,
    community: booking.workers.community,
    service_types: booking.workers.service_types,
    photo_url: booking.workers.photo_url,
    is_active: booking.workers.is_active,
    assigned_at: booking.assigned_at,
    current_service: booking.service_type
  })) || [];

  return workersData;
}

async function rpcAssignWorker(bookingId: string, workerId: string) {
  const { data, error } = await supabase.rpc('assign_worker_to_booking', {
    p_booking_id: bookingId,
    p_worker_id: workerId
  });
  
  if (error) throw error;
  return data as { status: string };
}

export default function AdminAssignWorker() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { bookingId = '' } = useParams();
  const loc = useLocation() as any;
  const presetService = loc?.state?.service as string | undefined;
  const presetCommunity = loc?.state?.community as string | undefined;

  // Header context
  const { data: booking } = useQuery({
    queryKey: ['booking-lite', bookingId],
    queryFn: () => getBooking(bookingId),
    enabled: !!bookingId,
    staleTime: 60_000,
  });

  // State with session storage persistence
  const key = `assign.state.${bookingId}`;
  const saved = React.useMemo(() => {
    try { 
      return typeof window !== 'undefined' ? JSON.parse(sessionStorage.getItem(key) || '{}') : {}; 
    } catch { 
      return {}; 
    }
  }, [key]);

  const [tab, setTab] = React.useState<TabKey>(saved.tab ?? 'available');
  const [onlyThisService, setOnlyThisService] = React.useState<boolean>(saved.onlyThisService ?? true);
  const [onlyThisCommunity, setOnlyThisCommunity] = React.useState<boolean>(saved.onlyThisCommunity ?? true);
  const [q, setQ] = React.useState<string>(saved.q ?? '');
  const [sort, setSort] = React.useState<'best' | 'jobs' | 'rating'>(saved.sort ?? 'best');

  // Save state to session storage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(key, JSON.stringify({ tab, onlyThisService, onlyThisCommunity, q, sort }));
    }
  }, [key, tab, onlyThisService, onlyThisCommunity, q, sort]);

  const effService = onlyThisService ? (booking?.service_type ?? presetService) : undefined;
  const effCommunity = onlyThisCommunity ? (booking?.community ?? presetCommunity) : undefined;

  const { data: workers, isLoading } = useQuery({
    queryKey: ['assign-workers', tab, effService, effCommunity, q, sort],
    queryFn: () => fetchWorkers({ tab, service: effService, community: effCommunity, q, sort }),
    enabled: !!bookingId,
    staleTime: 30_000,
  });

  const [selected, setSelected] = React.useState<string | null>(null);

  const assignMut = useMutation({
    mutationFn: (workerId: string) => rpcAssignWorker(bookingId, workerId),
    onMutate: (workerId: string) => {
      // Track analytics
      if (typeof window !== 'undefined' && (window as any).__analytics?.track) {
        (window as any).__analytics.track('assign_click', { 
          booking_id: bookingId, 
          worker_id: workerId, 
          tab, 
          service: onlyThisService ? booking?.service_type : undefined,
          community: onlyThisCommunity ? booking?.community : undefined
        });
      }
      toast.loading('Assigning worker…', { id: 'assigning' });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to assign', { id: 'assigning' }),
    onSuccess: (res) => {
      if (res?.status === 'worker_busy') {
        toast.error('Worker just became unavailable. List refreshed.', { id: 'assigning' });
        qc.invalidateQueries({ queryKey: ['assign-workers'] });
        return;
      }
      if (res?.status === 'already_assigned') {
        toast.error('This booking is already assigned.', { id: 'assigning' });
        qc.invalidateQueries({ queryKey: ['booking-lite', bookingId] });
        return;
      }
      toast.success('Worker assigned successfully', { id: 'assigning' });
      // Refresh all relevant queries
      qc.invalidateQueries({ queryKey: ['assign-workers'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['admin-bookings'] });
      nav(-1);
    },
  });

  const handleAssign = (workerId: string) => assignMut.mutate(workerId);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b safe-top">
        <div className="flex items-center gap-3 p-3">
          <button onClick={() => nav(-1)} className="p-2 rounded-full hover:bg-muted">
            <ChevronLeft />
          </button>
          <div className="flex-1">
            <div className="text-xl font-semibold">Assign Worker</div>
            <div className="text-xs text-muted-foreground">
              Service: <span className="font-medium">{booking?.service_type ?? presetService ?? '—'}</span> • Community: <span className="font-medium">{booking?.community ?? presetCommunity ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* Segmented tabs */}
        <div className="px-3 pb-3">
          <div className="grid grid-cols-3 bg-muted rounded-xl p-1">
            <button
              onClick={() => setTab('available')}
              className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                tab === 'available' 
                  ? 'bg-background shadow-sm text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Available
            </button>
            <button
              onClick={() => setTab('working')}
              className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                tab === 'working' 
                  ? 'bg-background shadow-sm text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Currently Working
            </button>
            <button
              onClick={() => setTab('all')}
              className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                tab === 'all' 
                  ? 'bg-background shadow-sm text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="px-3 pb-3 flex flex-col gap-2">
          <div className="relative">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or phone"
              className="pl-10 h-11"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setOnlyThisService(v => !v)}
              className={`px-3 h-8 rounded-full text-xs border transition-colors ${
                onlyThisService 
                  ? 'bg-primary/10 border-primary/30 text-primary' 
                  : 'bg-background border-border hover:bg-muted'
              }`}
            >
              This Service
            </button>
            <button
              onClick={() => setOnlyThisCommunity(v => !v)}
              className={`px-3 h-8 rounded-full text-xs border transition-colors ${
                onlyThisCommunity 
                  ? 'bg-primary/10 border-primary/30 text-primary' 
                  : 'bg-background border-border hover:bg-muted'
              }`}
            >
              Same Community
            </button>
            <button
              onClick={() => {
                setTab('all');
                setOnlyThisService(false);
                setOnlyThisCommunity(false);
              }}
              className="px-3 h-8 rounded-full text-xs border bg-background border-border hover:bg-muted transition-colors"
              title="Show every worker across services and communities"
            >
              All Workers
            </button>

            {/* Sort dropdown */}
            <div className="ml-auto">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="h-8 text-xs rounded-lg border px-2 bg-background"
                aria-label="Sort workers"
              >
                <option value="best">Sort: Best Match</option>
                <option value="jobs">Sort: Most Jobs</option>
                <option value="rating">Sort: Highest Rating</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && (!workers || workers.length === 0) && (
          <div className="text-sm text-muted-foreground p-6 text-center">
            No workers match the current filters.
            <div className="mt-3">
              <Button variant="secondary" onClick={() => { 
                setTab('all'); 
                setOnlyThisService(false); 
                setOnlyThisCommunity(false); 
                setQ(''); 
              }}>
                Clear filters & show All
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {workers?.map(w => (
            <WorkerCard
              key={w.id}
              worker={w}
              tab={tab}
              selected={selected === w.id}
              onSelect={() => setSelected(s => s === w.id ? null : w.id)}
              onAssign={() => handleAssign(w.id)}
              isAssigning={assignMut.isPending && selected === w.id}
            />
          ))}
        </div>
        <div className="pb-24" />
      </div>

      {/* Sticky footer (for select-then-assign flow) */}
      <div className="sticky bottom-0 z-20 p-3 bg-background/80 backdrop-blur border-t safe-bottom">
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => nav(-1)}>
            Done
          </Button>
          <Button
            className="flex-1"
            disabled={!selected || assignMut.isPending}
            onClick={() => selected && handleAssign(selected)}
          >
            {assignMut.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function WorkerCard({ 
  worker, 
  tab, 
  selected, 
  onSelect, 
  onAssign, 
  isAssigning 
}: {
  worker: Worker & { assigned_at?: string; current_service?: string }; 
  tab: TabKey;
  selected: boolean; 
  onSelect: () => void; 
  onAssign: () => void;
  isAssigning: boolean;
}) {
  const statusTag = tab === 'available' 
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : tab === 'working'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-blue-50 text-blue-700 border-blue-200';

  return (
    <div
      className={`rounded-2xl border p-3 transition-all bg-card ${
        selected 
          ? 'ring-2 ring-primary border-primary/50' 
          : 'border-border hover:bg-muted/50'
      }`}
      onClick={onSelect}
      role="button"
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={worker.photo_url || undefined} />
          <AvatarFallback className="bg-muted text-muted-foreground font-medium">
            {worker.full_name?.[0]?.toUpperCase() ?? 'W'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-medium leading-tight">{worker.full_name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Phone className="h-3.5 w-3.5" />
            {worker.phone || '—'}
            {worker.community && (
              <>
                <span className="mx-1">•</span>
                <span className="truncate">{worker.community}</span>
              </>
            )}
          </div>
          {worker.service_types && worker.service_types.length > 0 && (
            <div className="flex gap-1 mt-1">
              {worker.service_types.slice(0, 2).map((service, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs px-2 py-0">
                  {service}
                </Badge>
              ))}
              {worker.service_types.length > 2 && (
                <Badge variant="secondary" className="text-xs px-2 py-0">
                  +{worker.service_types.length - 2}
                </Badge>
              )}
            </div>
          )}
          {tab === 'working' && worker.current_service && (
            <div className="text-xs text-muted-foreground mt-1">
              <Clock className="h-3 w-3 inline mr-1" />
              Working on: {worker.current_service}
            </div>
          )}
        </div>
        <div className={`px-2 h-7 rounded-full text-xs grid place-items-center border ${statusTag}`}>
          {tab === 'available' ? 'AVAILABLE' : tab === 'working' ? 'BUSY' : 'ALL'}
        </div>
      </div>

      <Separator className="my-3" />

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" className="rounded-full" onClick={onSelect}>
          {selected ? 'Selected' : 'Select'}
        </Button>
        <Button 
          className="rounded-full" 
          onClick={(e) => { e.stopPropagation(); onAssign(); }}
          disabled={isAssigning}
        >
          {isAssigning ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Assigning...
            </>
          ) : (
            'Assign'
          )}
        </Button>
      </div>
    </div>
  );
}