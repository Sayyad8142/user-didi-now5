import { useEffect, useMemo, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";

interface SLAClockProps {
  createdAt: string;
  slaMinutes: number;
  pending: boolean;
}

export function SLAClock({ createdAt, slaMinutes, pending }: SLAClockProps) {
  const [now, setNow] = useState(Date.now());
  
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  
  const createdMs = useMemo(() => new Date(createdAt).getTime(), [createdAt]);
  const elapsedMs = Math.max(0, now - createdMs);
  const slaMs = slaMinutes * 60 * 1000;
  const overdue = pending && elapsedMs > slaMs;
  
  const minutes = Math.floor(elapsedMs / 60000);
  const seconds = Math.floor((elapsedMs % 60000) / 1000).toString().padStart(2, '0');
  const progress = Math.min(100, Math.round((elapsedMs / slaMs) * 100));

  if (!pending) return null;

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 text-xs ${
        overdue ? "text-red-600 font-semibold" : "text-gray-600"
      }`}>
        <Clock className="h-3 w-3" />
        <span>{minutes}:{seconds}</span>
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
          overdue 
            ? "bg-red-100 text-red-700" 
            : "bg-gray-100 text-gray-700"
        }`}>
          {overdue && <AlertTriangle className="h-3 w-3" />}
          {overdue ? "OVERDUE" : "SLA"}
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${
            overdue 
              ? "bg-red-500 animate-pulse" 
              : progress > 80 
                ? "bg-amber-500" 
                : "bg-emerald-500"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}