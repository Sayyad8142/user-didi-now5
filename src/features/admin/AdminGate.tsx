import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert } from 'lucide-react';

interface AdminGateProps {
  children: React.ReactNode;
}

interface Profile {
  id: string;
  full_name: string;
  phone: string;
}

export function AdminGate({ children }: AdminGateProps) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Fetch user profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          setError('Failed to load profile');
          setLoading(false);
          return;
        }

        setProfile(profileData);
      } catch (err) {
        console.error('Error:', err);
        setError('An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      checkAdminAccess();
    }
  }, [user, authLoading]);

  // Show loading while checking auth and profile
  if (authLoading || loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to auth if not authenticated
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Show error if profile fetch failed
  if (error || !profile) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <ShieldAlert className="w-12 h-12 mx-auto text-destructive mb-2" />
            <CardTitle>Access Error</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              {error || 'Unable to verify admin access'}
            </p>
            <Button asChild>
              <a href="/home">Go to Home</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if phone is in admin whitelist
  const adminPhonesEnv = import.meta.env.VITE_ADMIN_PHONES || '';
  const adminPhones = adminPhonesEnv.split(',').map(phone => phone.trim());
  
  // Normalize phone to E.164 format
  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length === 12) {
      return `+${digits}`;
    }
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    return phone;
  };

  const normalizedProfilePhone = normalizePhone(profile.phone);
  const isAuthorized = adminPhones.some(adminPhone => {
    const normalizedAdminPhone = normalizePhone(adminPhone);
    return normalizedProfilePhone === normalizedAdminPhone;
  });

  // Show unauthorized message if not in whitelist
  if (!isAuthorized) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <ShieldAlert className="w-12 h-12 mx-auto text-destructive mb-2" />
            <CardTitle>Not Authorized</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              You don't have permission to access the admin console.
            </p>
            <p className="text-sm text-muted-foreground">
              Phone: {profile.phone}
            </p>
            <Button asChild>
              <a href="/home">Go to Home</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User is authorized, render admin content
  return <>{children}</>;
}