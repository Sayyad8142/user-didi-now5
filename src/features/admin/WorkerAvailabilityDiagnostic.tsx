import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, XCircle, Info, Activity } from 'lucide-react';
import { useProfile } from '@/contexts/ProfileContext';

interface DiagnosticResult {
  params: {
    audit_phone: string;
    community: string;
    service: string;
  };
  eligibility_gates: {
    is_active: boolean;
    is_available: boolean;
    is_not_busy: boolean;
    community_match: boolean;
    service_match: boolean;
    roster_match: boolean;
  };
  calculated: {
    dow: number;
    slot: string;
    ist_iso: string;
  };
  is_sid_in_eligible_list: boolean;
  rpc_online_counts: Array<{
    service: string;
    total_count: number;
  }>;
}

export function WorkerAvailabilityDiagnostic({ serviceType = 'maid' }: { serviceType?: string }) {
  const { profile } = useProfile();
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['worker-diagnostic', serviceType, profile?.community],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('worker-audit', {
        body: { 
          audit_phone: "+917894896396", // Sid's verified phone
          community: profile?.community || "prestige-high-fields",
          service: serviceType 
        }
      });
      if (error) throw error;
      return data as DiagnosticResult;
    },
    enabled: !!profile?.community,
    refetchInterval: 30000 // Refresh every 30s
  });

  if (isLoading) return <div className="p-4 animate-pulse bg-muted rounded-lg h-32" />;
  if (error || !data) return null;

  const gates = data.eligibility_gates;
  const isEligible = Object.values(gates).every(Boolean);

  const GateRow = ({ label, passed }: { label: string; passed: boolean }) => (
    <div className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      {passed ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-red-500" />
      )}
    </div>
  );

  return (
    <Card className="bg-black/40 border-white/10 overflow-hidden mt-4">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0 bg-white/5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <CardTitle className="text-sm font-medium">Sid Availability Audit</CardTitle>
        </div>
        <Badge variant={isEligible ? "default" : "destructive"} className="text-[10px] h-5 px-1.5 uppercase font-bold">
          {isEligible ? "Eligible" : "Blocked"}
        </Badge>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <GateRow label="App Active" passed={gates.is_active} />
          <GateRow label="Status: Available" passed={gates.is_available} />
          <GateRow label="Not Busy" passed={gates.is_not_busy} />
          <GateRow label="Service Match" passed={gates.service_match} />
          <GateRow label="Community Match" passed={gates.community_match} />
          <GateRow label="Shift/Slot Match" passed={gates.roster_match} />
        </div>

        <div className="pt-2 flex items-center justify-between text-[10px] text-muted-foreground border-t border-white/10">
          <div className="flex items-center gap-1">
            <Info className="w-3 h-3" />
            <span>IST: {data.calculated.slot} (DOW {data.calculated.dow})</span>
          </div>
          <button 
            onClick={() => refetch()} 
            className="text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Refresh
          </button>
        </div>

        {!isEligible && (
          <div className="p-2 bg-red-500/10 rounded text-[10px] text-red-400 leading-tight border border-red-500/20">
            <strong>Diagnostic:</strong> Sid is marked as unavailable in the database. 
            Ensure his app status is 'Available' and his shift covers {data.calculated.slot}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
