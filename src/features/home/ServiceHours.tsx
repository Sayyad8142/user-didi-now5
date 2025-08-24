import React from 'react';
import { Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isOpenNow, getOpenStatusText } from './time';

export function ServiceHours() {
  const isOpen = isOpenNow();
  
  return (
    <Card className={`shadow-card border transition-all duration-500 ${
      isOpen 
        ? "border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50" 
        : "border-red-200 bg-gradient-to-r from-red-50 to-rose-50"
    }`}>
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ${
          isOpen 
            ? "bg-emerald-100 animate-pulse" 
            : "bg-red-100"
        }`}>
          {isOpen ? (
            <Clock className="w-6 h-6 text-emerald-600 animate-spin" style={{ animationDuration: '3s' }} />
          ) : (
            <div className="relative">
              <Clock className="w-6 h-6 text-red-600" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse">
                <AlertCircle className="w-3 h-3 text-white" />
              </div>
            </div>
          )}
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-foreground">Service Hours</h3>
            <Badge 
              variant={isOpen ? "default" : "destructive"} 
              className={`text-xs font-medium transition-all duration-300 ${
                isOpen 
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 animate-pulse" 
                  : "bg-red-100 text-red-700 hover:bg-red-200"
              }`}
            >
              {isOpen ? (
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Open Now
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Closed
                </div>
              )}
            </Badge>
          </div>
          
          <p className={`text-sm font-medium transition-colors duration-300 ${
            isOpen ? "text-emerald-600" : "text-red-600"
          }`}>
            6AM - 7PM Daily
          </p>
          
          {!isOpen && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground animate-fade-in">
                {getOpenStatusText()}
              </p>
              <div className="flex items-center gap-1 text-xs text-red-600">
                <div className="w-1 h-1 bg-red-500 rounded-full animate-ping" />
                <span className="animate-pulse">Service temporarily unavailable</span>
              </div>
            </div>
          )}
          
          {isOpen && (
            <div className="mt-1">
              <div className="flex items-center gap-1 text-xs text-emerald-600">
                <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                <span>Ready to serve you!</span>
              </div>
            </div>
          )}
        </div>
        
        {/* Visual indicator */}
        <div className={`w-3 h-3 rounded-full transition-all duration-500 ${
          isOpen 
            ? "bg-emerald-400 shadow-lg shadow-emerald-400/50 animate-pulse" 
            : "bg-red-400 shadow-lg shadow-red-400/50"
        }`}>
          {!isOpen && (
            <div className="absolute w-3 h-3 bg-red-400 rounded-full animate-ping" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}