import { Phone, CalendarClock, Sparkles, ChefHat, ShowerHead } from "lucide-react";

function ServiceIcon({ t}:{t:string}) {
  return t==='cook' ? <ChefHat className="h-5 w-5"/> :
         t==='bathroom_cleaning' ? <ShowerHead className="h-5 w-5"/> :
         <Sparkles className="h-5 w-5"/>;
}

export function prettyService(t:string){
  return t==='cook'?'Cook Service':(t==='bathroom_cleaning'?'Bathroom Cleaning':'Maid Service');
}

export default function BookingRow({ b, onClick }:{ b:any; onClick?:()=>void }) {
  const pill = b.status==='completed'?'bg-green-100 text-green-700':
               b.status==='assigned' ?'bg-blue-100 text-blue-700':
               b.status==='cancelled'?'bg-rose-100 text-rose-700':'bg-gray-100 text-gray-700';
  const when = b.booking_type==='instant'
    ? 'Instant (arrive ~10 mins)'
    : `${b.scheduled_date ?? ''} ${b.scheduled_time?.slice(0,5) ?? ''}`.trim();

  return (
    <button onClick={onClick} className="w-full text-left rounded-2xl border border-pink-50 bg-white shadow p-4 space-y-2 active:scale-[.99] transition">
      <div className="flex items-center gap-2">
        <div className="h-10 w-10 rounded-xl bg-pink-100 text-[#ff007a] grid place-items-center">
          <ServiceIcon t={b.service_type}/>
        </div>
        <div className="flex-1">
          <div className="font-semibold">{prettyService(b.service_type)}</div>
          <div className="text-xs text-gray-600 flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5"/> {when}
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs ${pill}`}>{b.status}</span>
      </div>
      <div className="text-sm text-gray-700">
        {b.community} • {b.flat_no}
      </div>
      <div className="text-xs text-gray-500 flex items-center gap-2">
        <Phone className="h-3.5 w-3.5"/> {b.cust_name} ({b.cust_phone})
      </div>
    </button>
  );
}