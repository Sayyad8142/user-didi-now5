import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface HolidayBannerProps {
  message: string;
}

export function HolidayBanner({ message }: HolidayBannerProps) {
  return (
    <Alert className="border-amber-200 bg-amber-50">
      <AlertCircle className="h-5 w-5 text-amber-600" />
      <AlertTitle className="text-amber-900 font-semibold">Service Temporarily Unavailable</AlertTitle>
      <AlertDescription className="text-amber-800 mt-2">
        {message}
      </AlertDescription>
    </Alert>
  );
}
