import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function getIsAdmin() {
  const session = await getSession();
  if (!session?.user) return null;
  
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', session.user.id)
    .single();
  
  return data?.is_admin === true;
}

export function AdminRoute({ children }: { children: JSX.Element }) {
  const { data: session } = useQuery({ 
    queryKey: ['session'], 
    queryFn: getSession, 
    staleTime: 60_000 
  });
  
  const { data: isAdmin } = useQuery({ 
    queryKey: ['isAdmin'], 
    queryFn: getIsAdmin, 
    enabled: !!session?.user, 
    staleTime: 60_000 
  });

  if (!session?.user) return <Navigate to="/admin-login" replace />;
  if (isAdmin === false) return <Navigate to="/home" replace />;
  
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