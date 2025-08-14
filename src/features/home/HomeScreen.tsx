import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeHeader } from './HomeHeader';
import { HeroCarousel } from './HeroCarousel';
import { ServicesRow } from './ServicesRow';
import { ServiceHours } from './ServiceHours';
import { CommunityWorkersCard } from './CommunityWorkersCard';
import { ChooseTypeSheet } from './ChooseTypeSheet';

interface Profile {
  id: string;
  full_name: string;
  phone: string;
  community: string;
  flat_no: string;
}

export function HomeScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<'maid' | 'cook' | 'bathroom_cleaning' | null>(null);
  
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    async function fetchProfile() {
      if (!user?.id) {
        navigate('/auth');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching profile:', error);
          toast({
            title: 'Error',
            description: 'Failed to load profile',
            variant: 'destructive',
          });
          return;
        }

        if (!data) {
          navigate('/auth');
          return;
        }

        setProfile(data);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [user, navigate, toast]);

  const handleServiceSelect = (service: 'maid' | 'cook' | 'bathroom_cleaning') => {
    setSelectedService(service);
    setSheetOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg">
        <div className="max-w-md mx-auto px-4 py-3 space-y-4">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <div className="flex gap-4">
            <Skeleton className="h-24 flex-1 rounded-2xl" />
            <Skeleton className="h-24 flex-1 rounded-2xl" />
            <Skeleton className="h-24 flex-1 rounded-2xl" />
          </div>
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg pb-20">
      <div className="max-w-md mx-auto px-4 py-3 space-y-4">
        <HomeHeader profile={profile} />
        <HeroCarousel />
        <ServicesRow onServiceSelect={handleServiceSelect} />
        <ServiceHours />
        <CommunityWorkersCard onServiceSelect={handleServiceSelect} />
      </div>

      <ChooseTypeSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        service={selectedService}
      />
    </div>
  );
}