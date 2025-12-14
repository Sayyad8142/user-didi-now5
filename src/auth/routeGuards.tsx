import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isAdminPhone } from '@/features/auth/isAdmin';

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function getUserRole() {
  const session = await getSession();
  if (!session?.user) return null;
  
  try {
    const { data } = await supabase
      .from('profiles')
      .select('is_admin, phone')
      .eq('id', session.user.id)
      .single();
    
    const isAdmin = data?.is_admin || isAdminPhone(data?.phone || session.user.phone);
    return isAdmin ? 'admin' : 'user';
  } catch {
    // fallback to phone check
    return isAdminPhone(session.user.phone) ? 'admin' : 'user';
  }
}

export function AdminRoute({ children }: { children: JSX.Element }) {
  const { data: session } = useQuery({ 
    queryKey: ['session'], 
    queryFn: getSession, 
    staleTime: 60_000 
  });
  
  const { data: role } = useQuery({ 
    queryKey: ['role'], 
    queryFn: getUserRole, 
    enabled: !!session?.user, 
    staleTime: 60_000 
  });

  if (!session?.user) return <Navigate to="/admin-login" replace />;
  if (role && role !== 'admin') return <Navigate to="/home" replace />;
  return children;
}

export function UserRoute({ children }: { children: JSX.Element }) {
  const { data: session } = useQuery({ 
    queryKey: ['session'], 
    queryFn: getSession, 
    staleTime: 60_000 
  });
  
  if (!session?.user) return <Navigate to="/auth" replace />;
  return children;
}