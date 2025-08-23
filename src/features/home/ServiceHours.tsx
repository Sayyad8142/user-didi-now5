import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { isOpenNow, getOpenStatusText } from './time';

export function ServiceHours() {
  const isOpen = isOpenNow();
  
  if (!isOpen) {
    // Closed state - hanging board design
    return (
      <Card className="shadow-card border-red-200 bg-gradient-to-br from-red-500 to-red-600 relative overflow-hidden">
        {/* Hanging chain effect */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2">
          <div className="w-0.5 h-4 bg-gray-300"></div>
          <div className="w-2 h-2 bg-gray-300 rounded-full -mt-1 -ml-0.5"></div>
        </div>
        
        <CardContent className="p-4 text-center text-white">
          <div className="mb-2">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-white" />
          </div>
          
          <div className="space-y-1">
            <h3 className="text-lg font-bold italic transform -rotate-1">Sorry We're</h3>
            <h2 className="text-2xl font-black tracking-wider transform rotate-1">CLOSED</h2>
          </div>
          
          <div className="mt-3 pt-3 border-t border-white/30">
            <p className="text-sm font-medium text-white/90">
              {getOpenStatusText()}
            </p>
            <p className="text-xs text-white/70 mt-1">
              Service Hours: 6AM - 7PM Daily
            </p>
          </div>
          
          {/* Decorative corner elements */}
          <div className="absolute top-2 left-2 w-3 h-3 border-2 border-white/40 rounded-full"></div>
          <div className="absolute top-2 right-2 w-3 h-3 border-2 border-white/40 rounded-full"></div>
          <div className="absolute bottom-2 left-2 w-3 h-3 border-2 border-white/40 rounded-full"></div>
          <div className="absolute bottom-2 right-2 w-3 h-3 border-2 border-white/40 rounded-full"></div>
        </CardContent>
      </Card>
    );
  }

  // Open state - original design
  return (
    <Card className="shadow-card border-green-200 bg-gradient-to-r from-green-50 to-green-100">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
          <Clock className="w-6 h-6 text-green-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">Service Hours</h3>
          <p className="text-sm font-medium text-green-600">6AM - 7PM Daily</p>
          <p className="text-xs text-green-700 mt-1 font-medium">
            ✓ Open now
          </p>
        </div>
      </CardContent>
    </Card>
  );
}