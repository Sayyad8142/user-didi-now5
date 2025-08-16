import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Calendar, User, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const adminTabs = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/admin', label: 'Admin', icon: Calendar },
  { to: '/profile', label: 'Profile', icon: User },
];

export function AdminBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.success('Logged out successfully');
      navigate('/auth');
    } catch (error: any) {
      toast.error(error.message || 'Failed to logout');
    }
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-white/70 pb-safe">
      <div className="w-full px-4 py-3">
        <nav className="bg-white/90 shadow-lg border border-pink-100 rounded-2xl px-4 py-2">
          <div className="flex items-center justify-around">
            {adminTabs.map(({ to, label, icon: Icon }) => {
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
            
            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors text-xs text-gray-500 hover:text-gray-700"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}