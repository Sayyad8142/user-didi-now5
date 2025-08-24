import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { isOpenNow, getOpenStatusText } from './time';
import ThreeDAlarmClock from '@/components/ThreeDAlarmClock';

export function ServiceHours() {
  const isOpen = isOpenNow();
  const now = new Date();
  const currentHour = now.getHours();
  
  const getStatusMessage = () => {
    if (isOpen) {
      return "We're Open Now!";
    } else if (currentHour < 6) {
      return "We're Closed Now";
    } else {
      return "We're Closed Now";
    }
  };

  const getSubMessage = () => {
    if (isOpen) {
      return "Ready to serve you until 7:00 PM";
    } else if (currentHour < 6) {
      return "Will be back at 6:00 AM";
    } else {
      return "Will be back at 6:00 AM tomorrow";
    }
  };
  
  return (
    <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-gray-50 overflow-hidden">
      <CardContent className="p-0">
        {/* 3D Alarm Clock */}
        <ThreeDAlarmClock isOpen={isOpen} />
        
        {/* Status Text */}
        <div className="p-6 text-center">
          <h2 className={`text-2xl font-bold mb-2 transition-colors duration-300 ${
            isOpen ? 'text-green-600' : 'text-red-500'
          }`}>
            {getStatusMessage()}
          </h2>
          
          <p className="text-gray-600 mb-3">
            {getSubMessage()}
          </p>
          
          <div className="text-sm text-gray-500 bg-gray-100 rounded-full px-4 py-2 inline-block">
            Service Hours: 6:00 AM - 7:00 PM Daily
          </div>
          
          {!isOpen && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
              <span className="text-sm text-red-500 font-medium">
                Service Currently Unavailable
              </span>
              <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
            </div>
          )}
          
          {isOpen && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm text-green-600 font-medium">
                Ready to Accept Your Booking
              </span>
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}