import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface TimerProps {
  since: string; // ISO timestamp
  className?: string;
}

export default function Timer({ since, className = "" }: TimerProps) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const updateElapsed = () => {
      const now = new Date();
      const start = new Date(since);
      const diff = now.getTime() - start.getTime();
      
      const minutes = Math.floor(diff / (1000 * 60));
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) {
        setElapsed(`${days}d ${hours % 24}h`);
      } else if (hours > 0) {
        setElapsed(`${hours}h ${minutes % 60}m`);
      } else if (minutes > 0) {
        setElapsed(`${minutes}m`);
      } else {
        setElapsed('now');
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [since]);

  return (
    <div className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${className}`}>
      <Clock className="h-3 w-3" />
      {elapsed}
    </div>
  );
}