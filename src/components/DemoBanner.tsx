import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

export function DemoBanner() {
  return (
    <div className="px-4 py-2">
      <Alert className="border-orange-200 bg-orange-50">
        <Info className="h-4 w-4 text-orange-600" />
        <AlertDescription className="text-orange-800 text-sm">
          You're in Demo Mode. Data is for demonstration only.
        </AlertDescription>
      </Alert>
    </div>
  );
}