import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthCard } from '@/components/auth/AuthCard';
import { isDemo } from '@/lib/demo';
import { isGuest } from '@/lib/guest';

export default function Auth() {
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isDemo() || isGuest()) {
      navigate('/home', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <AuthCard />
    </div>
  );
}