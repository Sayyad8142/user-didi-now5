import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfile } from '@/features/profile/useProfile';
import { MapPin, Clock, Sparkles } from 'lucide-react';

export function HomeHeader() {
  const { profile, loading } = useProfile();

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-purple-50 to-pink-50 border border-primary/20 shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent" />
        <CardContent className="relative p-6 flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32 rounded-xl" />
            <Skeleton className="h-5 w-20 rounded-lg" />
          </div>
          <div className="text-right space-y-2">
            <Skeleton className="h-5 w-24 rounded-lg" />
            <Skeleton className="h-4 w-16 rounded-md" />
          </div>
        </CardContent>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-purple-50 to-pink-50 border border-primary/20 shadow-2xl backdrop-blur-sm">
      {/* Decorative elements */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent" />
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/10 to-transparent rounded-full -translate-y-16 translate-x-16" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-200/20 to-transparent rounded-full translate-y-12 -translate-x-12" />
      
      <CardContent className="relative p-6 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
          </div>
          
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-primary via-purple-600 to-pink-600 bg-clip-text text-transparent tracking-tight">
              Didi Now
            </h1>
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-green-600" />
              <p className="text-sm font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full">
                in 10Mins
              </p>
            </div>
          </div>
        </div>
        
        <div className="text-right space-y-2">
          <div className="flex items-center justify-end space-x-2">
            <MapPin className="w-4 h-4 text-primary" />
            <div className="text-sm font-bold text-foreground bg-white/60 px-3 py-1.5 rounded-xl border border-primary/20 shadow-sm">
              {profile?.community || "—"}
            </div>
          </div>
          <div className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">
            Flat {profile?.flat_no || "—"}
          </div>
        </div>
      </CardContent>
    </div>
  );
}