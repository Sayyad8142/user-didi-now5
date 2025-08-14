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
    <div className="fixed bottom-0 inset-x-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-white/70 pb-safe">
      <div className="max-w-md mx-auto px-4 py-3">
        <nav className="bg-white/90 shadow-lg border border-pink-100 rounded-2xl px-4 py-2">
          <div className="flex items-center justify-around">
            {tabs.map(({ to, label, icon: Icon }) => {
              const isActive = location.pathname === to;
              
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors text-xs",
                    isActive 
                      ? "bg-pink-50 text-[#ff007a] font-medium" 
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}