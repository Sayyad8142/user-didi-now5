import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface HomeHeaderProps {
  profile: {
    full_name?: string;
    phone?: string;
    community?: string;
  } | null;
}

export function HomeHeader({ profile }: HomeHeaderProps) {
  const getLastFourDigits = (phone?: string) => {
    if (!phone) return "—";
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : "—";
  };

  return (
    <Card className="shadow-card border-pink-50">
      <CardContent className="p-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-primary">Didi Now</h1>
          <p className="text-muted-foreground text-sm">in 10Mins</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-foreground">
            {profile?.community || "—"}
          </p>
          <p className="text-sm text-muted-foreground">
            {getLastFourDigits(profile?.phone)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}