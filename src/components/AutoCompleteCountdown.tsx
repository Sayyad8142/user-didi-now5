import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface AutoCompleteCountdownProps {
  autoCompleteAt: string | null;
  className?: string;
}

export default function AutoCompleteCountdown({ autoCompleteAt, className = "" }: AutoCompleteCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (!autoCompleteAt) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const target = new Date(autoCompleteAt).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft('Completing now...');
        return;
      }

      const minutes = Math.floor(diff / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (minutes > 0) {
        setTimeLeft(`Completing in ${minutes}m`);
      } else {
        setTimeLeft(`Completing in ${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [autoCompleteAt]);

  if (!autoCompleteAt || !timeLeft) return null;

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium ${className}`}>
      <Clock className="h-3 w-3" />
      {timeLeft}
    </div>
  );
}