import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Calendar, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/bookings', label: 'Bookings', icon: Calendar },
  { to: '/profile', label: 'Profile', icon: User },
];

export function BottomTabs() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pb-safe">
      <div className="max-w-md mx-auto px-4 py-2">
        <div className="bg-card/95 backdrop-blur-lg shadow-[0_-4px_20px_rgba(0,0,0,0.08)] border border-border/40 rounded-2xl px-2 py-1.5">
          <div className="flex items-center justify-around">
            {tabs.map(({ to, label, icon: Icon }) => {
              const isActive = location.pathname === to;

              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all duration-200 text-xs font-medium",
                    isActive
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
