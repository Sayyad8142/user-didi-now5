import { useState, useEffect } from "react";
import { Clock, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface WorkerAvailabilityTimerProps {
  workerId: string;
  workerName: string;
  assignedAt: string; // ISO string of when worker was assigned
  durationMinutes?: number; // Default 30 minutes
  className?: string;
}

export function WorkerAvailabilityTimer({ 
  workerId, 
  workerName, 
  assignedAt, 
  durationMinutes = 30,
  className 
}: WorkerAvailabilityTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const assignedTime = new Date(assignedAt).getTime();
      const now = Date.now();
      const elapsed = now - assignedTime;
      const totalDuration = durationMinutes * 60 * 1000; // Convert to milliseconds
      const remaining = Math.max(0, totalDuration - elapsed);
      
      setTimeRemaining(remaining);
      setIsCompleted(remaining === 0);
    };

    // Update immediately
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [assignedAt, durationMinutes]);

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getProgress = () => {
    const totalDuration = durationMinutes * 60 * 1000;
    const elapsed = totalDuration - timeRemaining;
    return Math.min(100, (elapsed / totalDuration) * 100);
  };

  const getProgressColor = () => {
    const progress = getProgress();
    if (isCompleted) return "bg-gradient-to-r from-green-500 to-emerald-500";
    if (progress >= 80) return "bg-gradient-to-r from-amber-400 to-orange-500";
    if (progress >= 60) return "bg-gradient-to-r from-blue-400 to-blue-500";
    return "bg-gradient-to-r from-purple-400 to-pink-500";
  };

  const getBgColor = () => {
    if (isCompleted) return "bg-green-50 border-green-200";
    const progress = getProgress();
    if (progress >= 80) return "bg-amber-50 border-amber-200";
    if (progress >= 60) return "bg-blue-50 border-blue-200";
    return "bg-purple-50 border-purple-200";
  };

  return (
    <div className={cn(
      "rounded-xl border-2 p-3 transition-all duration-300",
      getBgColor(),
      isCompleted && "animate-pulse",
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isCompleted ? (
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          ) : (
            <Clock className="w-4 h-4 text-gray-600" />
          )}
          <span className="text-sm font-semibold text-gray-900 truncate">
            {workerName}
          </span>
        </div>
        
        <Badge 
          variant="secondary" 
          className={cn(
            "text-xs font-bold",
            isCompleted 
              ? "bg-green-100 text-green-800" 
              : "bg-white/80 text-gray-700"
          )}
        >
          {isCompleted ? "AVAILABLE" : formatTime(timeRemaining)}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="relative h-2 bg-gray-200/60 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-500 rounded-full",
              getProgressColor()
            )}
            style={{ width: `${getProgress()}%` }}
          />
        </div>
        
        <div className="flex justify-between text-xs text-gray-600">
          <span className="font-medium">
            {isCompleted ? "Ready for next booking" : "Working..."}
          </span>
          <span>
            {Math.round(getProgress())}% complete
          </span>
        </div>
      </div>
    </div>
  );
}