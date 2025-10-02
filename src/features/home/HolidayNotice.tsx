import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export function HolidayNotice() {
  return (
    <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
      <CardContent className="flex items-start gap-3 pt-4">
        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
            Store Closed Today
          </h3>
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Today store is closed due to public holiday. We are not accepting bookings for today.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
