import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Phone, CalendarClock, Sparkles, ChefHat, ShowerHead, Check } from "lucide-react";
import Timer from "@/components/Timer";
import { useToast } from "@/hooks/use-toast";

function ServiceIcon({ t}:{t:string}) {
  return t==='cook' ? <ChefHat className="h-5 w-5"/> :
         t==='bathroom_cleaning' ? <ShowerHead className="h-5 w-5"/> :
         <Sparkles className="h-5 w-5"/>;
}

export function prettyService(t:string){
  return t==='cook'?'Cook Service':(t==='bathroom_cleaning'?'Bathroom Cleaning':'Maid Service');
}

export default function BookingRow({ b, onClick }:{ b:any; onClick?:()=>void }) {
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const pill = b.status==='completed'?'bg-green-100 text-green-700':
               b.status==='assigned' ?'bg-blue-100 text-blue-700':
               b.status==='cancelled'?'bg-rose-100 text-rose-700':'bg-gray-100 text-gray-700';
  const when = b.booking_type==='instant'
    ? 'Instant (arrive ~10 mins)'
    : `${b.scheduled_date ?? ''} ${b.scheduled_time?.slice(0,5) ?? ''}`.trim();

  async function confirmBooking(e: React.MouseEvent) {
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "assigned", confirmed_at: new Date().toISOString() })
        .eq("id", b.id);
      if (error) throw error;
      toast({ title: "Booking confirmed successfully" });
    } catch (err:any) {
      toast({ 
        title: "Failed to confirm booking", 
        description: err.message,
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-pink-50 bg-white shadow p-4 space-y-2 active:scale-[.99] transition cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-pink-100 text-[#ff007a] grid place-items-center">
          <ServiceIcon t={b.service_type}/>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="font-semibold">{prettyService(b.service_type)}</div>
            <span className={`px-2 py-1 rounded-full text-xs ${pill}`}>{b.status}</span>
            {b.status === "pending" && (
              <button
                onClick={confirmBooking}
                disabled={saving}
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#ff007a] text-white text-xs px-3 py-1 disabled:opacity-60 hover:bg-[#e6006a] transition-colors"
                title="Confirm this booking"
              >
                <Check className="h-3.5 w-3.5" /> {saving ? "Confirming..." : "Confirm"}
              </button>
            )}
          </div>
          <div className="text-xs text-gray-600 flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5"/> {when}
          </div>
          <div className="text-sm text-gray-700 mt-1">
            {b.community} • {b.flat_no}
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
            <Phone className="h-3.5 w-3.5"/> {b.cust_name} ({b.cust_phone})
            <div className="ml-auto">
              <Timer since={b.created_at} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}