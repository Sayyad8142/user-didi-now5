import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Settings, MessageSquare, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const adminTabs = [
  { to: '/admin', label: 'Dashboard', icon: BarChart3 },
  { to: '/admin/bookings', label: 'Bookings', icon: Calendar },
  { to: '/admin/chat', label: 'Messages', icon: MessageSquare },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminBottomNav() {
  const location = useLocation();

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 backdrop-blur-xl pb-safe">
      <div className="w-full px-6 py-4">
        <nav className="bg-white/80 backdrop-blur-xl shadow-2xl border border-white/30 rounded-3xl px-2 py-2">
          <div className="flex items-center justify-around">
            {adminTabs.map(({ to, label, icon: Icon }) => {
              const isActive = location.pathname === to;
              
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex flex-col items-center gap-2 px-4 py-3 rounded-2xl transition-all duration-300 text-xs min-w-[60px] hover:scale-105",
                    isActive 
                      ? "bg-gradient-to-r from-pink-100 to-purple-100 text-pink-600 font-bold shadow-lg scale-105" 
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <div className={cn(
                    "relative transition-all duration-300"
                  )}>
                    <Icon className={cn(
                      "w-6 h-6 transition-all duration-300",
                      isActive && "scale-110"
                    )} />
                    {isActive && (
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-pink-500 rounded-full"></div>
                    )}
                  </div>
                  <span className={cn(
                    "transition-all duration-300",
                    isActive ? "font-bold" : "font-medium"
                  )}>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}