import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfile } from '@/features/profile/useProfile';

export function HomeHeader() {
  const { profile, loading } = useProfile();

  if (loading) {
    return (
      <Card className="shadow-card border-pink-50">
        <CardContent className="p-4 flex justify-between items-center">
          <div>
            <Skeleton className="h-6 w-24 mb-1" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="text-right">
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-4 w-12" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card border-pink-50">
      <CardContent className="p-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-primary">Didi Now</h1>
          <p className="text-muted-foreground text-sm">in 10Mins</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-foreground">
            {profile?.community || "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {profile?.flat_no || "—"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}