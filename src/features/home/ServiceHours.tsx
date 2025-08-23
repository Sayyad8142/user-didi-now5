import React from 'react';
import { Clock, Moon, Sun } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isOpenNow, getOpenStatusText } from './time';

export function ServiceHours() {
  const isOpen = isOpenNow();
  
  if (!isOpen) {
    // Closed state - elegant and classic design
    return (
      <Card className="shadow-sm border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 relative">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center border-2 border-slate-300">
              <Moon className="w-4 h-4 text-slate-600" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-slate-800 text-sm">Service Hours</h3>
                <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs px-2 py-0.5 font-medium">
                  Closed
                </Badge>
              </div>
              
              <p className="text-xs text-slate-600 leading-relaxed">
                6AM - 7PM Daily
              </p>
              
              <div className="mt-2 pt-2 border-t border-slate-200">
                <p className="text-xs font-medium text-primary">
                  {getOpenStatusText()}
                </p>
              </div>
            </div>
          </div>
          
          {/* Subtle decorative accent */}
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20"></div>
        </CardContent>
      </Card>
    );
  }

  // Open state - classic design with brand colors
  return (
    <Card className="shadow-sm border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
            <Sun className="w-4 h-4 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-slate-800 text-sm">Service Hours</h3>
              <Badge className="bg-primary text-white text-xs px-2 py-0.5 font-medium">
                Open
              </Badge>
            </div>
            
            <p className="text-xs text-slate-600 leading-relaxed">
              6AM - 7PM Daily
            </p>
            
            <div className="mt-2 pt-2 border-t border-primary/20">
              <p className="text-xs font-medium text-primary">
                Available now
              </p>
            </div>
          </div>
        </div>
        
        {/* Decorative accent */}
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/30 via-primary to-primary/30"></div>
      </CardContent>
    </Card>
  );
}