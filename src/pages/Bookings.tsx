import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock } from 'lucide-react';

export default function Bookings() {
  return (
    <div className="min-h-screen gradient-bg pb-24">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">My Bookings</h1>
          <p className="text-muted-foreground">Track your service requests</p>
        </div>

        <Card className="shadow-card border-pink-50">
          <CardHeader className="text-center py-8">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <CardTitle className="text-muted-foreground font-medium">
              No bookings yet
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center pb-8">
            <p className="text-sm text-muted-foreground mb-4">
              When you book a service, it will appear here
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Book services from the Home tab</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}