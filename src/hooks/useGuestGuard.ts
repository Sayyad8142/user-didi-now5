import { useNavigate } from 'react-router-dom';
import { isGuest } from '@/lib/guest';
import { useToast } from '@/hooks/use-toast';

export function useGuestGuard() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const requireSignIn = (): boolean => {
    if (isGuest()) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to access this feature',
        variant: 'default',
      });
      navigate('/auth', { replace: true });
      return false;
    }
    return true;
  };

  return { requireSignIn };
}