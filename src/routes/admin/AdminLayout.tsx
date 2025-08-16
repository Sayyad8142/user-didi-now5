import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function AdminLayout() {
  return (
    <div className="min-h-screen gradient-bg">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-center mb-2">
            <span className="text-foreground">Didi Now</span>
            <span className="mx-2">—</span>
            <span style={{ color: '#ff007a' }}>Admin</span>
          </h1>
          <p className="text-center text-muted-foreground">
            Administrative Console
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          <Card className="bg-card/80 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                Live Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Live Queue coming soon
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 rounded-lg bg-primary/10">
                  <div className="text-2xl font-bold text-primary">-</div>
                  <div className="text-sm text-muted-foreground">Active Bookings</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-secondary/10">
                  <div className="text-2xl font-bold text-secondary">-</div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-accent/10">
                  <div className="text-2xl font-bold text-accent">-</div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/20">
                  <div className="text-2xl font-bold text-muted-foreground">-</div>
                  <div className="text-sm text-muted-foreground">Total Users</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}