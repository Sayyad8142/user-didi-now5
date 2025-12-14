import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { auth as firebaseAuth } from '@/lib/firebase';
import { isAdminPhone } from '@/features/auth/isAdmin';

async function getFirebaseUser() {
  return firebaseAuth.currentUser;
}

async function getUserRole() {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  
  try {
    const { data } = await supabase
      .from('profiles')
      .select('is_admin, phone')
      .eq('id', user.uid)
      .single();
    
    const isAdmin = data?.is_admin || isAdminPhone(data?.phone || user.phoneNumber);
    return isAdmin ? 'admin' : 'user';
  } catch {
    // fallback to phone check
    return isAdminPhone(user.phoneNumber) ? 'admin' : 'user';
  }
}

export function AdminRoute({ children }: { children: JSX.Element }) {
  const { data: user } = useQuery({ 
    queryKey: ['firebaseUser'], 
    queryFn: getFirebaseUser, 
    staleTime: 60_000 
  });
  
  const { data: role } = useQuery({ 
    queryKey: ['role'], 
    queryFn: getUserRole, 
    enabled: !!user, 
    staleTime: 60_000 
  });

  if (!user) return <Navigate to="/admin-login" replace />;
  if (role && role !== 'admin') return <Navigate to="/home" replace />;
  return children;
}

export function UserRoute({ children }: { children: JSX.Element }) {
  const { data: user } = useQuery({ 
    queryKey: ['firebaseUser'], 
    queryFn: getFirebaseUser, 
    staleTime: 60_000 
  });
  
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}